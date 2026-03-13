/**
 * RINEX file validation — lightweight warning accumulator.
 *
 * Designed to run during parsing with minimal overhead.
 * Collects header issues, duplicate epochs, time gaps, etc.
 */

import type { RinexHeader } from './rinex';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface RinexWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  count: number;
  examples?: string[];
}

export interface RinexWarnings {
  items: RinexWarning[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export const EMPTY_WARNINGS: RinexWarnings = {
  items: [],
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
};

/* ================================================================== */
/*  Accumulator                                                        */
/* ================================================================== */

const MAX_EXAMPLES = 3;

export class WarningAccumulator {
  private items = new Map<string, RinexWarning>();

  // Epoch-level state
  private prevEpochTime: number | null = null;
  private epochTimes = new Set<number>();
  private intervalMs: number | null = null;
  private flagCounts = new Map<number, number>();
  private seenPrns = new Set<string>();

  /* ── Header checks ──────────────────────────────────────────── */

  checkHeader(header: RinexHeader): void {
    const pos = header.approxPosition;
    if (!pos || (pos[0] === 0 && pos[1] === 0 && pos[2] === 0)) {
      this.add('MISSING_POSITION', 'warning',
        'Missing or zero approximate position (APPROX POSITION XYZ)');
    }
    if (!header.antType) {
      this.add('MISSING_ANT_TYPE', 'info', 'Missing antenna type (ANT # / TYPE)');
    }
    if (!header.receiverType) {
      this.add('MISSING_REC_TYPE', 'info', 'Missing receiver type (REC # / TYPE / VERS)');
    }
    if (!header.markerName) {
      this.add('MISSING_MARKER', 'info', 'Missing marker name (MARKER NAME)');
    }
    if (header.interval == null) {
      this.add('MISSING_INTERVAL', 'info', 'No observation interval in header');
    }
    if (Object.keys(header.obsTypes).length === 0) {
      this.add('NO_OBS_TYPES', 'error', 'No observation types defined in header');
    }
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
  }

  /* ── Epoch checks ───────────────────────────────────────────── */

  onEpoch(time: number, flag: number): void {
    // Non-zero flags
    if (flag !== 0) {
      this.flagCounts.set(flag, (this.flagCounts.get(flag) ?? 0) + 1);
    }

    // Only check normal measurement epochs
    if (flag !== 0) return;

    // Duplicate epoch
    if (this.epochTimes.has(time)) {
      const d = new Date(time);
      this.add('DUPLICATE_EPOCH', 'warning', 'Duplicate epoch timestamps',
        d.toISOString().replace('T', ' ').replace('.000Z', ''));
    }
    this.epochTimes.add(time);

    // Out-of-order
    if (this.prevEpochTime !== null && time < this.prevEpochTime) {
      const d = new Date(time);
      this.add('OUT_OF_ORDER', 'warning', 'Epochs not in chronological order',
        d.toISOString().replace('T', ' ').replace('.000Z', ''));
    }

    // Large gap (>10x expected interval, or >1 hour if no interval)
    if (this.prevEpochTime !== null) {
      const gap = time - this.prevEpochTime;
      const threshold = this.intervalMs
        ? this.intervalMs * 10
        : 3600_000; // 1 hour
      if (gap > threshold && gap > 0) {
        const gapMin = (gap / 60_000).toFixed(1);
        this.add('LARGE_GAP', 'info', 'Large time gaps between epochs',
          `${gapMin} min gap at ${new Date(this.prevEpochTime).toISOString().slice(11, 19)}`);
      }
    }

    this.prevEpochTime = time;
  }

  /* ── PRN checks ─────────────────────────────────────────────── */

  onPrn(prn: string): void {
    if (this.seenPrns.has(prn)) return;
    this.seenPrns.add(prn);

    const sys = prn[0];
    const num = parseInt(prn.slice(1), 10);
    if (!sys || isNaN(num)) {
      this.add('INVALID_PRN', 'warning', 'Invalid PRN format', prn);
      return;
    }

    // Known ranges (generous — flags truly out-of-range)
    const ranges: Record<string, [number, number]> = {
      G: [1, 32], R: [1, 27], E: [1, 50], C: [1, 63],
      J: [1, 10], I: [1, 14], S: [20, 59],
    };
    const range = ranges[sys];
    if (!range) {
      this.add('UNKNOWN_SYSTEM', 'info', 'Unknown satellite system letter', prn);
    } else if (num < range[0] || num > range[1]) {
      this.add('PRN_OUT_OF_RANGE', 'info',
        `PRN number outside expected range`, `${prn} (expected ${sys}${String(range[0]).padStart(2, '0')}-${sys}${String(range[1]).padStart(2, '0')})`);
    }
  }

  /* ── Finalize ───────────────────────────────────────────────── */

  finalize(): RinexWarnings {
    // Summarize epoch flags
    for (const [flag, count] of this.flagCounts) {
      const labels: Record<number, string> = {
        1: 'Receiver clock reset',
        2: 'Moving antenna event',
        3: 'Header information follows',
        4: 'External event',
        5: 'Cycle slip records',
        6: 'Power failure recovery',
      };
      const label = labels[flag] ?? `Flag ${flag}`;
      this.add(`EPOCH_FLAG_${flag}`, 'info',
        `${label} events (flag ${flag})`, `${count} epoch(s)`);
    }

    const items = [...this.items.values()];
    // Sort: errors first, then warnings, then info
    const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
    items.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

    return {
      items,
      errorCount: items.filter(w => w.severity === 'error').length,
      warningCount: items.filter(w => w.severity === 'warning').length,
      infoCount: items.filter(w => w.severity === 'info').length,
    };
  }

  /* ── Internal ───────────────────────────────────────────────── */

  private add(code: string, severity: WarningSeverity, message: string, example?: string): void {
    let w = this.items.get(code);
    if (!w) {
      w = { code, severity, message, count: 0 };
      this.items.set(code, w);
    }
    w.count++;
    if (example) {
      if (!w.examples) w.examples = [];
      if (w.examples.length < MAX_EXAMPLES) w.examples.push(example);
    }
  }
}
