/**
 * RTCM3 ephemeris decoders for GPS, GLONASS, Galileo, BeiDou, and QZSS.
 */

import { BitReader } from './rtcm3-decoder';
import type { Rtcm3Frame } from './rtcm3-decoder';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Decoded ephemeris information for display purposes. */
export interface EphemerisInfo {
  prn: string;
  constellation: string;
  health: number;
  lastReceived: number;
  messageType: number;
  // Keplerian elements (GPS/Galileo/BDS/QZSS)
  week?: number;
  ura?: number;
  toc?: number;          // seconds (clock epoch)
  toe?: number;          // seconds
  sqrtA?: number;        // m^(1/2)
  eccentricity?: number;
  inclination?: number;  // radians
  omega0?: number;       // radians (RAAN)
  omegaDot?: number;     // rad/s (rate of RAAN)
  argPerigee?: number;   // radians
  meanAnomaly?: number;  // radians
  deltaN?: number;       // rad/s
  idot?: number;         // rad/s (inclination rate)
  crs?: number;          // meters
  crc?: number;          // meters
  cuc?: number;          // radians
  cus?: number;          // radians
  cic?: number;          // radians
  cis?: number;          // radians
  af0?: number;          // seconds
  af1?: number;          // s/s
  af2?: number;          // s/s^2
  iode?: number;
  // GLONASS specific
  freqChannel?: number;
  x?: number; y?: number; z?: number;       // km
  vx?: number; vy?: number; vz?: number;    // km/s
  ax?: number; ay?: number; az?: number;    // km/s^2
  gammaN?: number;
  tb?: number;           // time interval index
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const PI = Math.PI;

/** Read a UTF-8 string of `nChars` bytes from a BitReader (must be byte-aligned). */
export function readString(r: BitReader, nChars: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < nChars; i++) bytes.push(r.readU(8));
  // Trim trailing nulls/spaces
  return String.fromCharCode(...bytes).replace(/\0+$/, '').trim();
}

/* ================================================================== */
/*  GPS / QZSS ephemeris (1019, 1044)                                  */
/* ================================================================== */

/**
 * Decode GPS ephemeris (message 1019) or QZSS ephemeris (1044, same structure).
 */
function decodeGpsLikeEphemeris(payload: Uint8Array, constellation: string, prefix: string, msgType: number): EphemerisInfo | null {
  if (payload.length < 60) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  const svId = r.readU(6);
  const week = r.readU(10);
  const ura = r.readU(4);
  r.skip(2);                           // code on L2
  const idot = r.readS(14) * 2 ** -43 * PI;
  const iode = r.readU(8);
  const toc = r.readU(16) * 16;
  const af2 = r.readS(8) * 2 ** -55;
  const af1 = r.readS(16) * 2 ** -43;
  const af0 = r.readS(22) * 2 ** -31;
  r.skip(10);                          // IODC
  const crs = r.readS(16) * 2 ** -5;
  const deltaN = r.readS(16) * 2 ** -43 * PI;
  const m0 = r.readS(32) * 2 ** -31 * PI;
  const cuc = r.readS(16) * 2 ** -29;
  const e = r.readU(32) * 2 ** -33;
  const cus = r.readS(16) * 2 ** -29;
  const sqrtA = r.readU(32) * 2 ** -19;
  const toe = r.readU(16) * 16;
  const cic = r.readS(16) * 2 ** -29;
  const omega0 = r.readS(32) * 2 ** -31 * PI;
  const cis = r.readS(16) * 2 ** -29;
  const i0 = r.readS(32) * 2 ** -31 * PI;
  const crc = r.readS(16) * 2 ** -5;
  const argPerigee = r.readS(32) * 2 ** -31 * PI;
  const omegaDot = r.readS(24) * 2 ** -43 * PI;
  r.skip(8);                           // tGD
  const health = r.readU(6);

  return {
    prn: `${prefix}${String(svId).padStart(2, '0')}`,
    constellation, health, lastReceived: Date.now(), messageType: msgType,
    week, ura, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2, iode,
  };
}

/* ================================================================== */
/*  GLONASS ephemeris (1020)                                           */
/* ================================================================== */

/** Decode GLONASS ephemeris (message 1020). */
function decodeGlonassEphemeris(payload: Uint8Array): EphemerisInfo | null {
  if (payload.length < 43) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  const slot = r.readU(6);
  const freqChannel = r.readU(5) - 7;  // DF040: 0-20 → -7 to +13
  r.skip(1 + 1 + 2);                  // almanac health, health avail, P1
  r.skip(12);                          // tk
  const healthBn = r.readU(1);
  r.skip(1);                           // P2
  const tb = r.readU(7);
  const vx = r.readS(24) * 2 ** -20;  // km/s
  const x = r.readS(27) * 2 ** -11;   // km
  const ax = r.readS(5) * 2 ** -30;   // km/s^2
  const vy = r.readS(24) * 2 ** -20;
  const y = r.readS(27) * 2 ** -11;
  const ay = r.readS(5) * 2 ** -30;
  const vz = r.readS(24) * 2 ** -20;
  const z = r.readS(27) * 2 ** -11;
  const azz = r.readS(5) * 2 ** -30;
  r.skip(1);                           // P3
  const gammaN = r.readS(11) * 2 ** -40;
  r.skip(3);                           // P
  const healthLn = r.readU(1);
  const tauN = r.readS(22) * 2 ** -30; // clock bias

  // Use only healthBn (operational health) — healthLn is almanac-derived
  // and is commonly set to 1 even for operational satellites.
  return {
    prn: `R${String(slot).padStart(2, '0')}`,
    constellation: 'GLONASS', health: healthBn,
    lastReceived: Date.now(), messageType: 1020,
    freqChannel, x, y, z, vx, vy, vz, ax, ay, az: azz,
    tb, gammaN, af0: tauN,
  };
}

/* ================================================================== */
/*  Galileo ephemeris (1045, 1046)                                     */
/* ================================================================== */

/** Decode Galileo ephemeris (messages 1045 F/NAV, 1046 I/NAV). */
function decodeGalileoEphemeris(payload: Uint8Array, msgType: number): EphemerisInfo | null {
  if (payload.length < 62) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  const svId = r.readU(6);
  const week = r.readU(12);
  const iode = r.readU(10);
  const sisa = r.readU(8);
  const idot = r.readS(14) * 2 ** -43 * PI;
  const toc = r.readU(14) * 60;
  const af2 = r.readS(6) * 2 ** -59;
  const af1 = r.readS(21) * 2 ** -46;
  const af0 = r.readS(31) * 2 ** -34;
  const crs = r.readS(16) * 2 ** -5;
  const deltaN = r.readS(16) * 2 ** -43 * PI;
  const m0 = r.readS(32) * 2 ** -31 * PI;
  const cuc = r.readS(16) * 2 ** -29;
  const e = r.readU(32) * 2 ** -33;
  const cus = r.readS(16) * 2 ** -29;
  const sqrtA = r.readU(32) * 2 ** -19;
  const toe = r.readU(14) * 60;
  const cic = r.readS(16) * 2 ** -29;
  const omega0 = r.readS(32) * 2 ** -31 * PI;
  const cis = r.readS(16) * 2 ** -29;
  const i0 = r.readS(32) * 2 ** -31 * PI;
  const crc = r.readS(16) * 2 ** -5;
  const argPerigee = r.readS(32) * 2 ** -31 * PI;
  const omegaDot = r.readS(24) * 2 ** -43 * PI;
  r.skip(10);                          // BGD E5a/E1

  // Health bits differ between F/NAV and I/NAV
  let health: number;
  if (msgType === 1045) {
    health = r.readU(2);               // E5a signal health
  } else {
    r.skip(10);                        // BGD E5b/E1
    health = r.readU(2);               // E5b signal health
  }

  return {
    prn: `E${String(svId).padStart(2, '0')}`,
    constellation: 'Galileo', health, lastReceived: Date.now(), messageType: msgType,
    week, ura: sisa, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2, iode,
  };
}

/* ================================================================== */
/*  BeiDou ephemeris (1042)                                            */
/* ================================================================== */

/** Decode BeiDou ephemeris (message 1042). */
function decodeBdsEphemeris(payload: Uint8Array): EphemerisInfo | null {
  if (payload.length < 63) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  const svId = r.readU(6);
  const week = r.readU(13);
  const ura = r.readU(4);
  const idot = r.readS(14) * 2 ** -43 * PI;
  const iode = r.readU(8);             // AODE
  const toc = r.readU(17) * 8;
  const af2 = r.readS(11) * 2 ** -66;
  const af1 = r.readS(22) * 2 ** -50;
  const af0 = r.readS(24) * 2 ** -33;
  r.skip(8);                           // AODC
  const crs = r.readS(18) * 2 ** -6;
  const deltaN = r.readS(16) * 2 ** -43 * PI;
  const m0 = r.readS(32) * 2 ** -31 * PI;
  const cuc = r.readS(18) * 2 ** -31;
  const e = r.readU(32) * 2 ** -33;
  const cus = r.readS(18) * 2 ** -31;
  const sqrtA = r.readU(32) * 2 ** -19;
  const toe = r.readU(17) * 8;
  const cic = r.readS(18) * 2 ** -31;
  const omega0 = r.readS(32) * 2 ** -31 * PI;
  const cis = r.readS(18) * 2 ** -31;
  const i0 = r.readS(32) * 2 ** -31 * PI;
  const crc = r.readS(18) * 2 ** -6;
  const argPerigee = r.readS(32) * 2 ** -31 * PI;
  const omegaDot = r.readS(24) * 2 ** -43 * PI;
  r.skip(10);                          // tGD1
  r.skip(10);                          // tGD2
  const health = r.readU(1);

  return {
    prn: `C${String(svId).padStart(2, '0')}`,
    constellation: 'BeiDou', health, lastReceived: Date.now(), messageType: 1042,
    week, ura, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2, iode,
  };
}

/* ================================================================== */
/*  Public entry point                                                 */
/* ================================================================== */

/* ================================================================== */
/*  SBAS ephemeris (1043)                                              */
/* ================================================================== */

/**
 * Decode SBAS ephemeris (message 1043).
 * SBAS uses geo-ranging parameters (XG, YG, ZG + velocities + accelerations),
 * NOT Keplerian elements. Structure is 29 bytes (232 bits).
 * SV ID 1-39 → PRN 120+svId.
 */
function decodeSbasEphemeris(payload: Uint8Array): EphemerisInfo | null {
  if (payload.length < 29) return null;
  const r = new BitReader(payload);
  r.skip(12);                           // message type
  const svId = r.readU(6);              // satellite ID (1-39)
  const iodn = r.readU(8);             // IODN
  const t0 = r.readU(16) * 16;         // reference time (seconds, scale 16)
  const ura = r.readU(4);              // URA index
  const xg = r.readS(30) * 0.08;       // m (scale 0.08)
  const yg = r.readS(30) * 0.08;       // m
  const zg = r.readS(25) * 0.4;        // m (scale 0.4)
  const dxg = r.readS(17) * 0.000625;  // m/s
  const dyg = r.readS(17) * 0.000625;  // m/s
  const dzg = r.readS(18) * 0.004;     // m/s (scale 0.004)
  const ddxg = r.readS(10) * 0.0000125;// m/s²
  const ddyg = r.readS(10) * 0.0000125;// m/s²
  const ddzg = r.readS(10) * 0.0000625;// m/s²
  const af0 = r.readS(12) * 2 ** -31;  // seconds
  const af1 = r.readS(8) * 2 ** -40;   // s/s

  const prn = 120 + svId;

  return {
    prn: `S${String(prn).padStart(3, '0')}`,
    constellation: 'SBAS', health: 0, // SBAS 1043 has no explicit health bit
    lastReceived: Date.now(), messageType: 1043,
    iode: iodn, toc: t0, ura,
    // Store SBAS geo position as GLONASS-like state vector (km, km/s, km/s²)
    x: xg / 1000, y: yg / 1000, z: zg / 1000,
    vx: dxg / 1000, vy: dyg / 1000, vz: dzg / 1000,
    ax: ddxg / 1000, ay: ddyg / 1000, az: ddzg / 1000,
    af0, af1,
  };
}

/** Decode any supported ephemeris message. Returns null for non-ephemeris or decode errors. */
export function decodeEphemeris(frame: Rtcm3Frame): EphemerisInfo | null {
  try {
    switch (frame.messageType) {
      case 1019: return decodeGpsLikeEphemeris(frame.payload, 'GPS', 'G', 1019);
      case 1020: return decodeGlonassEphemeris(frame.payload);
      case 1042: return decodeBdsEphemeris(frame.payload);
      case 1043: return decodeSbasEphemeris(frame.payload);
      case 1044: return decodeGpsLikeEphemeris(frame.payload, 'QZSS', 'J', 1044);
      case 1045: return decodeGalileoEphemeris(frame.payload, 1045);
      case 1046: return decodeGalileoEphemeris(frame.payload, 1046);
      default: return null;
    }
  } catch {
    return null;
  }
}
