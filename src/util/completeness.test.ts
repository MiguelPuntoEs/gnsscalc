import { describe, it, expect } from 'vitest';
import { CompletenessAccumulator } from 'gnss-js/analysis';
import type { RinexHeader } from 'gnss-js/rinex';

function makeHeader(obsTypes: Record<string, string[]>): RinexHeader {
  return {
    version: 3.03,
    type: 'O',
    markerName: 'TEST',
    interval: 30,
    obsTypes,
    approxPosition: [0, 0, 0],
    glonassSlots: {},
  } as RinexHeader;
}

describe('CompletenessAccumulator', () => {
  it('tracks 100% completeness when all values present', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);

    const codes = ['C1C', 'L1C', 'S1C'];
    acc.onObservation(1000, 'G01', codes, [23456789.0, 123456789.0, 42.3]);
    acc.onObservation(2000, 'G01', codes, [23456790.0, 123456790.0, 43.1]);
    acc.onObservation(3000, 'G01', codes, [23456791.0, 123456791.0, 41.5]);

    const result = acc.finalize();
    expect(result.cells).toHaveLength(3);
    for (const cell of result.cells) {
      expect(cell.prn).toBe('G01');
      expect(cell.expected).toBe(3);
      expect(cell.present).toBe(3);
      expect(cell.percent).toBeCloseTo(100);
    }
  });

  it('tracks partial completeness with missing values', () => {
    const header = makeHeader({ G: ['C1C', 'L1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);

    const codes = ['C1C', 'L1C', 'S1C'];
    // Epoch 1: all present — marks S1C as "seen"
    acc.onObservation(1000, 'G01', codes, [23456789.0, 123456789.0, 42.3]);
    // Epoch 2: S1C missing (null)
    acc.onObservation(2000, 'G01', codes, [23456790.0, 123456790.0, null]);
    // Epoch 3: S1C zero (treated as missing)
    acc.onObservation(3000, 'G01', codes, [23456791.0, 123456791.0, 0]);

    const result = acc.finalize();
    const s1c = result.cells.find((c) => c.code === 'S1C');
    expect(s1c).toBeDefined();
    expect(s1c!.expected).toBe(3); // seen in epoch 1, so expected increments for all 3
    expect(s1c!.present).toBe(1); // only non-null/non-zero in epoch 1
    expect(s1c!.percent).toBeCloseTo(100 / 3);
  });

  it('does not count expected before a signal is first seen', () => {
    const header = makeHeader({ G: ['C1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);

    const codes = ['C1C', 'S1C'];
    // Epoch 1: S1C not yet seen (null)
    acc.onObservation(1000, 'G01', codes, [23456789.0, null]);
    // Epoch 2: S1C not yet seen (0)
    acc.onObservation(2000, 'G01', codes, [23456790.0, 0]);
    // Epoch 3: S1C first appears
    acc.onObservation(3000, 'G01', codes, [23456791.0, 40.0]);
    // Epoch 4: S1C present again
    acc.onObservation(4000, 'G01', codes, [23456792.0, 41.0]);

    const result = acc.finalize();
    const s1c = result.cells.find((c) => c.code === 'S1C');
    expect(s1c!.expected).toBe(2); // only counts from epoch 3 onwards
    expect(s1c!.present).toBe(2);
    expect(s1c!.percent).toBeCloseTo(100);
  });

  it('handles multiple satellites and systems', () => {
    const header = makeHeader({ G: ['C1C', 'S1C'], E: ['C1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);

    acc.onObservation(1000, 'G01', ['C1C', 'S1C'], [23456789.0, 42.3]);
    acc.onObservation(1000, 'G03', ['C1C', 'S1C'], [23456790.0, 38.1]);
    acc.onObservation(1000, 'E11', ['C1C', 'S1C'], [26254562.0, 40.5]);

    const result = acc.finalize();
    expect(result.systems).toContain('G');
    expect(result.systems).toContain('E');
    // 2 GPS sats x 2 codes + 1 Galileo sat x 2 codes = 6 cells
    expect(result.cells).toHaveLength(6);
  });

  it('aggregates signal stats across satellites', () => {
    const header = makeHeader({ G: ['C1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);

    const codes = ['C1C', 'S1C'];
    acc.onObservation(1000, 'G01', codes, [23456789.0, 42.3]);
    acc.onObservation(1000, 'G03', codes, [23456790.0, 38.1]);
    acc.onObservation(2000, 'G01', codes, [23456789.1, 42.4]);
    acc.onObservation(2000, 'G03', codes, [23456790.1, null]); // G03 S1C missing

    const result = acc.finalize();
    const s1cStat = result.signalStats.find((s) => s.code === 'S1C');
    expect(s1cStat).toBeDefined();
    expect(s1cStat!.satellites).toBe(2);
    // G01: 2 expected, 2 present; G03: 2 expected, 1 present → total 4 expected, 3 present
    expect(s1cStat!.expected).toBe(4);
    expect(s1cStat!.present).toBe(3);
    expect(s1cStat!.percent).toBeCloseTo(75);
  });

  it('sorts systems in standard order (G, R, E, C)', () => {
    const header = makeHeader({ E: ['C1C'], G: ['C1C'], C: ['C1C'] });
    const acc = new CompletenessAccumulator(header);

    acc.onObservation(1000, 'C19', ['C1C'], [26000000.0]);
    acc.onObservation(1000, 'E11', ['C1C'], [26254562.0]);
    acc.onObservation(1000, 'G01', ['C1C'], [23456789.0]);

    const result = acc.finalize();
    expect(result.systems).toEqual(['G', 'E', 'C']);
  });

  it('returns empty result when no observations', () => {
    const header = makeHeader({ G: ['C1C', 'S1C'] });
    const acc = new CompletenessAccumulator(header);
    const result = acc.finalize();

    expect(result.cells).toHaveLength(0);
    expect(result.signalStats).toHaveLength(0);
    expect(result.systems).toHaveLength(0);
  });
});
