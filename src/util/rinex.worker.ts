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
import { WarningAccumulator, EMPTY_WARNINGS } from './rinex-warnings';
import type { RinexWarnings } from './rinex-warnings';
import { writeRinexObsBlob } from './obs-writer';
import type { CompactEpoch } from './obs-writer';
import { writeRinex2ObsBlob } from './obs-writer-v2';
import { writeRinex4ObsBlob } from './obs-writer-v4';
import { writeObsCsv } from './csv-writer';
import { writeMetadataJson } from './metadata-writer';
import { writeRinexNav } from './nav-writer';
import { readFileText } from './read-file-text';
import { compactToGrid, compactToStats, gridTransferables } from './epoch-grid';
import type { EpochGrid } from './epoch-grid';
import type { FilterState } from './filter-state';
export type { FilterState } from './filter-state';
export { DEFAULT_FILTER } from './filter-state';

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

export interface ApplyFiltersRequest {
  type: 'apply-filters';
  filters: FilterState;
}

export interface HeaderOverrides {
  markerName?: string;
  markerType?: string;
  receiverNumber?: string;
  receiverType?: string;
  receiverVersion?: string;
  antNumber?: string;
  antType?: string;
  approxPosition?: [number, number, number];
  antDelta?: [number, number, number];
  observer?: string;
  agency?: string;
}

export interface RecomputePositionsRequest {
  type: 'recompute-positions';
  rxPos?: [number, number, number];
}

export interface ExportObsRequest {
  type: 'export-obs';
  filters?: FilterState;
  format?: 'rinex3' | 'rinex2' | 'rinex4' | 'csv' | 'json-meta';
  splitInterval?: number | null; // seconds, null = no split
  headerOverrides?: HeaderOverrides;
}
export interface ExportNavRequest { type: 'export-nav'; markerName: string }
export interface ClearRequest { type: 'clear' }

export type WorkerRequest =
  (AddObsRequest | AddNavRequest
  | ApplyFiltersRequest
  | RecomputePositionsRequest
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
  warnings: RinexWarnings;
  positions: AllPositionsData | null;
  observedPrns: string[][] | null;
  /** All PRNs in the dataset, for filter UI. */
  availablePrns: string[];
  /** All obs codes per system, for filter UI. */
  availableCodes: Record<string, string[]>;
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

export interface ApplyFiltersResult {
  type: 'apply-filters-result';
  stats: RinexStats;
  grid: EpochGrid;
  qaResult: QualityResult;
  /** PRNs available in the unfiltered dataset, for filter UI. */
  availablePrns: string[];
  /** Obs codes available in the unfiltered dataset, for filter UI. */
  availableCodes: Record<string, string[]>;
  positions: AllPositionsData | null;
  observedPrns: string[][] | null;
}

export interface RecomputePositionsResult {
  type: 'recompute-positions-result';
  positions: AllPositionsData | null;
  observedPrns: string[][] | null;
}

export interface ErrorMessage {
  type: 'error';
  task: string;
  message: string;
}

export type WorkerResponse =
  | ProgressMessage
  | AddObsResult | AddNavResult
  | ApplyFiltersResult
  | RecomputePositionsResult
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
// Warnings
let cachedWarnings: RinexWarnings = EMPTY_WARNINGS;
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

/** Collect all unique PRNs across all cached epochs (sorted). */
function collectAvailablePrns(): string[] {
  const set = new Set<string>();
  for (const epoch of compactEpochs) {
    for (const prn of epoch.sats.keys()) set.add(prn);
  }
  return [...set].sort();
}

/** Collect obs codes per system from the code registry. */
function collectAvailableCodes(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [sys, codes] of sysCodeList) {
    result[sys] = [...codes];
  }
  return result;
}

/**
 * Apply filters to compact epochs, producing a new filtered array.
 * Non-destructive — original compactEpochs are never modified.
 */
function filterEpochs(filters: FilterState): {
  epochs: CompactEpoch[];
  filteredSysCodeList: Map<string, string[]>;
} {
  const {
    excludedSystems, excludedPrns, excludedSignalTypes, excludedBands,
    timeStart, timeEnd, samplingInterval, sparseThreshold,
    excludedSignalsPerSystem,
  } = filters;

  const exSysSet = new Set(excludedSystems);
  const exPrnSet = new Set(excludedPrns);
  const exSigSet = new Set(excludedSignalTypes);
  const exBandSet = new Set(excludedBands);

  // Per-system signal exclusion sets (2-char suffix like '1C', '5Q')
  const exSigPerSys = new Map<string, Set<string>>();
  if (excludedSignalsPerSystem) {
    for (const [sys, sigs] of Object.entries(excludedSignalsPerSystem)) {
      if (sigs.length > 0) exSigPerSys.set(sys, new Set(sigs));
    }
  }

  // Build filtered code registry (remove excluded signal types, bands, and per-system signals)
  const filteredSysCodeList = new Map<string, string[]>();
  const filteredCodeIdx = new Map<string, Map<string, number>>(); // sys → old code → new index
  for (const [sys, codes] of sysCodeList) {
    if (exSysSet.has(sys)) continue;
    const perSysExcluded = exSigPerSys.get(sys);
    const newCodes: string[] = [];
    const idxMap = new Map<string, number>();
    for (const code of codes) {
      const sigType = code[0]!; // C, L, D, S
      const band = code[1]!;   // 1, 2, 5, etc.
      if (exSigSet.has(sigType)) continue;
      if (exBandSet.has(band)) continue;
      // Per-system signal: match 2-char suffix (band+attribute), e.g. '1C' from 'C1C'
      if (perSysExcluded?.has(code.slice(1))) continue;
      idxMap.set(code, newCodes.length);
      newCodes.push(code);
    }
    if (newCodes.length > 0) {
      filteredSysCodeList.set(sys, newCodes);
      filteredCodeIdx.set(sys, idxMap);
    }
  }

  // Time windowing
  let source = compactEpochs;
  if (timeStart != null || timeEnd != null) {
    source = source.filter(e => {
      if (timeStart != null && e.time < timeStart) return false;
      if (timeEnd != null && e.time > timeEnd) return false;
      return true;
    });
  }

  // Sampling/decimation
  if (samplingInterval != null && samplingInterval > 0 && source.length >= 2) {
    const intervalMs = samplingInterval * 1000;
    const decimated: CompactEpoch[] = [source[0]!];
    let lastTime = source[0]!.time;
    for (let i = 1; i < source.length; i++) {
      if (source[i]!.time - lastTime >= intervalMs - 1) { // -1ms tolerance
        decimated.push(source[i]!);
        lastTime = source[i]!.time;
      }
    }
    source = decimated;
  }

  // PRN and signal filtering
  const hasCodeFilters = exSigSet.size > 0 || exBandSet.size > 0 || exSigPerSys.size > 0;
  const hasPrnFilters = exSysSet.size > 0 || exPrnSet.size > 0;

  let filtered: CompactEpoch[];
  if (!hasPrnFilters && !hasCodeFilters) {
    filtered = source;
  } else {
    filtered = [];
    for (const epoch of source) {
      const newSats = new Map<string, Float64Array>();
      for (const [prn, valArr] of epoch.sats) {
        const sys = prn[0]!;
        if (exSysSet.has(sys) || exPrnSet.has(prn)) continue;

        if (hasCodeFilters) {
          const idxMap = filteredCodeIdx.get(sys);
          if (!idxMap || idxMap.size === 0) continue;
          const newArr = new Float64Array(idxMap.size);
          newArr.fill(NaN);
          for (const [code, newIdx] of idxMap) {
            const origIdx = sysCodeIdx.get(sys)!.get(code)!;
            if (origIdx < valArr.length) newArr[newIdx] = valArr[origIdx]!;
          }
          newSats.set(prn, newArr);
        } else {
          newSats.set(prn, valArr);
        }
      }
      if (newSats.size > 0) {
        filtered.push({ time: epoch.time, sats: newSats });
      }
    }
  }

  // Sparse obs removal: remove codes that appear in < sparseThreshold % of epochs
  if (sparseThreshold > 0 && filtered.length > 0) {
    const minCount = Math.ceil(filtered.length * sparseThreshold / 100);
    // Count occurrences per system per code
    for (const [sys, codes] of filteredSysCodeList) {
      const counts = new Uint32Array(codes.length);
      for (const epoch of filtered) {
        for (const [prn, valArr] of epoch.sats) {
          if (prn[0] !== sys) continue;
          for (let i = 0; i < codes.length && i < valArr.length; i++) {
            if (!isNaN(valArr[i]!)) counts[i]!++;
          }
        }
      }
      const keepIndices: number[] = [];
      const newCodes: string[] = [];
      for (let i = 0; i < codes.length; i++) {
        if (counts[i]! >= minCount) {
          keepIndices.push(i);
          newCodes.push(codes[i]!);
        }
      }
      if (newCodes.length < codes.length) {
        filteredSysCodeList.set(sys, newCodes);
        // Rebuild value arrays for this system
        for (const epoch of filtered) {
          for (const [prn, valArr] of epoch.sats) {
            if (prn[0] !== sys) continue;
            const newArr = new Float64Array(newCodes.length);
            newArr.fill(NaN);
            for (let j = 0; j < keepIndices.length; j++) {
              if (keepIndices[j]! < valArr.length) newArr[j] = valArr[keepIndices[j]!]!;
            }
            epoch.sats.set(prn, newArr);
          }
        }
      }
    }
  }

  return { epochs: filtered, filteredSysCodeList };
}

/** Run QA over given epochs with a given code list. */
function runQA(header: RinexHeader, epochs: CompactEpoch[], codeList: Map<string, string[]>): QualityResult {
  const mpAccum = new MultipathAccumulator(header);
  const csAccum = new CycleSlipAccumulator(header, (time, prn, bands) => {
    mpAccum.notifySlip(time, prn, bands);
  });
  const compAccum = new CompletenessAccumulator(header);

  const valBuf: (number | null)[] = [];
  for (const epoch of epochs) {
    for (const [prn, valArr] of epoch.sats) {
      const sys = prn[0]!;
      const codes = codeList.get(sys)!;
      if (!codes) continue;
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
function tryComputePositions(rxPosOverride?: [number, number, number]): { positions: AllPositionsData; observedPrns: string[][] } | null {
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

  const rxPos = rxPosOverride ?? obsHeader.approxPosition;
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

  // Validation warnings — scan sorted epochs + header
  const warnAccum = new WarningAccumulator();
  warnAccum.checkHeader(obsHeader!);
  if (obsHeader!.interval != null) warnAccum.setInterval(obsHeader!.interval * 1000);
  for (const epoch of compactEpochs) {
    warnAccum.onEpoch(epoch.time, 0); // compact epochs only store flag-0 measurement epochs
    for (const prn of epoch.sats.keys()) warnAccum.onPrn(prn);
  }
  const warnings = warnAccum.finalize();
  cachedWarnings = warnings;

  // Auto-compute positions if nav is available
  const posData = tryComputePositions();

  // Collect available PRNs and codes for filter UI
  const availablePrns = collectAvailablePrns();
  const availableCodes = collectAvailableCodes();

  post({
    type: 'add-obs-result',
    header: obsHeader!,
    stats,
    grid,
    qaResult,
    warnings,
    positions: posData?.positions ?? null,
    observedPrns: posData?.observedPrns ?? null,
    availablePrns,
    availableCodes,
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

function handleApplyFilters(msg: ApplyFiltersRequest) {
  if (!obsHeader || compactEpochs.length === 0) {
    post({ type: 'error', task: 'apply-filters', message: 'No observation data to filter.' });
    return;
  }

  const { epochs: filtered, filteredSysCodeList } = filterEpochs(msg.filters);

  if (filtered.length === 0) {
    post({ type: 'error', task: 'apply-filters', message: 'All data was excluded by the current filters.' });
    return;
  }

  const grid = compactToGrid(filtered, filteredSysCodeList);
  const stats = compactToStats(filtered, filteredSysCodeList, obsHeader!);
  const transfers = gridTransferables(grid);
  const qaResult = runQA(obsHeader!, filtered, filteredSysCodeList);

  // Positions from filtered data
  let posData: { positions: AllPositionsData; observedPrns: string[][] } | null = null;
  if (navEphemerides.length > 0) {
    const maxEpochs = 500;
    const step = Math.max(1, Math.ceil(filtered.length / maxEpochs));
    const times: number[] = [];
    const prnsPerEpoch: string[][] = [];
    for (let i = 0; i < filtered.length; i += step) {
      times.push(filtered[i]!.time);
      prnsPerEpoch.push([...filtered[i]!.sats.keys()]);
    }
    const rxPos = obsHeader!.approxPosition;
    const validRx = rxPos && (rxPos[0] !== 0 || rxPos[1] !== 0 || rxPos[2] !== 0) ? rxPos : undefined;
    posData = { positions: computeAllPositions(navEphemerides, times, validRx), observedPrns: prnsPerEpoch };
  }

  post({
    type: 'apply-filters-result',
    stats,
    grid,
    qaResult,
    availablePrns: collectAvailablePrns(),
    availableCodes: collectAvailableCodes(),
    positions: posData?.positions ?? null,
    observedPrns: posData?.observedPrns ?? null,
  }, transfers);
}

function applyHeaderOverrides(header: RinexHeader, overrides: HeaderOverrides): RinexHeader {
  const h = { ...header };
  if (overrides.markerName !== undefined) h.markerName = overrides.markerName;
  if (overrides.markerType !== undefined) h.markerType = overrides.markerType;
  if (overrides.receiverNumber !== undefined) h.receiverNumber = overrides.receiverNumber;
  if (overrides.receiverType !== undefined) h.receiverType = overrides.receiverType;
  if (overrides.receiverVersion !== undefined) h.receiverVersion = overrides.receiverVersion;
  if (overrides.antNumber !== undefined) h.antNumber = overrides.antNumber;
  if (overrides.antType !== undefined) h.antType = overrides.antType;
  if (overrides.approxPosition !== undefined) h.approxPosition = overrides.approxPosition;
  if (overrides.antDelta !== undefined) h.antDelta = overrides.antDelta;
  if (overrides.observer !== undefined) h.observer = overrides.observer;
  if (overrides.agency !== undefined) h.agency = overrides.agency;
  return h;
}

async function handleExportObs(msg: ExportObsRequest) {
  if (!obsHeader || compactEpochs.length === 0) {
    post({ type: 'error', task: 'export-obs', message: 'No observation data to export.' });
    return;
  }

  const header = msg.headerOverrides
    ? applyHeaderOverrides(obsHeader, msg.headerOverrides)
    : obsHeader;
  const format = msg.format ?? 'rinex3';
  const splitInterval = msg.splitInterval ?? null;

  // Apply filters if provided
  let epochs: CompactEpoch[];
  let codeList: Map<string, string[]>;
  if (msg.filters) {
    const f = filterEpochs(msg.filters);
    epochs = f.epochs;
    codeList = f.filteredSysCodeList;
  } else {
    epochs = compactEpochs;
    codeList = sysCodeList;
  }

  if (epochs.length === 0) {
    post({ type: 'error', task: 'export-obs', message: 'No data remaining after filters.' });
    return;
  }

  const obsTypes = new Map<string, string[]>();
  const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S'];
  for (const sys of sysOrder) {
    const codes = codeList.get(sys);
    if (codes && codes.length > 0) obsTypes.set(sys, [...codes]);
  }

  // Split epochs into chunks if splitInterval is set
  const chunks: CompactEpoch[][] = [];
  if (splitInterval != null && splitInterval > 0) {
    const splitMs = splitInterval * 1000;
    let chunkStart = epochs[0]!.time;
    let current: CompactEpoch[] = [];
    for (const epoch of epochs) {
      if (epoch.time - chunkStart >= splitMs && current.length > 0) {
        chunks.push(current);
        current = [];
        chunkStart = epoch.time;
      }
      current.push(epoch);
    }
    if (current.length > 0) chunks.push(current);
  } else {
    chunks.push(epochs);
  }

  // For multi-file exports, we post multiple results
  for (const chunk of chunks) {
    let blob: Blob;

    if (format === 'csv') {
      const csv = writeObsCsv(chunk, obsTypes);
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    } else if (format === 'json-meta') {
      const stats = compactToStats(chunk, codeList, header);
      const json = writeMetadataJson(header, stats, cachedWarnings);
      blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    } else if (format === 'rinex2') {
      blob = await writeRinex2ObsBlob(header, chunk, obsTypes);
    } else if (format === 'rinex4') {
      blob = await writeRinex4ObsBlob(header, chunk, obsTypes);
    } else {
      blob = await writeRinexObsBlob(header, chunk, obsTypes);
    }

    post({
      type: 'obs-export-result', blob,
      filename: {
        markerName: header.markerName || '',
        startTime: new Date(chunk[0]!.time).toISOString(),
        durationSec: (chunk[chunk.length - 1]!.time - chunk[0]!.time) / 1000,
        intervalSec: chunk.length >= 2
          ? (chunk[1]!.time - chunk[0]!.time) / 1000 : null,
      },
    });
  }
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

function handleRecomputePositions(msg: RecomputePositionsRequest) {
  const posData = tryComputePositions(msg.rxPos);
  post({
    type: 'recompute-positions-result',
    positions: posData?.positions ?? null,
    observedPrns: posData?.observedPrns ?? null,
  });
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
      case 'apply-filters': return handleApplyFilters(msg);
      case 'recompute-positions': return handleRecomputePositions(msg);
      case 'export-obs': return await handleExportObs(msg);
      case 'export-nav': return handleExportNav(msg);
      case 'clear': return handleClear();
    }
  } catch (err: unknown) {
    post({ type: 'error', task: msg.type, message: err instanceof Error ? err.message : 'Worker error' });
  }
};
