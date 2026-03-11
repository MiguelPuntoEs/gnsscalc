/**
 * Data completeness analysis from RINEX observations.
 *
 * Tracks which observation codes are present (non-null) vs expected for each
 * satellite in each epoch, computing per-satellite per-signal completeness.
 */

import type { RinexHeader } from './rinex';
import { BAND_LABELS, SYSTEM_NAMES } from './gnss-constants';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface CompleteSatSignal {
  prn: string;
  system: string;
  code: string;       // RINEX obs code e.g. "C1C", "L1C", "S1C"
  band: string;       // band digit
  expected: number;   // epochs where satellite was present AND transmits this signal
  present: number;    // epochs where this code was non-null
  percent: number;
}

export interface CompleteSignalStats {
  code: string;
  system: string;
  label: string;      // e.g. "C1C (GPS L1)"
  expected: number;
  present: number;
  percent: number;
  satellites: number;
}

export interface CompletenessResult {
  cells: CompleteSatSignal[];
  signalStats: CompleteSignalStats[];
  systems: string[];
}

/* ================================================================== */
/*  Accumulator                                                        */
/* ================================================================== */

export class CompletenessAccumulator {
  // PRN → code → { seen, expected, present }
  // "seen" gates counting: expected only increments after a satellite has transmitted
  // the signal at least once (avoids inflating expected for signals a sat doesn't have,
  // e.g. L5 on GPS Block IIR).
  private data = new Map<string, Map<string, { seen: boolean; expected: number; present: number }>>();
  private header: RinexHeader;

  constructor(header: RinexHeader) {
    this.header = header;
  }

  onObservation = (_time: number, prn: string, codes: string[], values: (number | null)[]) => {
    let satMap = this.data.get(prn);
    if (!satMap) {
      satMap = new Map();
      this.data.set(prn, satMap);
    }

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      const hasValue = values[i] != null && values[i] !== 0;
      let cell = satMap.get(code);
      if (!cell) {
        cell = { seen: false, expected: 0, present: 0 };
        satMap.set(code, cell);
      }
      if (hasValue) cell.seen = true;
      if (cell.seen) cell.expected++;
      if (hasValue) cell.present++;
    }
  };

  finalize(): CompletenessResult {
    const cells: CompleteSatSignal[] = [];
    const systemSet = new Set<string>();

    for (const [prn, satMap] of this.data) {
      const sys = prn[0]!;
      systemSet.add(sys);
      for (const [code, { seen, expected, present }] of satMap) {
        if (!seen) continue;
        const band = code[1] ?? '?';
        cells.push({
          prn,
          system: sys,
          code,
          band,
          expected,
          present,
          percent: expected > 0 ? (present / expected) * 100 : 0,
        });
      }
    }

    // Per-signal aggregate
    const sigAgg = new Map<string, { expected: number; present: number; sats: Set<string> }>();
    for (const c of cells) {
      const key = `${c.system}:${c.code}`;
      let agg = sigAgg.get(key);
      if (!agg) {
        agg = { expected: 0, present: 0, sats: new Set() };
        sigAgg.set(key, agg);
      }
      agg.expected += c.expected;
      agg.present += c.present;
      agg.sats.add(c.prn);
    }

    const signalStats: CompleteSignalStats[] = [];
    for (const [key, agg] of sigAgg) {
      const [sys, code] = key.split(':') as [string, string];
      const band = code[1] ?? '?';
      const bandLabel = BAND_LABELS[sys]?.[band] ?? `Band ${band}`;
      const sysName = SYSTEM_NAMES[sys] ?? sys;
      signalStats.push({
        code,
        system: sys,
        label: `${code} (${sysName} ${bandLabel})`,
        expected: agg.expected,
        present: agg.present,
        percent: agg.expected > 0 ? (agg.present / agg.expected) * 100 : 0,
        satellites: agg.sats.size,
      });
    }

    const sysOrder = 'GRECIJS';
    signalStats.sort((a, b) => {
      const da = sysOrder.indexOf(a.system);
      const db = sysOrder.indexOf(b.system);
      if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
      return a.code.localeCompare(b.code);
    });

    const systems = [...systemSet].sort((a, b) => {
      return (sysOrder.indexOf(a) === -1 ? 99 : sysOrder.indexOf(a))
        - (sysOrder.indexOf(b) === -1 ? 99 : sysOrder.indexOf(b));
    });

    return { cells, signalStats, systems };
  }
}
