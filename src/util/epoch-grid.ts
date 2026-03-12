/**
 * Columnar typed-array representation of epoch data for zero-copy
 * transfer from the Web Worker to the main thread.
 *
 * Instead of sending 86,400 epoch objects via postMessage (which
 * triggers a ~3 GB structured-clone spike), we pack everything into
 * flat typed arrays that can be transferred with zero copy.
 *
 * Memory for 86,400 epochs / 80 PRNs / 4 systems / 200 band keys:
 *   times          691 KB
 *   totalSats       84 KB
 *   meanSnr        346 KB
 *   satsPerSystem  346 KB
 *   snrPerSystem   1.4 MB
 *   snrPerSat       28 MB
 *   snrPerSatBand   69 MB   (sparse — most NaN)
 *   ─────────────────────
 *   Total         ~100 MB   (transferred, not cloned)
 */

import type { RinexHeader, RinexStats } from './rinex';
import { systemCmp } from './rinex';
import type { CompactEpoch } from './obs-writer';

/* ================================================================== */
/*  Type                                                               */
/* ================================================================== */

export interface EpochGrid {
  nEpochs: number;

  /** Unix ms per epoch. */
  times: Float64Array; // [nEpochs]

  /** Satellites tracked per epoch. */
  totalSats: Uint8Array; // [nEpochs]

  /** Mean C/N0 per epoch (NaN = null). */
  meanSnr: Float32Array; // [nEpochs]

  /** Constellation identifiers, e.g. ["G","E","R","C"]. */
  systems: string[];

  /** Satellite count per system. Row-major [epoch][sysIdx]. */
  satsPerSystem: Uint8Array; // [nEpochs × nSystems]

  /** Mean C/N0 per system. Row-major [epoch][sysIdx]. NaN = missing. */
  snrPerSystem: Float32Array; // [nEpochs × nSystems]

  /** Unique sorted PRN list, e.g. ["C01","C02",..."G01",...]. */
  prns: string[];

  /** Per-sat SNR matrix. Row-major [epoch][prnIdx]. NaN = missing. */
  snrPerSat: Float32Array; // [nEpochs × nPrns]

  /** Unique sorted band keys, e.g. ["C01:2","C01:6",...,"G01:1",...]. */
  bandKeys: string[];

  /** Per-sat-band SNR matrix. Row-major [epoch][bandIdx]. NaN = missing. */
  snrPerSatBand: Float32Array; // [nEpochs × nBandKeys]
}

/* ================================================================== */
/*  Builder from compact data (runs in worker)                         */
/* ================================================================== */

/**
 * Build an EpochGrid directly from worker's compact epoch data.
 * This bypasses EpochSummary entirely — much faster for large files
 * because it avoids millions of Record allocations.
 *
 * @param compactEpochs Sorted compact epochs (time-ordered)
 * @param sysCodeList   Per-system obs code registry (sys → code names)
 */
export function compactToGrid(
  compactEpochs: CompactEpoch[],
  sysCodeList: Map<string, string[]>,
): EpochGrid {
  const n = compactEpochs.length;
  if (n === 0) {
    return {
      nEpochs: 0,
      times: new Float64Array(0), totalSats: new Uint8Array(0), meanSnr: new Float32Array(0),
      systems: [], satsPerSystem: new Uint8Array(0), snrPerSystem: new Float32Array(0),
      prns: [], snrPerSat: new Float32Array(0),
      bandKeys: [], snrPerSatBand: new Float32Array(0),
    };
  }

  // ── Identify SNR codes per system (codes starting with 'S') ──
  const sysSnrInfo = new Map<string, { idx: number; band: string }[]>();
  for (const [sys, codes] of sysCodeList) {
    const snrIndices: { idx: number; band: string }[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (codes[i]![0] === 'S') snrIndices.push({ idx: i, band: codes[i]![1]! });
    }
    sysSnrInfo.set(sys, snrIndices);
  }

  // ── Collect unique PRNs and band keys across all epochs ──
  const prnSet = new Set<string>();
  for (const epoch of compactEpochs) {
    for (const prn of epoch.sats.keys()) prnSet.add(prn);
  }

  const systems = [...sysCodeList.keys()].sort();
  const prns = [...prnSet].sort();

  // Build band keys from PRNs × their system's SNR bands
  const bandKeySet = new Set<string>();
  for (const prn of prns) {
    const sys = prn[0]!;
    const snrInfo = sysSnrInfo.get(sys);
    if (snrInfo) {
      for (const { band } of snrInfo) bandKeySet.add(`${prn}:${band}`);
    }
  }
  const bandKeys = [...bandKeySet].sort();

  const nSys = systems.length;
  const nPrn = prns.length;
  const nBand = bandKeys.length;

  // Build index maps
  const sysIdx = new Map<string, number>();
  for (let i = 0; i < nSys; i++) sysIdx.set(systems[i]!, i);
  const prnIdx = new Map<string, number>();
  for (let i = 0; i < nPrn; i++) prnIdx.set(prns[i]!, i);
  const bandIdx = new Map<string, number>();
  for (let i = 0; i < nBand; i++) bandIdx.set(bandKeys[i]!, i);

  // ── Allocate typed arrays ──
  const times = new Float64Array(n);
  const totalSats = new Uint8Array(n);
  const meanSnr = new Float32Array(n);
  const satsPerSystem = new Uint8Array(n * nSys);
  const snrPerSystem = new Float32Array(n * nSys);
  const snrPerSat = new Float32Array(n * nPrn);
  const snrPerSatBand = new Float32Array(n * nBand);

  meanSnr.fill(NaN);
  snrPerSystem.fill(NaN);
  snrPerSat.fill(NaN);
  snrPerSatBand.fill(NaN);

  // ── Fill ──
  for (let i = 0; i < n; i++) {
    const epoch = compactEpochs[i]!;
    times[i] = epoch.time;
    totalSats[i] = epoch.sats.size;

    const rowSys = i * nSys;
    const rowPrn = i * nPrn;
    const rowBand = i * nBand;

    // Per-system accumulators
    const sysSatCount = new Uint8Array(nSys);
    const sysSnrSum = new Float64Array(nSys);
    const sysSnrN = new Uint16Array(nSys);
    let allSnrSum = 0, allSnrN = 0;

    for (const [prn, valArr] of epoch.sats) {
      const sys = prn[0]!;
      const si = sysIdx.get(sys);
      if (si != null) sysSatCount[si]!++;

      const pi = prnIdx.get(prn);
      if (pi == null) continue;

      const snrInfo = sysSnrInfo.get(sys);
      if (!snrInfo || snrInfo.length === 0) continue;

      // Average all SNR values for this satellite → snrPerSat
      let satSnrSum = 0, satSnrN = 0;
      for (const { idx, band } of snrInfo) {
        const val = idx < valArr.length ? valArr[idx]! : NaN;
        if (!isNaN(val) && val > 0) {
          satSnrSum += val;
          satSnrN++;
          // Per-band SNR
          const bi = bandIdx.get(`${prn}:${band}`);
          if (bi != null) snrPerSatBand[rowBand + bi] = val;
        }
      }

      if (satSnrN > 0) {
        const avg = satSnrSum / satSnrN;
        snrPerSat[rowPrn + pi] = avg;
        allSnrSum += avg;
        allSnrN++;
        if (si != null) {
          sysSnrSum[si]! += avg;
          sysSnrN[si]!++;
        }
      }
    }

    // Write per-system counts and SNR
    for (let s = 0; s < nSys; s++) {
      satsPerSystem[rowSys + s] = sysSatCount[s]!;
      if (sysSnrN[s]! > 0) snrPerSystem[rowSys + s] = sysSnrSum[s]! / sysSnrN[s]!;
    }

    if (allSnrN > 0) meanSnr[i] = allSnrSum / allSnrN;
  }

  return {
    nEpochs: n,
    times, totalSats, meanSnr,
    systems, satsPerSystem, snrPerSystem,
    prns, snrPerSat,
    bandKeys, snrPerSatBand,
  };
}

/**
 * Compute RinexStats directly from compact epoch data.
 * Replaces mergeRinexResults + computeStats when in worker mode.
 */
export function compactToStats(
  compactEpochs: CompactEpoch[],
  sysCodeList: Map<string, string[]>,
  header: RinexHeader,
): RinexStats {
  const n = compactEpochs.length;
  const satellitesSeen: Record<string, Set<string>> = {};

  // Identify SNR code indices per system
  const sysSnrIdx = new Map<string, number[]>();
  for (const [sys, codes] of sysCodeList) {
    const indices: number[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (codes[i]![0] === 'S') indices.push(i);
    }
    sysSnrIdx.set(sys, indices);
  }

  let satCountSum = 0;
  let snrSum = 0, snrN = 0;

  for (const epoch of compactEpochs) {
    satCountSum += epoch.sats.size;

    for (const [prn, valArr] of epoch.sats) {
      const sys = prn[0]!;
      if (!satellitesSeen[sys]) satellitesSeen[sys] = new Set();
      satellitesSeen[sys]!.add(prn);

      // Compute mean SNR for this satellite in this epoch
      const indices = sysSnrIdx.get(sys);
      if (!indices) continue;
      let sum = 0, count = 0;
      for (const idx of indices) {
        const v = idx < valArr.length ? valArr[idx]! : NaN;
        if (!isNaN(v) && v > 0) { sum += v; count++; }
      }
      if (count > 0) { snrSum += sum / count; snrN++; }
    }
  }

  const startTime = n > 0 ? new Date(compactEpochs[0]!.time) : header.timeOfFirstObs;
  const endTime = n > 0 ? new Date(compactEpochs[n - 1]!.time) : header.timeOfLastObs;
  const duration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : null;

  let interval = header.interval;
  if (interval === null && n >= 2) {
    interval = (compactEpochs[1]!.time - compactEpochs[0]!.time) / 1000;
  }

  const uniqueSatsPerSystem: Record<string, number> = {};
  let totalUnique = 0;
  const systems: string[] = [];
  for (const [sys, prns] of Object.entries(satellitesSeen)) {
    uniqueSatsPerSystem[sys] = prns.size;
    totalUnique += prns.size;
    systems.push(sys);
  }
  systems.sort(systemCmp);

  return {
    totalEpochs: n,
    validEpochs: n,
    duration,
    startTime,
    endTime,
    interval,
    uniqueSatellites: totalUnique,
    uniqueSatsPerSystem,
    systems,
    meanSatellites: n > 0 ? satCountSum / n : 0,
    meanSnr: snrN > 0 ? snrSum / snrN : null,
  };
}

/** Collect all transferable ArrayBuffers from a grid. */
export function gridTransferables(grid: EpochGrid): ArrayBuffer[] {
  return [
    grid.times.buffer as ArrayBuffer,
    grid.totalSats.buffer as ArrayBuffer,
    grid.meanSnr.buffer as ArrayBuffer,
    grid.satsPerSystem.buffer as ArrayBuffer,
    grid.snrPerSystem.buffer as ArrayBuffer,
    grid.snrPerSat.buffer as ArrayBuffer,
    grid.snrPerSatBand.buffer as ArrayBuffer,
  ];
}

/* ================================================================== */
/*  Accessors (run on main thread)                                     */
/* ================================================================== */

const MAX_CHART_POINTS = 2000;

export interface ChartRow {
  label: string;
  time: number;
  total: number;
  snr: number | null;
  [key: string]: string | number | null;
}

/** Downsample grid to chart rows (max 2000 points). */
export function gridToChartRows(
  grid: EpochGrid,
  formatTime: (time: number) => string,
): ChartRow[] {
  const { nEpochs, systems } = grid;
  if (nEpochs === 0) return [];

  const step = Math.max(1, Math.ceil(nEpochs / MAX_CHART_POINTS));
  const nSys = systems.length;
  const rows: ChartRow[] = [];

  for (let i = 0; i < nEpochs; i += step) {
    // Average over the group [i, i+step)
    const end = Math.min(i + step, nEpochs);
    const gn = end - i;
    const mid = i + Math.floor(gn / 2);
    const time = grid.times[mid]!;

    let totalSum = 0;
    let snrSum = 0, snrN = 0;
    const sysCountSum = new Float64Array(nSys);
    const sysSnrSum = new Float64Array(nSys);
    const sysSnrN = new Uint32Array(nSys);

    for (let j = i; j < end; j++) {
      totalSum += grid.totalSats[j]!;
      const m = grid.meanSnr[j]!;
      if (!isNaN(m)) { snrSum += m; snrN++; }

      const rowSys = j * nSys;
      for (let s = 0; s < nSys; s++) {
        sysCountSum[s]! += grid.satsPerSystem[rowSys + s]!;
        const v = grid.snrPerSystem[rowSys + s]!;
        if (!isNaN(v)) { sysSnrSum[s]! += v; sysSnrN[s]!++; }
      }
    }

    const row: ChartRow = {
      label: formatTime(time),
      time,
      total: Math.round(totalSum / gn),
      snr: snrN > 0 ? Math.round((snrSum / snrN) * 10) / 10 : null,
    };

    for (let s = 0; s < nSys; s++) {
      const sys = systems[s]!;
      row[`sat_${sys}`] = Math.round(sysCountSum[s]! / gn);
      row[`snr_${sys}`] = sysSnrN[s]! > 0
        ? Math.round((sysSnrSum[s]! / sysSnrN[s]!) * 10) / 10
        : null;
    }

    rows.push(row);
  }

  return rows;
}

/** Build unique sorted PRN list per system from the grid. */
export function gridPrnsPerSystem(grid: EpochGrid): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const prn of grid.prns) {
    const sys = prn[0]!;
    (map[sys] ??= []).push(prn);
  }
  return map;
}

/** Downsample the per-sat SNR matrix for the heatmap (max 2000 columns). */
export function gridSnrPerSatDownsampled(grid: EpochGrid): {
  times: Float64Array;
  snr: Float32Array; // [nCols × nPrns]
  nCols: number;
} {
  const { nEpochs, prns } = grid;
  const nPrn = prns.length;
  if (nEpochs === 0) return { times: new Float64Array(0), snr: new Float32Array(0), nCols: 0 };

  const step = Math.max(1, Math.ceil(nEpochs / MAX_CHART_POINTS));
  const nCols = Math.ceil(nEpochs / step);
  const times = new Float64Array(nCols);
  const snr = new Float32Array(nCols * nPrn);
  snr.fill(NaN);

  for (let c = 0; c < nCols; c++) {
    const srcIdx = c * step;
    times[c] = grid.times[srcIdx]!;
    const srcRow = srcIdx * nPrn;
    const dstRow = c * nPrn;
    for (let p = 0; p < nPrn; p++) {
      snr[dstRow + p] = grid.snrPerSat[srcRow + p]!;
    }
  }

  return { times, snr, nCols };
}

/** Build C/N0 histogram data from the full grid. */
export function gridCn0Histogram(
  grid: EpochGrid,
  systems: string[],
): Record<string, string | number>[] {
  const bins = Array.from({ length: 12 }, (_, i) => i * 5);
  const counts: Record<string, number[]> = {};
  for (const sys of systems) counts[sys] = new Array(12).fill(0);

  const { nEpochs, prns } = grid;
  const nPrn = prns.length;

  for (let i = 0; i < nEpochs; i++) {
    const row = i * nPrn;
    for (let p = 0; p < nPrn; p++) {
      const val = grid.snrPerSat[row + p]!;
      if (isNaN(val)) continue;
      const sys = prns[p]![0]!;
      if (!counts[sys]) counts[sys] = new Array(12).fill(0);
      const b = Math.min(Math.floor(val / 5), 11);
      counts[sys]![b]!++;
    }
  }

  return bins.map((low, i) => {
    const row: Record<string, string | number> = { bin: `${low}–${low + 5}` };
    for (const sys of systems) row[sys] = counts[sys]?.[i] ?? 0;
    return row;
  });
}

/** Look up snrPerSatBand for a given time. Returns null if not found. */
export function gridSnrPerSatBandAt(
  grid: EpochGrid,
  timeIndex: Map<number, number>, // time → epoch index (build once, reuse)
  time: number,
): Record<string, number> | null {
  const idx = timeIndex.get(time);
  if (idx == null) return null;

  const { bandKeys } = grid;
  const nBand = bandKeys.length;
  if (nBand === 0) return null;

  const row = idx * nBand;
  const result: Record<string, number> = {};
  let hasAny = false;
  for (let b = 0; b < nBand; b++) {
    const val = grid.snrPerSatBand[row + b]!;
    if (!isNaN(val)) {
      result[bandKeys[b]!] = val;
      hasAny = true;
    }
  }
  return hasAny ? result : null;
}

/** Build a time → epoch index lookup map. */
export function gridTimeIndex(grid: EpochGrid): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < grid.nEpochs; i++) {
    map.set(grid.times[i]!, i);
  }
  return map;
}

/** Collect unique bands from bandKeys (e.g. "1", "2", "5"). */
export function gridBands(grid: EpochGrid): string[] {
  const bandSet = new Set<string>();
  for (const key of grid.bandKeys) {
    const colon = key.indexOf(':');
    if (colon !== -1) bandSet.add(key.substring(colon + 1));
  }
  return [...bandSet].sort();
}
