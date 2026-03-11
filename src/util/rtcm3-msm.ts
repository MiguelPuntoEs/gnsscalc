/**
 * Full RTCM3 MSM4-7 decoder — extracts pseudorange, carrier phase,
 * Doppler, and C/N0 for every satellite × signal cell.
 *
 * Reference: BNC 2.13.4 RTCM3Decoder.cpp (BKG) and RTCM 10403.3 §3.5.
 *
 * Only MSM types 4-7 are decoded (full data). Types 1-3 carry partial
 * data and are skipped.
 */

import type { Rtcm3Frame } from './ntrip';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const LIGHTSPEED = 299792458.0;

/* Frequencies (Hz) */
const GPS_L1  = 1575420000.0;
const GPS_L2  = 1227600000.0;
const GPS_L5  = 1176450000.0;

const GLO_L1_BASE = 1602000000.0;
const GLO_L1_STEP = 562500.0;
const GLO_L2_BASE = 1246000000.0;
const GLO_L2_STEP = 437500.0;
const GLO_L1a = 1600995000.0;
const GLO_L2a = 1248060000.0;
const GLO_L3  = 1202025000.0;

const GAL_E1  = 1575420000.0;
const GAL_E5a = 1176450000.0;
const GAL_E5b = 1207140000.0;
const GAL_E5  = 1191795000.0;
const GAL_E6  = 1278750000.0;

const BDS_B1  = 1561098000.0;
const BDS_B3  = 1268520000.0;
const BDS_B2  = 1207140000.0;
const BDS_B1C = 1575420000.0;
const BDS_B2a = 1176450000.0;
const BDS_B2b = 1207140000.0;

const QZSS_L6 = 1278750000.0;
const NAVIC_S = 2492028000.0;

/* ================================================================== */
/*  Signal mapping: RTCM signal index → { RINEX 2-char code, freq Hz} */
/* ================================================================== */

interface SignalDef {
  code: string;  // e.g. "1C", "5X"
  freq: number;  // Hz (0 for GLONASS FDMA — computed per-satellite)
}

const EMPTY: SignalDef = { code: '', freq: 0 };

function sd(code: string, freq: number): SignalDef { return { code, freq }; }

/** GPS / SBAS signal table, indexed [0..31] by RTCM signal ID */
const GPS_SIGNALS: SignalDef[] = [
  EMPTY,
  sd('1C', GPS_L1),  sd('1P', GPS_L1),  sd('1W', GPS_L1),  // 1-3
  EMPTY, EMPTY, EMPTY,                                       // 4-6
  sd('2C', GPS_L2),  sd('2P', GPS_L2),  sd('2W', GPS_L2),  // 7-9
  EMPTY, EMPTY, EMPTY, EMPTY,                                // 10-13
  sd('2S', GPS_L2),  sd('2L', GPS_L2),  sd('2X', GPS_L2),  // 14-16
  EMPTY, EMPTY, EMPTY, EMPTY,                                // 17-20
  sd('5I', GPS_L5),  sd('5Q', GPS_L5),  sd('5X', GPS_L5),  // 21-23
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,                         // 24-28
  sd('1S', GPS_L1),  sd('1L', GPS_L1),  sd('1X', GPS_L1),  // 29-31
];

const GLO_SIGNALS: SignalDef[] = [
  EMPTY,
  sd('1C', 0),       sd('1P', 0),       EMPTY,              // 1-3 (L1, freq per-sat)
  EMPTY, EMPTY, EMPTY,                                       // 4-6
  sd('2C', 1),       sd('2P', 1),                            // 7-8 (L2, marker=1)
  sd('4A', GLO_L1a), sd('4B', GLO_L1a), sd('4X', GLO_L1a), // 9-11
  sd('6A', GLO_L2a), sd('6B', GLO_L2a), sd('6X', GLO_L2a), // 12-14
  sd('3I', GLO_L3),  sd('3Q', GLO_L3),  sd('3X', GLO_L3),  // 15-17
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,           // 18-24
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,           // 25-31
];

const GAL_SIGNALS: SignalDef[] = [
  EMPTY,
  sd('1C', GAL_E1),   sd('1A', GAL_E1),   sd('1B', GAL_E1),   // 1-3
  sd('1X', GAL_E1),   sd('1Z', GAL_E1),   EMPTY,               // 4-6
  sd('6C', GAL_E6),   sd('6A', GAL_E6),   sd('6B', GAL_E6),   // 7-9
  sd('6X', GAL_E6),   sd('6Z', GAL_E6),   EMPTY,               // 10-12
  sd('7I', GAL_E5b),  sd('7Q', GAL_E5b),  sd('7X', GAL_E5b), // 13-15
  EMPTY,                                                         // 16
  sd('8I', GAL_E5),   sd('8Q', GAL_E5),   sd('8X', GAL_E5),  // 17-19
  EMPTY,                                                         // 20
  sd('5I', GAL_E5a),  sd('5Q', GAL_E5a),  sd('5X', GAL_E5a), // 21-23
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,       // 24-31
];

const BDS_SIGNALS: SignalDef[] = [
  EMPTY,
  sd('2I', BDS_B1),   sd('2Q', BDS_B1),   sd('2X', BDS_B1),   // 1-3
  EMPTY, EMPTY, EMPTY,                                           // 4-6
  sd('6I', BDS_B3),   sd('6Q', BDS_B3),   sd('6X', BDS_B3),   // 7-9
  EMPTY, EMPTY, EMPTY,                                           // 10-12
  sd('7I', BDS_B2),   sd('7Q', BDS_B2),   sd('7X', BDS_B2),   // 13-15
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,                             // 16-20
  sd('5D', BDS_B2a),  sd('5P', BDS_B2a),  sd('5X', BDS_B2a), // 21-23
  sd('7D', BDS_B2b),                                             // 24
  EMPTY, EMPTY, EMPTY, EMPTY,                                   // 25-28
  sd('1D', BDS_B1C),  sd('1P', BDS_B1C),  sd('1X', BDS_B1C), // 29-31
];

const QZSS_SIGNALS: SignalDef[] = [
  EMPTY,
  sd('1C', GPS_L1),   EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,       // 1-6
  EMPTY,
  sd('6S', QZSS_L6),  sd('6L', QZSS_L6),  sd('6X', QZSS_L6), // 8-10
  EMPTY, EMPTY, EMPTY,                                           // 11-13
  sd('2S', GPS_L2),   sd('2L', GPS_L2),   sd('2X', GPS_L2),   // 14-16
  EMPTY, EMPTY, EMPTY, EMPTY,                                   // 17-20
  sd('5I', GPS_L5),   sd('5Q', GPS_L5),   sd('5X', GPS_L5),   // 21-23
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,                             // 24-28
  sd('1S', GPS_L1),   sd('1L', GPS_L1),   sd('1X', GPS_L1),   // 29-31
];

const NAVIC_SIGNALS: SignalDef[] = [
  EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY,
  sd('9A', NAVIC_S),
  ...Array.from({ length: 24 }, () => EMPTY),
];

const SBAS_SIGNALS = GPS_SIGNALS; // SBAS uses same signal defs as GPS

/** Select signal table based on system letter */
function signalTable(sys: string): SignalDef[] {
  switch (sys) {
    case 'G': return GPS_SIGNALS;
    case 'R': return GLO_SIGNALS;
    case 'E': return GAL_SIGNALS;
    case 'C': return BDS_SIGNALS;
    case 'J': return QZSS_SIGNALS;
    case 'I': return NAVIC_SIGNALS;
    case 'S': return SBAS_SIGNALS;
    default: return GPS_SIGNALS;
  }
}

/* ================================================================== */
/*  Bit reader                                                         */
/* ================================================================== */

class BitReader {
  private data: Uint8Array;
  private pos: number;

  constructor(data: Uint8Array, startBit = 0) {
    this.data = data;
    this.pos = startBit;
  }

  /** Read unsigned value of numBits bits */
  u(numBits: number): number {
    let val = 0;
    for (let i = 0; i < numBits; i++) {
      const byteIdx = (this.pos + i) >>> 3;
      const bitIdx = 7 - ((this.pos + i) & 7);
      if (byteIdx < this.data.length) {
        val = (val << 1) | ((this.data[byteIdx]! >>> bitIdx) & 1);
      } else {
        val <<= 1;
      }
    }
    this.pos += numBits;
    return val;
  }

  /** Read signed value (two's complement) */
  s(numBits: number): number {
    const raw = this.u(numBits);
    const sign = 1 << (numBits - 1);
    return (raw & (sign - 1)) - (raw & sign);
  }

  /** Skip bits */
  skip(n: number): void {
    this.pos += n;
  }

  /** Current bit position */
  get position(): number {
    return this.pos;
  }
}

/* ================================================================== */
/*  Public types                                                       */
/* ================================================================== */

/** Single signal observation for one satellite */
export interface MsmSignal {
  /** RINEX 2-char obs code, e.g. "1C", "5X" */
  rinexCode: string;
  /** Pseudorange in meters (undefined if invalid) */
  pseudorange?: number;
  /** Carrier phase in cycles (undefined if invalid) */
  phase?: number;
  /** Doppler in Hz (undefined if invalid) */
  doppler?: number;
  /** Signal-to-noise ratio in dB-Hz */
  cn0?: number;
  /** Lock time in seconds */
  lockTime?: number;
  /** Half-cycle ambiguity indicator */
  halfCycle?: boolean;
  /** Wavelength used (meters) — needed for RINEX phase */
  wavelength: number;
}

/** All observations for one satellite in one epoch */
export interface MsmSatObs {
  /** PRN string, e.g. "G01", "R15", "E04" */
  prn: string;
  /** System letter: G, R, E, C, J, I, S */
  system: string;
  /** Signal observations */
  signals: MsmSignal[];
}

/** One decoded MSM epoch */
export interface MsmEpoch {
  /** Message type (1074, 1077, etc.) */
  messageType: number;
  /** Epoch time as GPS milliseconds of week (or GLONASS day-of-week ms, BDS SOW) */
  epochMs: number;
  /** System letter */
  system: string;
  /** Observations per satellite */
  observations: MsmSatObs[];
}

/* ================================================================== */
/*  GLONASS frequency number tracking (persists across messages)       */
/* ================================================================== */

const gloFreqNum = new Int8Array(64).fill(-128); // -128 = unknown

/** Get GLONASS frequency for a satellite given its slot and signal table freq marker */
function gloWavelength(satIdx: number, freqMarker: number): number {
  const k = gloFreqNum[satIdx];
  if (k === -128) return 0;
  if (freqMarker === 0) {
    // L1
    return LIGHTSPEED / (GLO_L1_BASE + k * GLO_L1_STEP);
  } else if (freqMarker === 1) {
    // L2
    return LIGHTSPEED / (GLO_L2_BASE + k * GLO_L2_STEP);
  }
  // Non-FDMA signals use fixed frequency
  return freqMarker > 0 ? LIGHTSPEED / freqMarker : 0;
}

/* ================================================================== */
/*  Lock-time indicator to seconds                                     */
/* ================================================================== */

const LTI_TABLE_4BIT = [
  0, 0.032, 0.064, 0.128, 0.256, 0.512, 1.024, 2.048,
  4.096, 8.192, 16.384, 32.768, 65.536, 131.072, 262.144, 524.288,
];

function lockTimeSec(msmType: number, lti: number): number {
  const variant = msmType % 10;
  if (variant <= 5) {
    // 4-bit lock time indicator
    return LTI_TABLE_4BIT[lti] ?? 0;
  }
  // Types 6-7: 10-bit extended indicator (piecewise linear)
  if (lti < 64) return lti;
  if (lti < 96) return (lti - 64) * 2 + 64;
  if (lti < 128) return (lti - 96) * 4 + 128;
  if (lti < 160) return (lti - 128) * 8 + 256;
  if (lti < 192) return (lti - 160) * 16 + 512;
  if (lti < 224) return (lti - 192) * 32 + 1024;
  if (lti < 256) return (lti - 224) * 64 + 2048;
  if (lti < 288) return (lti - 256) * 128 + 4096;
  if (lti < 320) return (lti - 288) * 256 + 8192;
  if (lti < 352) return (lti - 320) * 512 + 16384;
  if (lti < 384) return (lti - 352) * 1024 + 32768;
  if (lti < 416) return (lti - 384) * 2048 + 65536;
  if (lti < 448) return (lti - 416) * 4096 + 131072;
  if (lti < 480) return (lti - 448) * 8192 + 262144;
  if (lti < 512) return (lti - 480) * 16384 + 524288;
  if (lti < 544) return (lti - 512) * 32768 + 1048576;
  if (lti < 576) return (lti - 544) * 65536 + 2097152;
  if (lti < 608) return (lti - 576) * 131072 + 4194304;
  if (lti < 640) return (lti - 608) * 262144 + 8388608;
  if (lti < 672) return (lti - 640) * 524288 + 16777216;
  if (lti < 704) return (lti - 672) * 1048576 + 33554432;
  return (lti - 704) * 2097152 + 67108864;
}

/* ================================================================== */
/*  MSM decoder                                                        */
/* ================================================================== */

/** Determine system letter from message type */
function msmSystem(type: number): string {
  if (type >= 1071 && type <= 1077) return 'G';
  if (type >= 1081 && type <= 1087) return 'R';
  if (type >= 1091 && type <= 1097) return 'E';
  if (type >= 1101 && type <= 1107) return 'S';
  if (type >= 1111 && type <= 1117) return 'J';
  if (type >= 1121 && type <= 1127) return 'C';
  if (type >= 1131 && type <= 1137) return 'I';
  return '';
}

function satPrn(sys: string, satIdx1: number): string {
  const prefix = sys === 'S' ? 'S' : sys;
  const num = sys === 'S' ? satIdx1 + 119 : satIdx1; // SBAS PRNs start at 120
  return `${prefix}${String(num).padStart(2, '0')}`;
}

/**
 * Decode a single RTCM3 MSM4-7 frame into full observations.
 * Returns null for non-MSM or MSM1-3 frames.
 */
export function decodeMsmFull(frame: Rtcm3Frame): MsmEpoch | null {
  const type = frame.messageType;
  const sys = msmSystem(type);
  if (!sys) return null;

  const variant = type % 10;
  if (variant < 4 || variant > 7) return null;

  const payload = frame.payload;
  if (!payload || payload.length < 10) return null;

  try {
  const bits = new BitReader(payload);

  // ── MSM header ──
  bits.skip(12); // message type (already known)
  bits.skip(12); // reference station ID

  // Epoch timestamp (30 bits for most, different for GLONASS)
  const epochMs = bits.u(30);

  bits.skip(1);  // multiple message bit
  bits.skip(3);  // IODS
  bits.skip(7);  // reserved
  bits.skip(2);  // clock steering
  bits.skip(2);  // external clock
  bits.skip(1);  // smoothing indicator
  bits.skip(3);  // smoothing interval

  // ── Satellite mask (64 bits) ──
  // Read as two 32-bit chunks since JS bitwise ops are 32-bit
  const satMaskHi = bits.u(32) >>> 0;
  const satMaskLo = bits.u(32) >>> 0;

  const satIndices: number[] = [];
  for (let i = 0; i < 32; i++) {
    if (satMaskHi & (1 << (31 - i))) satIndices.push(i + 1);
  }
  for (let i = 0; i < 32; i++) {
    if (satMaskLo & (1 << (31 - i))) satIndices.push(i + 33);
  }
  const numSat = satIndices.length;
  if (numSat === 0) return null;

  // ── Signal mask (32 bits) ──
  const sigMask = bits.u(32) >>> 0;
  const sigIndices: number[] = [];
  for (let i = 0; i < 32; i++) {
    if (sigMask & (1 << (31 - i))) sigIndices.push(i);
  }
  const numSig = sigIndices.length;
  if (numSig === 0) return null;

  // ── Cell mask (numSat × numSig bits) ──
  const numCells = numSat * numSig;
  const cellMask: boolean[] = [];
  for (let i = 0; i < numCells; i++) {
    cellMask.push(bits.u(1) === 1);
  }

  // Count active cells
  let activeCells = 0;
  for (const c of cellMask) if (c) activeCells++;
  if (activeCells === 0) return null;

  // ── Satellite data ──
  const rrint = new Float64Array(numSat);    // integer ms of rough range
  const rrmod = new Float64Array(numSat);    // fractional ms of rough range
  const extsat = new Int8Array(numSat);      // extended info (GLO freq num)
  const rdop = new Float64Array(numSat);     // rough rate of range change (m/s)

  if (variant === 4 || variant === 6) {
    for (let j = 0; j < numSat; j++) rrint[j] = bits.u(8);
    // Extended satellite info (not present in types 4, 6 per RTCM standard)
    // Actually types 4,6 DO have 4-bit extended info:
    for (let j = 0; j < numSat; j++) extsat[j] = bits.u(4);
    for (let j = 0; j < numSat; j++) rrmod[j] = bits.u(10) / 1024;
  } else {
    // Types 5, 7
    for (let j = 0; j < numSat; j++) rrint[j] = bits.u(8);
    for (let j = 0; j < numSat; j++) extsat[j] = bits.u(4);
    for (let j = 0; j < numSat; j++) rrmod[j] = bits.u(10) / 1024;
    for (let j = 0; j < numSat; j++) rdop[j] = bits.s(14) * 1.0;
  }

  // Update GLONASS frequency numbers
  if (sys === 'R') {
    for (let j = 0; j < numSat; j++) {
      const slot = satIndices[j]!;
      if (extsat[j] !== 0) {
        gloFreqNum[slot - 1] = extsat[j]! - 7; // extsat encodes k+7
      }
    }
  }

  // ── Signal (cell) data ──
  const psr = new Float64Array(activeCells);
  const cp = new Float64Array(activeCells);
  const ll = new Uint16Array(activeCells);
  const hc = new Uint8Array(activeCells);
  const cnr = new Float64Array(activeCells);
  const dop = new Float64Array(activeCells);

  // Initialize to invalid sentinel values
  psr.fill(-1e30);
  cp.fill(-1e30);
  dop.fill(-1e30);

  if (variant === 4) {
    for (let i = 0; i < activeCells; i++) psr[i] = bits.s(15) / (1 << 24);
    for (let i = 0; i < activeCells; i++) cp[i]  = bits.s(22) / (1 << 29);
    for (let i = 0; i < activeCells; i++) ll[i]  = bits.u(4);
    for (let i = 0; i < activeCells; i++) hc[i]  = bits.u(1);
    for (let i = 0; i < activeCells; i++) cnr[i] = bits.u(6);
  } else if (variant === 5) {
    for (let i = 0; i < activeCells; i++) psr[i] = bits.s(15) / (1 << 24);
    for (let i = 0; i < activeCells; i++) cp[i]  = bits.s(22) / (1 << 29);
    for (let i = 0; i < activeCells; i++) ll[i]  = bits.u(4);
    for (let i = 0; i < activeCells; i++) hc[i]  = bits.u(1);
    for (let i = 0; i < activeCells; i++) cnr[i] = bits.u(6);
    for (let i = 0; i < activeCells; i++) dop[i] = bits.s(15) * 0.0001;
  } else if (variant === 6) {
    for (let i = 0; i < activeCells; i++) psr[i] = bits.s(20) / (1 << 29);
    for (let i = 0; i < activeCells; i++) cp[i]  = bits.s(24) / (1 << 31);
    for (let i = 0; i < activeCells; i++) ll[i]  = bits.u(10);
    for (let i = 0; i < activeCells; i++) hc[i]  = bits.u(1);
    for (let i = 0; i < activeCells; i++) cnr[i] = bits.u(10) / 16;
  } else {
    // variant === 7
    for (let i = 0; i < activeCells; i++) psr[i] = bits.s(20) / (1 << 29);
    for (let i = 0; i < activeCells; i++) cp[i]  = bits.s(24) / (1 << 31);
    for (let i = 0; i < activeCells; i++) ll[i]  = bits.u(10);
    for (let i = 0; i < activeCells; i++) hc[i]  = bits.u(1);
    for (let i = 0; i < activeCells; i++) cnr[i] = bits.u(10) / 16;
    for (let i = 0; i < activeCells; i++) dop[i] = bits.s(15) * 0.0001;
  }

  // ── Reconstruct observations ──
  const sigTable = signalTable(sys);
  const observations: MsmSatObs[] = [];

  let cellIdx = 0;
  for (let s = 0; s < numSat; s++) {
    const satIdx1 = satIndices[s]!;
    const prn = satPrn(sys, satIdx1);
    const roughRange_ms = rrint[s]! + rrmod[s]!;
    const roughRange_m = roughRange_ms * LIGHTSPEED / 1000.0;
    const roughRate_ms = rdop[s]!; // m/s

    const signals: MsmSignal[] = [];

    for (let g = 0; g < numSig; g++) {
      const maskIdx = s * numSig + g;
      if (!cellMask[maskIdx]) continue;

      const sigIdx = sigIndices[g]!;
      const sigDef = sigTable[sigIdx] ?? EMPTY;
      if (!sigDef.code) {
        cellIdx++;
        continue;
      }

      // Determine wavelength
      let wavelength: number;
      if (sys === 'R' && (sigDef.freq === 0 || sigDef.freq === 1)) {
        wavelength = gloWavelength(satIdx1 - 1, sigDef.freq);
      } else if (sigDef.freq > 0) {
        wavelength = LIGHTSPEED / sigDef.freq;
      } else {
        wavelength = 0;
      }

      const signal: MsmSignal = {
        rinexCode: sigDef.code,
        wavelength,
      };

      // Pseudorange
      const psrVal = psr[cellIdx]!;
      if (psrVal > -1 / (1 << 10)) {
        signal.pseudorange = psrVal * LIGHTSPEED / 1000.0 + roughRange_m;
      }

      // Carrier phase (in cycles)
      const cpVal = cp[cellIdx]!;
      if (cpVal > -1 / (1 << 8) && wavelength > 0) {
        signal.phase = cpVal * LIGHTSPEED / 1000.0 / wavelength
                     + roughRange_m / wavelength;
      }

      // Doppler (Hz) — only types 5, 7
      if (variant === 5 || variant === 7) {
        const dopVal = dop[cellIdx]!;
        if (dopVal > -1.6384 && wavelength > 0) {
          signal.doppler = -(dopVal + roughRate_ms) / wavelength;
        }
      }

      // C/N0
      const cnrVal = cnr[cellIdx]!;
      if (cnrVal > 0) {
        signal.cn0 = cnrVal;
      }

      // Lock time
      signal.lockTime = lockTimeSec(type, ll[cellIdx]!);
      signal.halfCycle = hc[cellIdx]! === 1;

      signals.push(signal);
      cellIdx++;
    }

    if (signals.length > 0) {
      observations.push({ prn, system: sys, signals });
    }
  }

  return {
    messageType: type,
    epochMs,
    system: sys,
    observations,
  };
  } catch {
    return null;
  }
}

/* ================================================================== */
/*  Epoch time conversion                                              */
/* ================================================================== */

/** GPS epoch: Jan 6 1980 00:00:00 UTC */
const GPS_EPOCH = Date.UTC(1980, 0, 6);
const MS_PER_WEEK = 604800000;

/**
 * Convert MSM epoch timestamp to a Date.
 * For GPS/Galileo/BDS/QZSS: epochMs is ms of GPS week.
 * For GLONASS: epochMs is day-of-week × 86400000 + ms of day (UTC+3).
 *
 * Requires an approximate reference time to resolve the current week.
 */
export function msmEpochToDate(sys: string, epochMs: number, refTime: Date = new Date()): Date {
  const refMs = refTime.getTime();

  if (sys === 'R') {
    // GLONASS time = UTC + 3 hours
    // epochMs encodes: bits 29-27 = day of week (0=Sun), bits 26-0 = ms of day
    const dayOfWeek = (epochMs >>> 27) & 0x07;
    const msOfDay = epochMs & 0x07FFFFFF;
    // Find current UTC day-of-week, approximate
    const utcDay = new Date(refMs).getUTCDay();
    const diff = dayOfWeek - utcDay;
    const dayMs = 86400000;
    let t = refMs - (refMs % dayMs) + diff * dayMs + msOfDay - 3 * 3600000; // UTC+3 → UTC
    // Clamp to within ±3 days of ref
    while (t - refMs > 3 * dayMs) t -= 7 * dayMs;
    while (refMs - t > 3 * dayMs) t += 7 * dayMs;
    return new Date(t);
  }

  if (sys === 'C') {
    // BDS time starts at Jan 1 2006, 14s behind GPS time
    const BDS_EPOCH = Date.UTC(2006, 0, 1) - 14000;
    const weeksSinceEpoch = Math.floor((refMs - BDS_EPOCH) / MS_PER_WEEK);
    let t = BDS_EPOCH + weeksSinceEpoch * MS_PER_WEEK + epochMs;
    // Adjust if more than half a week off
    if (t - refMs > MS_PER_WEEK / 2) t -= MS_PER_WEEK;
    else if (refMs - t > MS_PER_WEEK / 2) t += MS_PER_WEEK;
    return new Date(t);
  }

  // GPS / Galileo / QZSS / SBAS / NavIC
  const weeksSinceEpoch = Math.floor((refMs - GPS_EPOCH) / MS_PER_WEEK);
  let t = GPS_EPOCH + weeksSinceEpoch * MS_PER_WEEK + epochMs;
  // Adjust for week rollover
  if (t - refMs > MS_PER_WEEK / 2) t -= MS_PER_WEEK;
  else if (refMs - t > MS_PER_WEEK / 2) t += MS_PER_WEEK;
  // GPS time is currently 18s ahead of UTC (leap seconds since 1980)
  t -= 18000;
  return new Date(t);
}

/**
 * Reset the GLONASS frequency number cache (e.g., when switching mountpoints).
 */
export function resetGloFreqCache(): void {
  gloFreqNum.fill(-128);
}
