/**
 * Builds a satellite availability & health matrix from navigation
 * ephemerides, optionally cross-referenced with observation data.
 */

import type { Ephemeris, KeplerEphemeris, GlonassEphemeris } from './nav';
import type { EpochGrid } from './epoch-grid';
import { systemCmp } from './rinex';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Cell state encoded as Uint8Array values. */
export const CellState = {
  Empty:           0,  // no eph, not observed
  EphHealthy:      1,  // has eph + healthy (nav-only green)
  EphUnhealthy:    2,  // has eph + unhealthy (red)
  ObsEphHealthy:   3,  // observed + eph + healthy (green)
  ObsEphUnhealthy: 4,  // observed + eph + unhealthy (red)
  ObsNoEph:        5,  // observed but no eph (yellow)
  NotObsHasEph:    6,  // not observed but has eph (gray)
} as const;

export interface AvailabilityGrid {
  system: string;
  prns: string[];
  times: Float64Array;
  /** Row-major [nBins × nPrns]. */
  cells: Uint8Array;
  hasObs: boolean;
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Max age in ms for ephemeris validity. */
function maxAge(sys: string): number {
  return (sys === 'R' || sys === 'S') ? 1800_000 : 4 * 3600_000;
}

function isHealthy(eph: Ephemeris): boolean {
  if (eph.system === 'R' || eph.system === 'S') {
    return (eph as GlonassEphemeris).health === 0;
  }
  return (eph as KeplerEphemeris).svHealth === 0;
}

/** Binary search: index of first element >= target. */
function lowerBound(arr: Float64Array, target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]! < target) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/* ================================================================== */
/*  Builder                                                            */
/* ================================================================== */

export function buildAvailabilityGrids(
  ephemerides: Ephemeris[],
  grid: EpochGrid | null,
  targetBins = 400,
): AvailabilityGrid[] {
  if (ephemerides.length === 0) return [];

  // ── Group ephemerides by PRN ──
  const ephByPrn = new Map<string, Ephemeris[]>();
  let minT = Infinity, maxT = -Infinity;
  for (const eph of ephemerides) {
    const t = eph.tocDate.getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
    let arr = ephByPrn.get(eph.prn);
    if (!arr) { arr = []; ephByPrn.set(eph.prn, arr); }
    arr.push(eph);
  }

  // Extend time range by half a validity window on each side
  const pad = 2 * 3600_000;
  minT -= pad;
  maxT += pad;

  // Union with obs time range if available
  if (grid && grid.nEpochs > 0) {
    minT = Math.min(minT, grid.times[0]!);
    maxT = Math.max(maxT, grid.times[grid.nEpochs - 1]!);
  }

  // ── Time bins ──
  const nBins = Math.min(targetBins, Math.max(10, Math.ceil((maxT - minT) / 60_000)));
  const binWidth = (maxT - minT) / nBins;
  const times = new Float64Array(nBins);
  for (let i = 0; i < nBins; i++) times[i] = minT + (i + 0.5) * binWidth;

  // ── Group PRNs by system ──
  const systemPrns = new Map<string, Set<string>>();
  for (const prn of ephByPrn.keys()) {
    const sys = prn.charAt(0);
    let set = systemPrns.get(sys);
    if (!set) { set = new Set(); systemPrns.set(sys, set); }
    set.add(prn);
  }
  // Also add PRNs from obs grid that might not be in nav
  if (grid) {
    for (const prn of grid.prns) {
      const sys = prn.charAt(0);
      let set = systemPrns.get(sys);
      if (!set) { set = new Set(); systemPrns.set(sys, set); }
      set.add(prn);
    }
  }

  const hasObs = grid != null && grid.nEpochs > 0;

  // ── Build grid index for obs lookup ──
  const gridPrnIdx = new Map<string, number>();
  if (grid) {
    for (let i = 0; i < grid.prns.length; i++) gridPrnIdx.set(grid.prns[i]!, i);
  }

  // ── Build per-constellation grids ──
  const systems = [...systemPrns.keys()].sort(systemCmp);
  const result: AvailabilityGrid[] = [];

  for (const sys of systems) {
    const prns = [...systemPrns.get(sys)!].sort();
    const nPrns = prns.length;
    const cells = new Uint8Array(nBins * nPrns); // all Empty (0)

    for (let p = 0; p < nPrns; p++) {
      const prn = prns[p]!;
      const ephs = ephByPrn.get(prn);
      const prnGridIdx = gridPrnIdx.get(prn);

      for (let b = 0; b < nBins; b++) {
        const t = times[b]!;
        const binStart = minT + b * binWidth;
        const binEnd = binStart + binWidth;

        // Find best ephemeris for this time
        let bestEph: Ephemeris | null = null;
        let bestDt = Infinity;
        if (ephs) {
          const limit = maxAge(sys);
          for (const eph of ephs) {
            const dt = Math.abs(t - eph.tocDate.getTime());
            if (dt > limit) continue;
            if (dt < bestDt) { bestDt = dt; bestEph = eph; }
          }
        }

        // Check if satellite was observed in this time bin
        let observed = false;
        if (hasObs && grid && prnGridIdx != null) {
          const startIdx = lowerBound(grid.times, binStart);
          const endIdx = lowerBound(grid.times, binEnd);
          const nPrnGrid = grid.prns.length;
          for (let i = startIdx; i < endIdx; i++) {
            if (!isNaN(grid.snrPerSat[i * nPrnGrid + prnGridIdx]!)) {
              observed = true;
              break;
            }
          }
        }

        // Classify
        let state: number;
        if (hasObs) {
          if (observed && bestEph) {
            state = isHealthy(bestEph) ? CellState.ObsEphHealthy : CellState.ObsEphUnhealthy;
          } else if (observed) {
            state = CellState.ObsNoEph;
          } else if (bestEph) {
            state = isHealthy(bestEph) ? CellState.NotObsHasEph : CellState.EphUnhealthy;
          } else {
            state = CellState.Empty;
          }
        } else {
          if (bestEph) {
            state = isHealthy(bestEph) ? CellState.EphHealthy : CellState.EphUnhealthy;
          } else {
            state = CellState.Empty;
          }
        }

        cells[b * nPrns + p] = state;
      }
    }

    result.push({ system: sys, prns, times, cells, hasObs });
  }

  return result;
}
