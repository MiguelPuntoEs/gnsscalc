import { describe, it, expect, beforeEach } from 'vitest';
import { decodeMsmFull, msmEpochToDate, resetGloFreqCache } from './rtcm3-msm';
import type { Rtcm3Frame } from './ntrip';

/* ================================================================== */
/*  Helpers to build synthetic MSM frames                              */
/* ================================================================== */

class BitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private bitPos = 0; // bits written in currentByte (0-7)

  writeU(value: number, numBits: number): void {
    for (let i = numBits - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      this.currentByte = (this.currentByte << 1) | bit;
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitPos = 0;
      }
    }
  }

  writeS(value: number, numBits: number): void {
    // Two's complement
    const mask = (1 << numBits) - 1;
    this.writeU(value & mask, numBits);
  }

  toUint8Array(): Uint8Array {
    const result = [...this.bytes];
    if (this.bitPos > 0) {
      result.push(this.currentByte << (8 - this.bitPos));
    }
    return new Uint8Array(result);
  }
}

/**
 * Build a minimal MSM4 frame for GPS with given satellites and signals.
 */
function buildMsm4Frame(opts: {
  messageType: number;
  satIndices: number[];   // 1-based satellite indices in the 64-bit mask
  sigIndices: number[];   // 0-based signal indices in the 32-bit mask
  // All cells active unless specified
  cellValues?: {
    psr: number;     // raw signed 15-bit
    cp: number;      // raw signed 22-bit
    ll: number;      // 4-bit lock time
    hc: number;      // 1-bit half cycle
    cnr: number;     // 6-bit C/N0
  }[];
}): Rtcm3Frame {
  const { messageType, satIndices, sigIndices } = opts;
  const w = new BitWriter();

  // Message type (12 bits)
  w.writeU(messageType, 12);
  // Station ID (12 bits)
  w.writeU(0, 12);
  // Epoch time (30 bits) — use 100000 ms
  w.writeU(100000, 30);
  // Multiple message (1), IODS (3), reserved (7), clock steering (2),
  // external clock (2), smoothing (1), smoothing interval (3)
  w.writeU(0, 1 + 3 + 7 + 2 + 2 + 1 + 3);

  // Satellite mask (64 bits)
  let satMaskHi = 0;
  let satMaskLo = 0;
  for (const idx of satIndices) {
    if (idx <= 32) satMaskHi |= (1 << (32 - idx));
    else satMaskLo |= (1 << (64 - idx));
  }
  w.writeU(satMaskHi >>> 0, 32);
  w.writeU(satMaskLo >>> 0, 32);

  // Signal mask (32 bits)
  let sigMask = 0;
  for (const idx of sigIndices) {
    sigMask |= (1 << (31 - idx));
  }
  w.writeU(sigMask >>> 0, 32);

  const numSat = satIndices.length;
  const numSig = sigIndices.length;

  // Cell mask (all active)
  for (let i = 0; i < numSat * numSig; i++) {
    w.writeU(1, 1);
  }

  // Satellite data (MSM4): rrint(8) + extsat(4) + rrmod(10) per sat
  for (let j = 0; j < numSat; j++) {
    w.writeU(80, 8);  // ~80ms rough range integer
  }
  for (let j = 0; j < numSat; j++) {
    w.writeU(0, 4);   // extended sat info
  }
  for (let j = 0; j < numSat; j++) {
    w.writeU(512, 10); // ~0.5ms fractional rough range
  }

  // Signal data (MSM4): psr(s15) + cp(s22) + ll(4) + hc(1) + cnr(6)
  const numCells = numSat * numSig;
  const cells = opts.cellValues ?? Array.from({ length: numCells }, () => ({
    psr: 1000, cp: 2000, ll: 6, hc: 0, cnr: 42,
  }));

  for (let i = 0; i < numCells; i++) w.writeS(cells[i]!.psr, 15);
  for (let i = 0; i < numCells; i++) w.writeS(cells[i]!.cp, 22);
  for (let i = 0; i < numCells; i++) w.writeU(cells[i]!.ll, 4);
  for (let i = 0; i < numCells; i++) w.writeU(cells[i]!.hc, 1);
  for (let i = 0; i < numCells; i++) w.writeU(cells[i]!.cnr, 6);

  const payload = w.toUint8Array();
  return { messageType, length: payload.length, payload };
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

beforeEach(() => {
  resetGloFreqCache();
});

describe('decodeMsmFull', () => {
  it('returns null for non-MSM messages', () => {
    const frame: Rtcm3Frame = {
      messageType: 1005,
      length: 20,
      payload: new Uint8Array(20),
    };
    expect(decodeMsmFull(frame)).toBeNull();
  });

  it('returns null for MSM1-3', () => {
    const frame: Rtcm3Frame = {
      messageType: 1073,
      length: 20,
      payload: new Uint8Array(20),
    };
    expect(decodeMsmFull(frame)).toBeNull();
  });

  it('decodes GPS MSM4 with one satellite and one signal', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1], // G01
      sigIndices: [1], // signal index 1 → "1C"
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch).not.toBeNull();
    expect(epoch!.system).toBe('G');
    expect(epoch!.messageType).toBe(1074);
    expect(epoch!.observations).toHaveLength(1);

    const obs = epoch!.observations[0]!;
    expect(obs.prn).toBe('G01');
    expect(obs.system).toBe('G');
    expect(obs.signals).toHaveLength(1);
    expect(obs.signals[0]!.rinexCode).toBe('1C');
    expect(obs.signals[0]!.pseudorange).toBeGreaterThan(0);
    expect(obs.signals[0]!.phase).toBeGreaterThan(0);
    expect(obs.signals[0]!.cn0).toBe(42);
    expect(obs.signals[0]!.wavelength).toBeCloseTo(0.190294, 4);
  });

  it('decodes GPS MSM4 with multiple satellites', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1, 5, 10], // G01, G05, G10
      sigIndices: [1],        // "1C"
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch).not.toBeNull();
    expect(epoch!.observations).toHaveLength(3);
    expect(epoch!.observations.map(o => o.prn)).toEqual(['G01', 'G05', 'G10']);
  });

  it('decodes GPS MSM4 with multiple signals', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1],
      sigIndices: [1, 7], // "1C" (L1) and "2C" (L2)
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch).not.toBeNull();
    expect(epoch!.observations).toHaveLength(1);
    expect(epoch!.observations[0]!.signals).toHaveLength(2);
    expect(epoch!.observations[0]!.signals.map(s => s.rinexCode)).toEqual(['1C', '2C']);
  });

  it('decodes Galileo MSM4', () => {
    const frame = buildMsm4Frame({
      messageType: 1094, // Galileo MSM4
      satIndices: [1, 2],
      sigIndices: [1], // "1C" (E1)
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch).not.toBeNull();
    expect(epoch!.system).toBe('E');
    expect(epoch!.observations).toHaveLength(2);
    expect(epoch!.observations[0]!.prn).toBe('E01');
    expect(epoch!.observations[0]!.signals[0]!.rinexCode).toBe('1C');
  });

  it('decodes BeiDou MSM4', () => {
    const frame = buildMsm4Frame({
      messageType: 1124, // BDS MSM4
      satIndices: [3],
      sigIndices: [1], // "2I" (B1)
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch).not.toBeNull();
    expect(epoch!.system).toBe('C');
    expect(epoch!.observations[0]!.prn).toBe('C03');
    expect(epoch!.observations[0]!.signals[0]!.rinexCode).toBe('2I');
  });

  it('skips unknown signal indices', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1],
      sigIndices: [0], // index 0 → EMPTY (no code)
    });

    const epoch = decodeMsmFull(frame);
    // The satellite might have 0 signals if all are unknown
    expect(epoch).not.toBeNull();
    expect(epoch!.observations).toHaveLength(0);
  });

  it('reports C/N0 = 0 as undefined', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1],
      sigIndices: [1],
      cellValues: [{ psr: 1000, cp: 2000, ll: 0, hc: 0, cnr: 0 }],
    });

    const epoch = decodeMsmFull(frame);
    expect(epoch!.observations[0]!.signals[0]!.cn0).toBeUndefined();
  });

  it('reports lock time from indicator', () => {
    const frame = buildMsm4Frame({
      messageType: 1074,
      satIndices: [1],
      sigIndices: [1],
      cellValues: [{ psr: 1000, cp: 2000, ll: 6, hc: 0, cnr: 42 }],
    });

    const epoch = decodeMsmFull(frame);
    // LTI 6 for MSM4 → 1.024 seconds
    expect(epoch!.observations[0]!.signals[0]!.lockTime).toBeCloseTo(1.024, 3);
  });
});

describe('msmEpochToDate', () => {
  it('converts GPS epoch time', () => {
    // epochMs = 86400000 means 1 day into the GPS week
    // With any ref time, the result should be a valid date near the ref
    const refTime = new Date('2024-03-10T12:00:00Z');
    const date = msmEpochToDate('G', 86400000, refTime);
    expect(date).toBeInstanceOf(Date);
    // Should be within a week of the reference time
    expect(Math.abs(date.getTime() - refTime.getTime())).toBeLessThan(7 * 86400000);
  });

  it('converts BDS epoch time', () => {
    const refTime = new Date('2024-03-10T12:00:00Z');
    const date = msmEpochToDate('C', 0, refTime);
    // BDS week start
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBeGreaterThan(0);
  });
});
