import { describe, it, expect } from 'vitest';
import { MultipathAccumulator } from './multipath';
import type { RinexHeader } from './rinex';
import { C_LIGHT, FREQ } from './gnss-constants';

function makeHeader(obsTypes: Record<string, string[]>, interval = 30): RinexHeader {
  return {
    version: 3.03,
    type: 'O',
    markerName: 'TEST',
    interval,
    obsTypes,
    approxPosition: [0, 0, 0],
    glonassSlots: {},
  } as RinexHeader;
}

/**
 * Generate synthetic GPS L1/L2 observations for multipath testing.
 * Feeds the accumulator a series of epochs with constant-geometry (no real multipath),
 * so the debiased MP values should be near zero.
 */
function feedGpsDualFreq(
  acc: MultipathAccumulator,
  prn: string,
  nEpochs: number,
  interval: number,
  mpBias: number = 0, // constant bias added to code on band 1
) {
  const f1 = FREQ['G']!['1']!;
  const f2 = FREQ['G']!['2']!;
  const lam1 = C_LIGHT / f1;
  const lam2 = C_LIGHT / f2;

  // Simulate a satellite at ~20,000 km range, moving slowly
  const baseRange = 20_000_000; // metres
  const rangeRate = 800; // m/s (typical)

  for (let i = 0; i < nEpochs; i++) {
    const t = i * interval * 1000; // ms
    const range = baseRange + rangeRate * i * interval;

    // Code = range + multipath bias on L1
    const C1 = range + mpBias;
    const C2 = range; // no bias on L2

    // Phase in cycles: range / wavelength (plus arbitrary integer ambiguity)
    const L1 = range / lam1 + 1000000; // ambiguity offset
    const L2 = range / lam2 + 2000000;

    // obsTypes: G: ['C1C', 'L1C', 'C2W', 'L2W']
    // indices:       0       1      2      3
    const values: (number | null)[] = [C1, L1, C2, L2];
    acc.onObservation(t, prn, ['C1C', 'L1C', 'C2W', 'L2W'], values);
  }
}

describe('MultipathAccumulator', () => {
  it('produces no series when fewer than 10 epochs (MIN_ARC_LENGTH)', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    feedGpsDualFreq(acc, 'G01', 5, 30);
    const result = acc.finalize();

    expect(result.series).toHaveLength(0);
    expect(result.signalStats).toHaveLength(0);
  });

  it('produces series when arc has >= 10 epochs', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    feedGpsDualFreq(acc, 'G01', 15, 30);
    const result = acc.finalize();

    // Should have at least one series for band 1 (MP1-2)
    expect(result.series.length).toBeGreaterThanOrEqual(1);
    expect(result.series[0]!.prn).toBe('G01');
    expect(result.series[0]!.system).toBe('G');
    expect(result.series[0]!.points).toHaveLength(15);
  });

  it('debiased MP values sum to zero (mean removal)', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    feedGpsDualFreq(acc, 'G01', 20, 30, 0.5);
    const result = acc.finalize();

    for (const series of result.series) {
      const sum = series.points.reduce((s, p) => s + p.mp, 0);
      // After mean removal, sum should be ~0
      expect(Math.abs(sum)).toBeLessThan(1e-6);
    }
  });

  it('computes RMS correctly', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    feedGpsDualFreq(acc, 'G01', 20, 30);
    const result = acc.finalize();

    for (const series of result.series) {
      // RMS should be sqrt(mean(mp^2))
      const manualRms = Math.sqrt(
        series.points.reduce((s, p) => s + p.mp * p.mp, 0) / series.points.length,
      );
      expect(series.rms).toBeCloseTo(manualRms, 10);
    }
  });

  it('breaks arcs on time gaps', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] }, 30);
    const acc = new MultipathAccumulator(header);

    // First arc: 12 epochs at 30s interval
    feedGpsDualFreq(acc, 'G01', 12, 30);

    // Gap: skip a large time interval (> 5 * 30 = 150s)
    const gapTime = 12 * 30 * 1000 + 300_000; // 300s gap

    // Second arc: 12 more epochs
    const f1 = FREQ['G']!['1']!;
    const f2 = FREQ['G']!['2']!;
    const lam1 = C_LIGHT / f1;
    const lam2 = C_LIGHT / f2;
    for (let i = 0; i < 12; i++) {
      const t = gapTime + i * 30 * 1000;
      const range = 20_000_000 + 800 * (t / 1000);
      const values: (number | null)[] = [range, range / lam1 + 1e6, range, range / lam2 + 2e6];
      acc.onObservation(t, 'G01', ['C1C', 'L1C', 'C2W', 'L2W'], values);
    }

    const result = acc.finalize();
    // Should have 2 arcs per band pair (L1-L2), so at least 2 series for G01
    const g01Series = result.series.filter(s => s.prn === 'G01' && s.band === '1');
    expect(g01Series.length).toBe(2);
  });

  it('notifySlip closes the affected arc', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] }, 30);
    const acc = new MultipathAccumulator(header);

    // Feed 12 epochs
    feedGpsDualFreq(acc, 'G01', 12, 30);

    // Notify a slip at some point after epoch 12, affecting band 1
    const slipTime = 12 * 30 * 1000;
    acc.notifySlip(slipTime, 'G01', new Set(['1']));

    // Feed 12 more epochs continuously (no time gap)
    const f1 = FREQ['G']!['1']!;
    const f2 = FREQ['G']!['2']!;
    const lam1 = C_LIGHT / f1;
    const lam2 = C_LIGHT / f2;
    for (let i = 12; i < 24; i++) {
      const t = i * 30 * 1000;
      const range = 20_000_000 + 800 * i * 30;
      const values: (number | null)[] = [range, range / lam1 + 1e6, range, range / lam2 + 2e6];
      acc.onObservation(t, 'G01', ['C1C', 'L1C', 'C2W', 'L2W'], values);
    }

    const result = acc.finalize();
    // The slip should have caused 2 arcs for band pair 1-2
    const series12 = result.series.filter(s => s.prn === 'G01' && s.band === '1' && s.refBand === '2');
    expect(series12.length).toBe(2);
  });

  it('aggregates signal stats across multiple satellites', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    feedGpsDualFreq(acc, 'G01', 15, 30);
    feedGpsDualFreq(acc, 'G03', 15, 30, 1.0);

    const result = acc.finalize();
    // Should have signal stats for GPS MP L1-L2
    const stat = result.signalStats.find(s => s.system === 'G' && s.band === '1');
    expect(stat).toBeDefined();
    expect(stat!.satellites).toBe(2);
    expect(stat!.count).toBeGreaterThan(0);
    expect(stat!.rms).toBeGreaterThanOrEqual(0);
  });

  it('skips observations with only one frequency', () => {
    const header = makeHeader({ G: ['C1C', 'L1C'] }); // only L1, no L2
    const acc = new MultipathAccumulator(header);

    for (let i = 0; i < 20; i++) {
      const t = i * 30 * 1000;
      acc.onObservation(t, 'G01', ['C1C', 'L1C'], [23456789.0 + i, 123456789.0 + i]);
    }

    const result = acc.finalize();
    expect(result.series).toHaveLength(0);
  });

  it('skips observations with null/zero values', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    for (let i = 0; i < 20; i++) {
      const t = i * 30 * 1000;
      // L2W is always null
      acc.onObservation(t, 'G01', ['C1C', 'L1C', 'C2W', 'L2W'], [23456789.0, 123456789.0, 0, null]);
    }

    const result = acc.finalize();
    expect(result.series).toHaveLength(0);
  });

  it('handles non-finite MP values gracefully', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
    const acc = new MultipathAccumulator(header);

    // Feed NaN/Infinity values — should be silently ignored
    for (let i = 0; i < 20; i++) {
      const t = i * 30 * 1000;
      acc.onObservation(t, 'G01', ['C1C', 'L1C', 'C2W', 'L2W'], [NaN, Infinity, -Infinity, 0]);
    }

    const result = acc.finalize();
    expect(result.series).toHaveLength(0);
  });
});
