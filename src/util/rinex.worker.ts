/**
 * Stateful Web Worker for all heavy RINEX computation.
 *
 * Keeps obs + nav data in memory for incremental merging, instant QA,
 * instant export, and automatic orbit recomputation.
 *
 * Observation values are stored in Float64Arrays (NaN = missing) indexed
 * by a per-system obs code registry. This uses ~10-15x less memory than
 * nested Maps, allowing 24h 1s multi-GNSS files without OOM.
 *
 * Protocol:
 *   add-obs   — parse new obs files, merge into cache, run QA, recompute positions
 *   add-nav   — parse new nav files, merge into cache, recompute positions
 *   export-obs — write RINEX obs from cache
 *   export-nav — write RINEX nav from cache
 *   clear     — reset all state
 */

import { parseRinexStream } from './rinex';
import type { RinexHeader, RinexStats } from './rinex';
import { parseNavFile } from './nav';
import type { NavResult, Ephemeris } from './nav';
import { computeAllPositions, navTimesFromEph } from './orbit';
import type { AllPositionsData } from './orbit';
import { CycleSlipAccumulator } from './cycle-slip';
import { CompletenessAccumulator } from './completeness';
import { MultipathAccumulator } from './multipath';
import type { QualityResult } from './quality-analysis';
import { writeRinexObsBlob } from './obs-writer';
import type { CompactEpoch } from './obs-writer';
import { writeRinexNav } from './nav-writer';
import { readFileText } from './read-file-text';
import { compactToGrid, compactToStats, gridTransferables } from './epoch-grid';
import type { EpochGrid } from './epoch-grid';

/* ================================================================== */
/*  Message protocol                                                   */
/* ================================================================== */

// ── Requests ──

export interface AddObsRequest {
  type: 'add-obs';
  files: File[];   // only NEW files (not previously loaded)
}

export interface AddNavRequest {
  type: 'add-nav';
  files: File[];   // only NEW files
}

export interface ExportObsRequest { type: 'export-obs' }
export interface ExportNavRequest { type: 'export-nav'; markerName: string }
export interface ClearRequest { type: 'clear' }

export type WorkerRequest =
  (AddObsRequest | AddNavRequest
  | ExportObsRequest | ExportNavRequest
  | ClearRequest) & { requestId?: number };

// ── Responses ──

export interface ProgressMessage {
  type: 'progress';
  task: string;
  percent: number;
}

export interface AddObsResult {
  type: 'add-obs-result';
  /** Header + stats (no epochs — those are in the grid). */
  header: RinexHeader;
  stats: RinexStats;
  /** Columnar epoch data, transferred zero-copy. */
  grid: EpochGrid;
  qaResult: QualityResult;
  positions: AllPositionsData | null;
  observedPrns: string[][] | null;
}

export interface AddNavResult {
  type: 'add-nav-result';
  navResult: NavResult;
  positions: AllPositionsData | null;
  observedPrns: string[][] | null;
}

export interface ObsExportResult {
  type: 'obs-export-result';
  blob: Blob;
  filename: { markerName: string; startTime: string | null; durationSec: number | null; intervalSec: number | null };
}

export interface NavExportResult {
  type: 'nav-export-result';
  blob: Blob;
  filename: { markerName: string; startTime: string | null; durationSec: number | null };
}

export interface ErrorMessage {
  type: 'error';
  task: string;
  message: string;
}

export type WorkerResponse =
  | ProgressMessage
  | AddObsResult | AddNavResult
  | ObsExportResult | NavExportResult
  | ErrorMessage;

/* ================================================================== */
/*  Worker state                                                       */
/* ================================================================== */

// Observation data — compact storage
let obsHeader: RinexHeader | null = null;
let compactEpochs: CompactEpoch[] = [];
let compactEpochMap = new Map<number, CompactEpoch>();
let sysCodeList = new Map<string, string[]>();       // sys → codes (defines Float64Array index order)
let sysCodeIdx = new Map<string, Map<string, number>>(); // sys → code → index
// Navigation data
let navHeader: NavResult['header'] | null = null;
let navEphemerides: Ephemeris[] = [];

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

let currentRequestId: number | undefined;

function post(msg: WorkerResponse, transferables?: Transferable[]) {
  const out = currentRequestId != null ? { ...msg, requestId: currentRequestId } : msg;
  if (transferables && transferables.length > 0) {
    // Worker postMessage with transferables
    (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(out, transferables);
  } else {
    self.postMessage(out);
  }
}

function progress(task: string, percent: number) {
  post({ type: 'progress', task, percent });
}

/** Build obs types map from code registry (in system order). */
function buildObsTypes(): Map<string, string[]> {
  const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S'];
  const result = new Map<string, string[]>();
  for (const sys of sysOrder) {
    const codes = sysCodeList.get(sys);
    if (codes && codes.length > 0) {
      result.set(sys, [...codes]);
    }
  }
  return result;
}

/**
 * Register an obs code and return its index. If the code already exists,
 * returns the existing index. If it's new, appends it.
 */
function registerCode(sys: string, code: string): number {
  let codeMap = sysCodeIdx.get(sys);
  let codeArr = sysCodeList.get(sys);
  if (!codeMap) {
    codeMap = new Map();
    codeArr = [];
    sysCodeIdx.set(sys, codeMap);
    sysCodeList.set(sys, codeArr);
  }
  let idx = codeMap.get(code);
  if (idx == null) {
    idx = codeArr!.length;
    codeMap.set(code, idx);
    codeArr!.push(code);
  }
  return idx;
}

/** Run QA over all cached compact epochs. */
function replayQA(header: RinexHeader): QualityResult {
  const mpAccum = new MultipathAccumulator(header);
  const csAccum = new CycleSlipAccumulator(header, (time, prn, bands) => {
    mpAccum.notifySlip(time, prn, bands);
  });
  const compAccum = new CompletenessAccumulator(header);

  // Reusable buffer to avoid allocating per sat per epoch
  const valBuf: (number | null)[] = [];

  for (const epoch of compactEpochs) {
    for (const [prn, valArr] of epoch.sats) {
      const sys = prn[0]!;
      const codes = sysCodeList.get(sys)!;
      valBuf.length = codes.length;
      for (let i = 0; i < codes.length; i++) {
        const v = i < valArr.length ? valArr[i]! : NaN;
        valBuf[i] = isNaN(v) ? null : v;
      }
      csAccum.onObservation(epoch.time, prn, codes, valBuf);
      mpAccum.onObservation(epoch.time, prn, codes, valBuf);
      compAccum.onObservation(epoch.time, prn, codes, valBuf);
    }
  }

  return {
    cycleSlips: csAccum.finalize(),
    completeness: compAccum.finalize(),
    multipath: mpAccum.finalize(),
  };
}

/**
 * Compute positions if both obs and nav are cached.
 * Returns null if either side is missing.
 */
function tryComputePositions(): { positions: AllPositionsData; observedPrns: string[][] } | null {
  if (compactEpochs.length === 0 || navEphemerides.length === 0 || !obsHeader) return null;

  const maxEpochs = 500;
  const step = Math.max(1, Math.ceil(compactEpochs.length / maxEpochs));
  const times: number[] = [];
  const prnsPerEpoch: string[][] = [];
  for (let i = 0; i < compactEpochs.length; i += step) {
    const e = compactEpochs[i]!;
    times.push(e.time);
    prnsPerEpoch.push([...e.sats.keys()]);
  }

  const rxPos = obsHeader.approxPosition;
  const validRx = rxPos && (rxPos[0] !== 0 || rxPos[1] !== 0 || rxPos[2] !== 0) ? rxPos : undefined;
  const positions = computeAllPositions(navEphemerides, times, validRx);
  return { positions, observedPrns: prnsPerEpoch };
}

/** Compute nav-only positions (no obs epochs for time sampling). */
function computeNavOnlyPositions(): AllPositionsData {
  const times = navTimesFromEph(navEphemerides);
  return computeAllPositions(navEphemerides, times);
}

/* ================================================================== */
/*  Handlers                                                           */
/* ================================================================== */

async function handleAddObs(msg: AddObsRequest) {
  // Track which systems got new codes so we can grow existing arrays
  const grownSystems = new Set<string>();

  // Parse only the new files, merge compact data into existing cache.
  // workerMode = true: skip EpochSummary construction + setTimeout yields.
  let hasData = false;
  for (let i = 0; i < msg.files.length; i++) {
    const file = msg.files[i]!;
    const r = await parseRinexStream(file, (p) => {
      const overall = (i + p / 100) / msg.files.length * 100;
      progress('add-obs', Math.round(overall));
    }, undefined, (time, prn, codes, values) => {
      const sys = prn[0]!;

      // Register obs codes, detect growth
      const prevLen = sysCodeList.get(sys)?.length ?? 0;
      for (const code of codes) registerCode(sys, code);
      const stride = sysCodeList.get(sys)!.length;
      if (stride > prevLen) grownSystems.add(sys);

      // Get or create epoch
      let epoch = compactEpochMap.get(time);
      if (!epoch) {
        epoch = { time, sats: new Map() };
        compactEpochMap.set(time, epoch);
      }

      // Get or create satellite values array
      let valArr = epoch.sats.get(prn);
      if (!valArr || valArr.length < stride) {
        const newArr = new Float64Array(stride);
        newArr.fill(NaN);
        if (valArr) newArr.set(valArr);
        valArr = newArr;
        epoch.sats.set(prn, valArr);
      }

      // Store observation values
      const codeMap = sysCodeIdx.get(sys)!;
      for (let j = 0; j < codes.length; j++) {
        const val = values[j];
        if (val != null) valArr[codeMap.get(codes[j]!)!] = val;
      }
    }, true /* workerMode */);

    // Keep header from first file (or merge obsTypes across files)
    if (!obsHeader) {
      obsHeader = r.header;
    } else {
      // Merge obsTypes from subsequent files
      for (const [sys, types] of Object.entries(r.header.obsTypes)) {
        if (!obsHeader.obsTypes[sys]) obsHeader.obsTypes[sys] = [...types];
        else {
          const set = new Set(obsHeader.obsTypes[sys]);
          for (const t of types) set.add(t);
          obsHeader.obsTypes[sys] = [...set];
        }
      }
    }
    hasData = true;
  }

  if (!hasData || compactEpochMap.size === 0) {
    post({ type: 'error', task: 'add-obs', message: 'No valid observation epochs found in the file(s).' });
    return;
  }

  // Grow any undersized Float64Arrays for systems that got new codes
  for (const sys of grownSystems) {
    const stride = sysCodeList.get(sys)!.length;
    for (const epoch of compactEpochMap.values()) {
      for (const [prn, valArr] of epoch.sats) {
        if (prn[0] === sys && valArr.length < stride) {
          const newArr = new Float64Array(stride);
          newArr.fill(NaN);
          newArr.set(valArr);
          epoch.sats.set(prn, newArr);
        }
      }
    }
  }

  // Rebuild sorted epoch list
  compactEpochs = [...compactEpochMap.values()].sort((a, b) => a.time - b.time);

  // Build grid + stats directly from compact data (no EpochSummary)
  const grid = compactToGrid(compactEpochs, sysCodeList);
  const stats = compactToStats(compactEpochs, sysCodeList, obsHeader!);
  const transfers = gridTransferables(grid);

  // QA over full dataset
  const qaResult = replayQA(obsHeader!);

  // Auto-compute positions if nav is available
  const posData = tryComputePositions();

  post({
    type: 'add-obs-result',
    header: obsHeader!,
    stats,
    grid,
    qaResult,
    positions: posData?.positions ?? null,
    observedPrns: posData?.observedPrns ?? null,
  }, transfers);
}

async function handleAddNav(msg: AddNavRequest) {
  // Parse only the new files, merge into existing nav state
  for (let i = 0; i < msg.files.length; i++) {
    progress('add-nav', Math.round((i / msg.files.length) * 100));
    const text = await readFileText(msg.files[i]!);
    const nav = parseNavFile(text);
    if (!navHeader) {
      navHeader = nav.header;
    } else {
      for (const [k, v] of Object.entries(nav.header.ionoCorrections)) {
        if (!(k in navHeader.ionoCorrections)) navHeader.ionoCorrections[k] = v;
      }
      if (nav.header.leapSeconds != null && navHeader.leapSeconds == null) {
        navHeader.leapSeconds = nav.header.leapSeconds;
      }
    }
    navEphemerides.push(...nav.ephemerides);
  }

  if (navEphemerides.length === 0 || !navHeader) {
    post({ type: 'error', task: 'add-nav', message: 'No valid navigation data found.' });
    return;
  }

  const navResult: NavResult = { header: navHeader, ephemerides: navEphemerides };

  // Compute positions: use obs epochs if available, otherwise nav-only
  const posData = tryComputePositions();
  const positions = posData?.positions ?? computeNavOnlyPositions();

  post({
    type: 'add-nav-result',
    navResult,
    positions,
    observedPrns: posData?.observedPrns ?? null,
  });
}

async function handleExportObs() {
  if (!obsHeader || compactEpochs.length === 0) {
    post({ type: 'error', task: 'export-obs', message: 'No observation data to export.' });
    return;
  }
  const obsTypes = buildObsTypes();
  const blob = await writeRinexObsBlob(obsHeader, compactEpochs, obsTypes);

  post({
    type: 'obs-export-result', blob,
    filename: {
      markerName: obsHeader.markerName || '',
      startTime: new Date(compactEpochs[0]!.time).toISOString(),
      durationSec: (compactEpochs[compactEpochs.length - 1]!.time - compactEpochs[0]!.time) / 1000,
      intervalSec: compactEpochs.length >= 2
        ? (compactEpochs[1]!.time - compactEpochs[0]!.time) / 1000 : null,
    },
  });
}

function handleExportNav(msg: ExportNavRequest) {
  if (!navHeader || navEphemerides.length === 0) {
    post({ type: 'error', task: 'export-nav', message: 'No navigation data to export.' });
    return;
  }
  const navResult: NavResult = { header: navHeader, ephemerides: navEphemerides };
  const content = writeRinexNav(navResult);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

  let minT: Date | null = null, maxT: Date | null = null;
  for (const eph of navEphemerides) {
    if (!minT || eph.tocDate < minT) minT = eph.tocDate;
    if (!maxT || eph.tocDate > maxT) maxT = eph.tocDate;
  }

  post({
    type: 'nav-export-result', blob,
    filename: {
      markerName: msg.markerName,
      startTime: minT?.toISOString() ?? null,
      durationSec: minT && maxT ? (maxT.getTime() - minT.getTime()) / 1000 : null,
    },
  });
}

function handleClear() {
  obsHeader = null;
  compactEpochs = [];
  compactEpochMap = new Map();
  sysCodeList = new Map();
  sysCodeIdx = new Map();
  navHeader = null;
  navEphemerides = [];
}

/* ================================================================== */
/*  Dispatcher                                                         */
/* ================================================================== */

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  currentRequestId = msg.requestId;
  try {
    switch (msg.type) {
      case 'add-obs': return await handleAddObs(msg);
      case 'add-nav': return await handleAddNav(msg);
      case 'export-obs': return await handleExportObs();
      case 'export-nav': return handleExportNav(msg);
      case 'clear': return handleClear();
    }
  } catch (err: unknown) {
    post({ type: 'error', task: msg.type, message: err instanceof Error ? err.message : 'Worker error' });
  }
};
