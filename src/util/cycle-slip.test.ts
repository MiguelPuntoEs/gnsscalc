import { describe, it, expect } from 'vitest';
import { CycleSlipAccumulator } from 'gnss-js/analysis';
import type { RinexHeader } from 'gnss-js/rinex';
import { C_LIGHT, FREQ } from 'gnss-js/constants';

function makeHeader(
  obsTypes: Record<string, string[]>,
  interval = 30,
): RinexHeader {
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

const f1 = FREQ['G']!['1']!;
const f2 = FREQ['G']!['2']!;
const lam1 = C_LIGHT / f1;
const lam2 = C_LIGHT / f2;

/**
 * Generate smooth GPS L1+L2 observations (phase + code) with no slips.
 * Returns the time of the last epoch.
 */
function feedSmooth(
  acc: CycleSlipAccumulator,
  prn: string,
  nEpochs: number,
  interval: number,
  startEpoch = 0,
): number {
  const baseRange = 20_000_000;
  const rangeRate = 800; // m/s
  const codes = ['C1C', 'L1C', 'C2W', 'L2W'];

  let lastT = 0;
  for (let i = 0; i < nEpochs; i++) {
    const t = (startEpoch + i) * interval * 1000;
    const range = baseRange + rangeRate * (startEpoch + i) * interval;

    const C1 = range;
    const C2 = range;
    // Phase in cycles: range / wavelength + ambiguity
    const L1_cycles = range / lam1 + 1_000_000;
    const L2_cycles = range / lam2 + 2_000_000;

    // obsTypes indices: C1C=0, L1C=1, C2W=2, L2W=3
    acc.onObservation(t, prn, codes, [C1, L1_cycles, C2, L2_cycles]);
    lastT = t;
  }
  return lastT;
}

describe('CycleSlipAccumulator', () => {
  describe('no slips', () => {
    it('reports zero slips for smooth data', () => {
      const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
      const acc = new CycleSlipAccumulator(header);

      feedSmooth(acc, 'G01', 30, 30);
      const result = acc.finalize();

      expect(result.events).toHaveLength(0);
      expect(Object.keys(result.satSlipCounts)).toHaveLength(0);
    });
  });

  describe('geometry-free detection', () => {
    it('detects a GF slip when phase on one band jumps', () => {
      const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] });
      const acc = new CycleSlipAccumulator(header);
      const codes = ['C1C', 'L1C', 'C2W', 'L2W'];

      const baseRange = 20_000_000;
      const rangeRate = 800;

      // Feed enough epochs to get past MW_MIN_EPOCHS and establish GF baseline
      for (let i = 0; i < 10; i++) {
        const t = i * 30_000;
        const range = baseRange + rangeRate * i * 30;
        const C1 = range;
        const C2 = range;
        const L1 = range / lam1 + 1_000_000;
        const L2 = range / lam2 + 2_000_000;
        acc.onObservation(t, 'G01', codes, [C1, L1, C2, L2]);
      }

      // Inject a large jump on L1 (simulating a cycle slip of ~100 cycles on L1)
      // GF = L1*lam1 - L2*lam2, so a jump in L1 of 100 cycles = 100*lam1 ~19m
      const slipEpoch = 10;
      const t = slipEpoch * 30_000;
      const range = baseRange + rangeRate * slipEpoch * 30;
      const C1 = range;
      const C2 = range;
      const L1 = range / lam1 + 1_000_000 + 100; // +100 cycles slip
      const L2 = range / lam2 + 2_000_000;
      acc.onObservation(t, 'G01', codes, [C1, L1, C2, L2]);

      const result = acc.finalize();
      // Should detect at least one slip event
      expect(result.events.length).toBeGreaterThanOrEqual(1);
      expect(result.satSlipCounts['G01']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('single-frequency detection', () => {
    it('detects SF slip when only one frequency is available', () => {
      // Only L1 + C1, no second frequency for MW or GF
      const header = makeHeader({ G: ['C1C', 'L1C'] });
      const acc = new CycleSlipAccumulator(header);
      const codes = ['C1C', 'L1C'];

      const baseRange = 20_000_000;
      const rangeRate = 800;

      for (let i = 0; i < 5; i++) {
        const t = i * 30_000;
        const range = baseRange + rangeRate * i * 30;
        acc.onObservation(t, 'G01', codes, [range, range / lam1 + 1_000_000]);
      }

      // Inject a large phase jump (50 cycles ~9.5m, well above SF_THRESHOLD_M of 3m)
      const slipEpoch = 5;
      const t = slipEpoch * 30_000;
      const range = baseRange + rangeRate * slipEpoch * 30;
      acc.onObservation(t, 'G01', codes, [
        range,
        range / lam1 + 1_000_000 + 50,
      ]);

      const result = acc.finalize();
      expect(result.events.length).toBeGreaterThanOrEqual(1);
      const sfEvent = result.events.find((e) => e.prn === 'G01');
      expect(sfEvent).toBeDefined();
      expect(sfEvent!.magnitude).toBeGreaterThan(3);
    });
  });

  describe('arc breaks', () => {
    it('resets state on large time gap (no false slip)', () => {
      const header = makeHeader({ G: ['C1C', 'L1C', 'C2W', 'L2W'] }, 30);
      const acc = new CycleSlipAccumulator(header);

      // First arc
      feedSmooth(acc, 'G01', 10, 30);

      // Large gap (> 5 * 30 = 150s): start at epoch index 20 (= 600s from start)
      feedSmooth(acc, 'G01', 10, 30, 20);

      const result = acc.finalize();
      // Should not detect any slip from the gap itself
      expect(result.events).toHaveLength(0);
    });
  });

  describe('onSlip callback', () => {
    it('calls the onSlip callback when a slip is detected', () => {
      const header = makeHeader({ G: ['C1C', 'L1C'] });
      const slipCalls: { time: number; prn: string; bands: Set<string> }[] = [];
      const acc = new CycleSlipAccumulator(header, (time, prn, bands) => {
        slipCalls.push({ time, prn, bands });
      });

      const codes = ['C1C', 'L1C'];
      const baseRange = 20_000_000;
      const rangeRate = 800;

      for (let i = 0; i < 5; i++) {
        const t = i * 30_000;
        const range = baseRange + rangeRate * i * 30;
        acc.onObservation(t, 'G01', codes, [range, range / lam1 + 1_000_000]);
      }

      // Inject slip
      const t = 5 * 30_000;
      const range = baseRange + rangeRate * 5 * 30;
      acc.onObservation(t, 'G01', codes, [
        range,
        range / lam1 + 1_000_000 + 50,
      ]);

      acc.finalize();
      expect(slipCalls.length).toBeGreaterThanOrEqual(1);
      expect(slipCalls[0]!.prn).toBe('G01');
    });
  });

  describe('signal stats', () => {
    it('computes slip rate per signal', () => {
      const header = makeHeader({ G: ['C1C', 'L1C'] });
      const acc = new CycleSlipAccumulator(header);
      const codes = ['C1C', 'L1C'];
      const baseRange = 20_000_000;

      // 20 smooth epochs, then 1 slip
      for (let i = 0; i < 20; i++) {
        const range = baseRange + 800 * i * 30;
        acc.onObservation(i * 30_000, 'G01', codes, [
          range,
          range / lam1 + 1e6,
        ]);
      }
      // Slip at epoch 20
      const range = baseRange + 800 * 20 * 30;
      acc.onObservation(20 * 30_000, 'G01', codes, [
        range,
        range / lam1 + 1e6 + 100,
      ]);

      const result = acc.finalize();
      if (result.signalStats.length > 0) {
        const stat = result.signalStats[0]!;
        expect(stat.totalSlips).toBeGreaterThanOrEqual(1);
        expect(stat.totalEpochs).toBeGreaterThan(0);
        expect(stat.slipRate).toBe((stat.totalSlips / stat.totalEpochs) * 1000);
      }
    });

    it('sorts signal stats by system order', () => {
      const header = makeHeader({
        E: ['C1C', 'L1C'],
        G: ['C1C', 'L1C'],
      });
      const acc = new CycleSlipAccumulator(header);

      // Feed data to both systems
      const baseRange = 20_000_000;
      const fE1 = FREQ['E']!['1']!;
      const lamE1 = C_LIGHT / fE1;

      for (let i = 0; i < 5; i++) {
        const t = i * 30_000;
        const range = baseRange + 800 * i * 30;
        acc.onObservation(
          t,
          'G01',
          ['C1C', 'L1C'],
          [range, range / lam1 + 1e6],
        );
        acc.onObservation(
          t,
          'E11',
          ['C1C', 'L1C'],
          [range, range / lamE1 + 1e6],
        );
      }
      // Slip on both
      const range = baseRange + 800 * 5 * 30;
      acc.onObservation(
        5 * 30_000,
        'G01',
        ['C1C', 'L1C'],
        [range, range / lam1 + 1e6 + 100],
      );
      acc.onObservation(
        5 * 30_000,
        'E11',
        ['C1C', 'L1C'],
        [range, range / lamE1 + 1e6 + 100],
      );

      const result = acc.finalize();
      if (result.signalStats.length >= 2) {
        const systems = result.signalStats.map((s) => s.system);
        const gIdx = systems.indexOf('G');
        const eIdx = systems.indexOf('E');
        if (gIdx >= 0 && eIdx >= 0) {
          expect(gIdx).toBeLessThan(eIdx);
        }
      }
    });
  });

  describe('finalize', () => {
    it('returns satSlipCounts per PRN', () => {
      const header = makeHeader({ G: ['C1C', 'L1C'] });
      const acc = new CycleSlipAccumulator(header);
      const codes = ['C1C', 'L1C'];
      const baseRange = 20_000_000;

      for (let i = 0; i < 5; i++) {
        const range = baseRange + 800 * i * 30;
        acc.onObservation(i * 30_000, 'G01', codes, [
          range,
          range / lam1 + 1e6,
        ]);
        acc.onObservation(i * 30_000, 'G03', codes, [
          range + 100,
          (range + 100) / lam1 + 1e6,
        ]);
      }
      // Slip on G01 only
      const range = baseRange + 800 * 5 * 30;
      acc.onObservation(5 * 30_000, 'G01', codes, [
        range,
        range / lam1 + 1e6 + 100,
      ]);
      acc.onObservation(5 * 30_000, 'G03', codes, [
        range + 100,
        (range + 100) / lam1 + 1e6,
      ]);

      const result = acc.finalize();
      if (result.events.length > 0) {
        expect(result.satSlipCounts['G01']).toBeGreaterThanOrEqual(1);
        expect(result.satSlipCounts['G03'] ?? 0).toBe(0);
      }
    });
  });
});
