/**
 * Stateful Web Worker for all heavy RINEX computation.
 *
 * Keeps obs + nav data in memory for incremental merging, instant QA,
 * instant export, and automatic orbit recomputation.
 *
 * Protocol:
 *   add-obs   — parse new obs files, merge into cache, run QA, recompute positions
 *   add-nav   — parse new nav files, merge into cache, recompute positions
 *   export-obs — write RINEX obs from cache
 *   export-nav — write RINEX nav from cache
 *   clear     — reset all state
 */

import { parseRinexStream } from './rinex';
import type { RinexResult, RinexHeader, EpochSummary } from './rinex';
import { systemCmp } from './rinex';
import { parseNavFile } from './nav';
import type { NavResult, Ephemeris } from './nav';
import { computeAllPositions, navTimesFromEph } from './orbit';
import type { AllPositionsData } from './orbit';
import { CycleSlipAccumulator } from './cycle-slip';
import { CompletenessAccumulator } from './completeness';
import { MultipathAccumulator } from './multipath';
import type { QualityResult } from './quality-analysis';
import { writeRinexObsBlob } from './obs-writer';
import type { RawEpoch } from './obs-writer';
import { writeRinexNav } from './nav-writer';

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
  | AddObsRequest | AddNavRequest
  | ExportObsRequest | ExportNavRequest
  | ClearRequest;

// ── Responses ──

export interface ProgressMessage {
  type: 'progress';
  task: string;
  percent: number;
}

export interface AddObsResult {
  type: 'add-obs-result';
  result: RinexResult;
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

// Observation data
let obsHeader: RinexHeader | null = null;
let obsRawEpochs: RawEpoch[] = [];
let obsEpochMap = new Map<number, RawEpoch>();
let obsTypeSets = new Map<string, Set<string>>();
let obsResults: RinexResult[] = [];  // per-file results for merging

// Navigation data
let navHeader: NavResult['header'] | null = null;
let navEphemerides: Ephemeris[] = [];

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function post(msg: WorkerResponse) { self.postMessage(msg); }

function progress(task: string, percent: number) {
  post({ type: 'progress', task, percent });
}

async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gz')) {
    const ds = new DecompressionStream('gzip');
    const decompressed = file.stream().pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const decoder = new TextDecoder();
    return chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  }
  return file.text();
}

/** Merge multiple RinexResults into one. */
function mergeRinexResults(results: RinexResult[]): RinexResult {
  if (results.length === 1) return results[0]!;

  const base = results[0]!.header;
  const mergedObsTypes: Record<string, string[]> = { ...base.obsTypes };
  for (const r of results.slice(1)) {
    for (const [sys, types] of Object.entries(r.header.obsTypes)) {
      if (!mergedObsTypes[sys]) mergedObsTypes[sys] = [...types];
      else {
        const set = new Set(mergedObsTypes[sys]);
        for (const t of types) set.add(t);
        mergedObsTypes[sys] = [...set];
      }
    }
  }
  const mergedHeader: RinexHeader = { ...base, obsTypes: mergedObsTypes };

  const allEpochs: EpochSummary[] = [];
  const seen = new Set<number>();
  for (const r of results) {
    for (const ep of r.epochs) {
      if (!seen.has(ep.time)) { seen.add(ep.time); allEpochs.push(ep); }
    }
  }
  allEpochs.sort((a, b) => a.time - b.time);

  const systems = new Set<string>();
  const satsSeen = new Set<string>();
  const satsPerSystem: Record<string, Set<string>> = {};
  let snrSum = 0, snrN = 0, satCount = 0;

  for (const ep of allEpochs) {
    for (const sys of Object.keys(ep.satsPerSystem)) {
      systems.add(sys);
      if (!satsPerSystem[sys]) satsPerSystem[sys] = new Set();
    }
    for (const prn of Object.keys(ep.snrPerSat)) {
      satsSeen.add(prn);
      const sys = prn[0]!;
      if (!satsPerSystem[sys]) satsPerSystem[sys] = new Set();
      satsPerSystem[sys]!.add(prn);
    }
    satCount += ep.totalSats;
    if (ep.meanSnr != null) { snrSum += ep.meanSnr * ep.totalSats; snrN += ep.totalSats; }
  }

  const sortedSystems = [...systems].sort(systemCmp);
  const startTime = allEpochs.length > 0 ? new Date(allEpochs[0]!.time) : null;
  const endTime = allEpochs.length > 0 ? new Date(allEpochs[allEpochs.length - 1]!.time) : null;
  const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : null;

  let interval: number | null = null;
  if (allEpochs.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < Math.min(allEpochs.length, 100); i++) {
      gaps.push((allEpochs[i]!.time - allEpochs[i - 1]!.time) / 1000);
    }
    gaps.sort((a, b) => a - b);
    interval = gaps[Math.floor(gaps.length / 2)]!;
  }

  return {
    header: mergedHeader,
    epochs: allEpochs,
    stats: {
      totalEpochs: allEpochs.length, validEpochs: allEpochs.length,
      duration, startTime, endTime, interval,
      uniqueSatellites: satsSeen.size,
      uniqueSatsPerSystem: Object.fromEntries(
        Object.entries(satsPerSystem).map(([s, set]) => [s, set.size]),
      ),
      systems: sortedSystems,
      meanSatellites: allEpochs.length > 0 ? satCount / allEpochs.length : 0,
      meanSnr: snrN > 0 ? snrSum / snrN : null,
    },
  };
}

/** Build sorted obs types map from accumulated sets. */
function buildObsTypes(): Map<string, string[]> {
  const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S'];
  const result = new Map<string, string[]>();
  for (const sys of sysOrder) {
    const types = obsTypeSets.get(sys);
    if (types && types.size > 0) {
      result.set(sys, [...types].sort((a, b) => {
        const bandA = a[1]!, bandB = b[1]!;
        if (bandA !== bandB) return bandA.localeCompare(bandB);
        const typeA = a[0]!, typeB = b[0]!;
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        return a.localeCompare(b);
      }));
    }
  }
  return result;
}

/** Run QA over all cached raw epochs. */
function replayQA(header: RinexHeader): QualityResult {
  const mpAccum = new MultipathAccumulator(header);
  const csAccum = new CycleSlipAccumulator(header, (time, prn, bands) => {
    mpAccum.notifySlip(time, prn, bands);
  });
  const compAccum = new CompletenessAccumulator(header);

  for (const epoch of obsRawEpochs) {
    for (const [prn, obsMap] of epoch.sats) {
      const codes = [...obsMap.keys()];
      const values = codes.map(c => obsMap.get(c) ?? null);
      csAccum.onObservation(epoch.time, prn, codes, values);
      mpAccum.onObservation(epoch.time, prn, codes, values);
      compAccum.onObservation(epoch.time, prn, codes, values);
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
  const merged = obsResults.length > 0 ? mergeRinexResults(obsResults) : null;
  if (!merged || navEphemerides.length === 0) return null;

  const maxEpochs = 500;
  const step = Math.max(1, Math.ceil(merged.epochs.length / maxEpochs));
  const times: number[] = [];
  const prnsPerEpoch: string[][] = [];
  for (let i = 0; i < merged.epochs.length; i += step) {
    const e = merged.epochs[i]!;
    times.push(e.time);
    prnsPerEpoch.push(Object.keys(e.snrPerSat));
  }

  const rxPos = merged.header.approxPosition;
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
  // Parse only the new files, merge raw data into existing cache
  for (let i = 0; i < msg.files.length; i++) {
    const file = msg.files[i]!;
    const r = await parseRinexStream(file, (p) => {
      const overall = (i + p / 100) / msg.files.length * 100;
      progress('add-obs', Math.round(overall));
    }, undefined, (time, prn, codes, values) => {
      let epoch = obsEpochMap.get(time);
      if (!epoch) {
        epoch = { time, sats: new Map() };
        obsEpochMap.set(time, epoch);
      }
      let satObs = epoch.sats.get(prn);
      if (!satObs) { satObs = new Map(); epoch.sats.set(prn, satObs); }
      const sys = prn[0]!;
      let typeSet = obsTypeSets.get(sys);
      if (!typeSet) { typeSet = new Set(); obsTypeSets.set(sys, typeSet); }
      for (let j = 0; j < codes.length; j++) {
        typeSet.add(codes[j]!);
        const val = values[j] ?? null;
        if (val !== null) satObs.set(codes[j]!, val);
      }
    });

    if (r.epochs.length > 0) {
      obsResults.push(r);
    }
  }

  if (obsResults.length === 0) {
    post({ type: 'error', task: 'add-obs', message: 'No valid observation epochs found in the file(s).' });
    return;
  }

  // Rebuild sorted raw epochs from the accumulated epoch map
  obsRawEpochs = [...obsEpochMap.values()].sort((a, b) => a.time - b.time);

  // Merge all RinexResults
  const merged = mergeRinexResults(obsResults);
  obsHeader = merged.header;

  // QA over full dataset
  const qaResult = replayQA(merged.header);

  // Auto-compute positions if nav is available
  const posData = tryComputePositions();

  post({
    type: 'add-obs-result',
    result: merged,
    qaResult,
    positions: posData?.positions ?? null,
    observedPrns: posData?.observedPrns ?? null,
  });
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
  if (!obsHeader || obsRawEpochs.length === 0) {
    post({ type: 'error', task: 'export-obs', message: 'No observation data to export.' });
    return;
  }
  const obsTypes = buildObsTypes();
  const blob = await writeRinexObsBlob(obsHeader, obsRawEpochs, obsTypes);

  post({
    type: 'obs-export-result', blob,
    filename: {
      markerName: obsHeader.markerName || '',
      startTime: new Date(obsRawEpochs[0]!.time).toISOString(),
      durationSec: (obsRawEpochs[obsRawEpochs.length - 1]!.time - obsRawEpochs[0]!.time) / 1000,
      intervalSec: obsRawEpochs.length >= 2
        ? (obsRawEpochs[1]!.time - obsRawEpochs[0]!.time) / 1000 : null,
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
  obsRawEpochs = [];
  obsEpochMap = new Map();
  obsTypeSets = new Map();
  obsResults = [];
  navHeader = null;
  navEphemerides = [];
}

/* ================================================================== */
/*  Dispatcher                                                         */
/* ================================================================== */

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
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
