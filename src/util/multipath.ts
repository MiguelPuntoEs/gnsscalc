/**
 * Multipath analysis from RINEX dual-frequency observations.
 *
 * Computes code-multipath (MP) combinations:
 *   MP_i = C_i - (1 + 2/(α-1))·L_i·λ_i + (2/(α-1))·L_j·λ_j
 * where α = (f_i/f_j)², C = pseudorange (m), L = carrier phase (cycles), λ = wavelength.
 *
 * Arc-mean debiasing removes carrier-phase ambiguity per continuous arc.
 */

import type { RinexHeader } from './rinex';
import {
  C_LIGHT, BAND_LABELS, SYSTEM_NAMES, DUAL_FREQ_PAIRS, ARC_GAP_FACTOR,
  buildGloChannelMap, getFreq, buildObsIndices,
} from './gnss-constants';

/* ================================================================== */
/*  Public types                                                       */
/* ================================================================== */

export interface MultipathPoint {
  time: number;
  mp: number;
}

export interface MultipathSeries {
  prn: string;
  system: string;
  band: string;
  refBand: string;
  label: string;
  points: MultipathPoint[];
  rms: number;
}

export interface MultipathSignalStat {
  label: string;
  system: string;
  band: string;
  refBand: string;
  rms: number;
  count: number;
  satellites: number;
}

export interface MultipathResult {
  series: MultipathSeries[];
  signalStats: MultipathSignalStat[];
}

/* ================================================================== */
/*  Arc state management                                               */
/* ================================================================== */

interface ArcBuffer {
  times: number[];
  rawMp: number[];
}

interface SatBandState {
  arc: ArcBuffer;
  lastTime: number;
}

const MIN_ARC_LENGTH = 10;

/* ================================================================== */
/*  Multipath accumulator                                              */
/* ================================================================== */

export class MultipathAccumulator {
  private state = new Map<string, Map<string, SatBandState>>();
  private results: MultipathSeries[] = [];
  private interval: number;
  private obsIndices: Map<string, Map<string, { L: number; C: number | null }>>;
  private gloChannels: Record<string, number>;

  constructor(header: RinexHeader) {
    this.interval = header.interval ?? 30;
    this.obsIndices = buildObsIndices(header);
    this.gloChannels = buildGloChannelMap(header.glonassSlots);
  }

  /** Observation callback — wire this into parseRinexStream. */
  onObservation = (time: number, prn: string, _codes: string[], values: (number | null)[]) => {
    const sys = prn[0]!;
    const bandMap = this.obsIndices.get(sys) ?? this.obsIndices.get('_v2');
    if (!bandMap) return;

    // Collect available band data
    const bandData = new Map<string, { C: number; L: number; f: number }>();
    for (const [band, { C, L }] of bandMap) {
      if (C === null) continue;
      const cVal = values[C];
      const lVal = values[L];
      const freq = getFreq(this.gloChannels, prn, band);
      if (cVal != null && cVal !== 0 && lVal != null && lVal !== 0 && freq) {
        bandData.set(band, { C: cVal, L: lVal, f: freq });
      }
    }

    if (bandData.size < 2) return;

    const pairs = DUAL_FREQ_PAIRS[sys] ?? [];
    for (const [bi, bj] of pairs) {
      const di = bandData.get(bi);
      const dj = bandData.get(bj);
      if (!di || !dj) continue;

      const λi = C_LIGHT / di.f;
      const λj = C_LIGHT / dj.f;
      const α = (di.f * di.f) / (dj.f * dj.f);
      const coeff = 2 / (α - 1);

      // MP_i = C_i - (1 + 2/(α-1)) · L_i · λ_i + (2/(α-1)) · L_j · λ_j
      const mp = di.C - (1 + coeff) * di.L * λi + coeff * dj.L * λj;

      this.pushMp(prn, bi, bj, time, mp);
    }
  };

  private pushMp(prn: string, band: string, refBand: string, time: number, mp: number) {
    if (!isFinite(mp)) return;

    const pairKey = `${band}-${refBand}`;
    let satStates = this.state.get(prn);
    if (!satStates) {
      satStates = new Map();
      this.state.set(prn, satStates);
    }

    let bandState = satStates.get(pairKey);
    if (!bandState) {
      bandState = { arc: { times: [], rawMp: [] }, lastTime: 0 };
      satStates.set(pairKey, bandState);
    }

    // Arc break detection: time gap only (cycle slips handled externally via notifySlip)
    const gap = bandState.lastTime > 0 ? (time - bandState.lastTime) / 1000 : 0;

    if (bandState.lastTime > 0 && gap > this.interval * ARC_GAP_FACTOR) {
      this.closeArc(prn, band, refBand, bandState);
    }

    bandState.arc.times.push(time);
    bandState.arc.rawMp.push(mp);
    bandState.lastTime = time;
  }

  /** External cycle-slip notification — close affected arcs for this PRN. */
  notifySlip(_time: number, prn: string, bands: Set<string>) {
    const satStates = this.state.get(prn);
    if (!satStates) return;
    for (const [pairKey, bandState] of satStates) {
      const [band, refBand] = pairKey.split('-');
      if (bands.has(band!) || bands.has(refBand!)) {
        this.closeArc(prn, band!, refBand!, bandState);
      }
    }
  }

  private closeArc(prn: string, band: string, refBand: string, state: SatBandState) {
    const arc = state.arc;
    if (arc.times.length >= MIN_ARC_LENGTH) {
      const mean = arc.rawMp.reduce((a, b) => a + b, 0) / arc.rawMp.length;
      const sys = prn[0]!;
      const bLabel = BAND_LABELS[sys]?.[band] ?? band;
      const rLabel = BAND_LABELS[sys]?.[refBand] ?? refBand;
      const label = `${prn} MP ${bLabel}-${rLabel}`;

      const points: MultipathPoint[] = arc.times.map((t, i) => ({
        time: t,
        mp: arc.rawMp[i]! - mean,
      }));

      const rms = Math.sqrt(points.reduce((s, p) => s + p.mp * p.mp, 0) / points.length);

      this.results.push({ prn, system: sys, band, refBand, label, points, rms });
    }
    state.arc = { times: [], rawMp: [] };
  }

  /** Finalize: close remaining arcs and compute statistics. */
  finalize(): MultipathResult {
    for (const [prn, satStates] of this.state) {
      for (const [pairKey, bandState] of satStates) {
        const [band, refBand] = pairKey.split('-');
        this.closeArc(prn, band!, refBand!, bandState);
      }
    }

    // Aggregate per-signal statistics
    const signalGroups = new Map<string, MultipathSeries[]>();
    for (const series of this.results) {
      const key = `${series.system}-${series.band}-${series.refBand}`;
      if (!signalGroups.has(key)) signalGroups.set(key, []);
      signalGroups.get(key)!.push(series);
    }

    const signalStats: MultipathSignalStat[] = [];
    for (const [, seriesList] of signalGroups) {
      const { system, band, refBand } = seriesList[0]!;
      let sumSq = 0;
      let count = 0;
      for (const s of seriesList) {
        for (const p of s.points) { sumSq += p.mp * p.mp; count++; }
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      const bLabel = BAND_LABELS[system]?.[band] ?? band;
      const rLabel = BAND_LABELS[system]?.[refBand] ?? refBand;
      const sysName = SYSTEM_NAMES[system] ?? system;

      signalStats.push({
        label: `MP ${bLabel}-${rLabel} (${sysName})`,
        system, band, refBand, rms, count,
        satellites: seriesList.length,
      });
    }

    const sysOrder = 'GRECIJS';
    signalStats.sort((a, b) => {
      const da = sysOrder.indexOf(a.system);
      const db = sysOrder.indexOf(b.system);
      if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
      return a.band.localeCompare(b.band);
    });

    return { series: this.results, signalStats };
  }
}

