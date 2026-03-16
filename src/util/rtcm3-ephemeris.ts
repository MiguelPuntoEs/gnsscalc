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
  iodc?: number;
  tgd?: number;          // seconds (GPS/QZSS group delay)
  l2Codes?: number;
  l2PFlag?: number;
  fitInterval?: number;
  // Galileo specific
  bgdE5aE1?: number;    // seconds
  bgdE5bE1?: number;    // seconds
  e5aDataInvalid?: number;
  e5bDataInvalid?: number;
  e1bHealth?: number;
  e1bDataInvalid?: number;
  // BeiDou specific
  aodc?: number;
  tgd1?: number;         // seconds
  tgd2?: number;         // seconds
  // GLONASS specific
  freqChannel?: number;
  x?: number; y?: number; z?: number;       // km
  vx?: number; vy?: number; vz?: number;    // km/s
  ax?: number; ay?: number; az?: number;    // km/s^2
  gammaN?: number;
  tb?: number;           // minutes
  tk?: number;           // seconds (UTC)
  deltaTauN?: number;    // seconds
  en?: number;           // age of data (days)
  p4?: number;
  ft?: number;           // URA index
  nt?: number;           // calendar day within 4-yr cycle
  satType?: number;      // M field (GLONASS satellite type)
  tauC?: number;         // seconds (GLONASS time to UTC)
  n4?: number;           // 4-year interval number
  tauGPS?: number;       // seconds (GLONASS-GPS time diff)
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
/*  GPS ephemeris (1019)                                               */
/* ================================================================== */

/** Decode GPS ephemeris (message 1019). */
function decodeGpsEphemeris(payload: Uint8Array): EphemerisInfo | null {
  if (payload.length < 60) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type
  const svId = r.readU(6);
  const week = r.readU(10);
  const ura = r.readU(4);
  const l2Codes = r.readU(2);
  const idot = r.readS(14) * 2 ** -43 * PI;
  const iode = r.readU(8);
  const toc = r.readU(16) * 16;
  const af2 = r.readS(8) * 2 ** -55;
  const af1 = r.readS(16) * 2 ** -43;
  const af0 = r.readS(22) * 2 ** -31;
  const iodc = r.readU(10);
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
  const tgd = r.readS(8) * 2 ** -31;
  const health = r.readU(6);
  const l2PFlag = r.readU(1);
  const fitInterval = r.readU(1);

  return {
    prn: `G${String(svId).padStart(2, '0')}`,
    constellation: 'GPS', health, lastReceived: Date.now(), messageType: 1019,
    week, ura, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2,
    iode, iodc, tgd, l2Codes, l2PFlag, fitInterval,
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
  // tk: hours(5) + minutes(6) + 30s-flag(1), Moscow time → UTC
  const tkHours = r.readU(5);
  const tkMins = r.readU(6);
  const tk30s = r.readU(1);
  const tkMoscow = tkHours * 3600 + tkMins * 60 + tk30s * 30;
  const tk = ((tkMoscow - 3 * 3600) % 86400 + 86400) % 86400; // Moscow→UTC, wrap at day boundary
  const healthBn = r.readU(1);
  r.skip(1);                           // P2
  const tb = r.readU(7) * 15;           // time interval index → minutes
  const vx = r.readSM(24) * 2 ** -20;  // km/s (sign-magnitude)
  const x = r.readSM(27) * 2 ** -11;   // km
  const ax = r.readSM(5) * 2 ** -30;   // km/s^2
  const vy = r.readSM(24) * 2 ** -20;
  const y = r.readSM(27) * 2 ** -11;
  const ay = r.readSM(5) * 2 ** -30;
  const vz = r.readSM(24) * 2 ** -20;
  const z = r.readSM(27) * 2 ** -11;
  const azz = r.readSM(5) * 2 ** -30;
  r.skip(1);                           // P3
  const gammaN = r.readSM(11) * 2 ** -40;
  r.skip(2);                           // P (GLONASS-M indicator)
  r.skip(1);                           // ln (third string)
  const tauN = r.readSM(22) * 2 ** -30; // clock bias (sign-magnitude)
  const deltaTauN = r.readSM(5) * 2 ** -30;
  const en = r.readU(5);               // age of data (days)
  const p4 = r.readU(1);
  const ft = r.readU(4);               // URA index
  const nt = r.readU(11);              // calendar day within 4-yr cycle
  const satType = r.readU(2);          // M field (satellite type)
  const additionalData = r.readU(1);
  const tauC = additionalData ? r.readSM(32) * 2 ** -31 : undefined;  // GLONASS→UTC correction
  const n4 = additionalData ? r.readU(5) : undefined;                  // 4-year interval number
  const tauGPS = additionalData ? r.readSM(22) * 2 ** -30 : undefined; // GLONASS−GPS time diff
  // ln5 (fifth string health) — 1 bit, skip

  return {
    prn: `R${String(slot).padStart(2, '0')}`,
    constellation: 'GLONASS', health: healthBn,
    lastReceived: Date.now(), messageType: 1020,
    freqChannel, tk, x, y, z, vx, vy, vz, ax, ay, az: azz,
    tb, gammaN, af0: tauN, deltaTauN, en, p4, ft, nt, satType,
    tauC, n4, tauGPS,
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
  const bgdE5aE1 = r.readS(10) * 2 ** -32;

  let health: number;
  let bgdE5bE1: number | undefined;
  let e5aDataInvalid: number | undefined;
  let e5bDataInvalid: number | undefined;
  let e1bHealth: number | undefined;
  let e1bDataInvalid: number | undefined;

  if (msgType === 1045) {
    health = r.readU(2);               // E5a signal health
    e5aDataInvalid = r.readU(1);
  } else {
    bgdE5bE1 = r.readS(10) * 2 ** -32;
    health = r.readU(2);               // E5b signal health
    e5bDataInvalid = r.readU(1);
    e1bHealth = r.readU(2);
    e1bDataInvalid = r.readU(1);
  }

  return {
    prn: `E${String(svId).padStart(2, '0')}`,
    constellation: 'Galileo', health, lastReceived: Date.now(), messageType: msgType,
    week, ura: sisa, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2, iode,
    bgdE5aE1, bgdE5bE1, e5aDataInvalid, e5bDataInvalid, e1bHealth, e1bDataInvalid,
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
  const iode = r.readU(5);             // AODE (5 bits per RTCM DF489)
  const toc = r.readU(17) * 8;
  const af2 = r.readS(11) * 2 ** -66;
  const af1 = r.readS(22) * 2 ** -50;
  const af0 = r.readS(24) * 2 ** -33;
  const aodc = r.readU(5);            // AODC (5 bits per RTCM DF490)
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
  const tgd1 = r.readS(10) * 1e-10;
  const tgd2 = r.readS(10) * 1e-10;
  const health = r.readU(1);

  return {
    prn: `C${String(svId).padStart(2, '0')}`,
    constellation: 'BeiDou', health, lastReceived: Date.now(), messageType: 1042,
    week, ura, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2,
    iode, aodc, tgd1, tgd2,
  };
}

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
  const t0 = r.readU(13) * 16;         // reference time (13 bits per DF198, scale 16)
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

/* ================================================================== */
/*  QZSS ephemeris (1044) — different field order from GPS 1019!       */
/*  Reference: BNC 2.13.4 RTCM3Decoder::DecodeQZSSEphemeris            */
/* ================================================================== */

function decodeQzssEphemeris(payload: Uint8Array): EphemerisInfo | null {
  if (payload.length < 60) return null;
  const r = new BitReader(payload);
  r.skip(12);                          // message type (1044)
  const svId = r.readU(4);             // 4-bit satellite ID (1-10)
  if (svId < 1 || svId > 10) return null;
  const toc = r.readU(16) * 16;
  const af2 = r.readS(8) * 2 ** -55;
  const af1 = r.readS(16) * 2 ** -43;
  const af0 = r.readS(22) * 2 ** -31;
  const iode = r.readU(8);
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
  const idot = r.readS(14) * 2 ** -43 * PI;
  const l2Codes = r.readU(2);
  const week = r.readU(10);
  const ura = r.readU(4);
  const health = r.readU(6);
  const tgd = r.readS(8) * 2 ** -31;
  const iodc = r.readU(10);
  const fitInterval = r.readU(1);

  return {
    prn: `J${String(svId).padStart(2, '0')}`,
    constellation: 'QZSS', health, lastReceived: Date.now(), messageType: 1044,
    week, ura, toc, toe, sqrtA, eccentricity: e,
    inclination: i0, omega0, omegaDot, argPerigee, meanAnomaly: m0,
    deltaN, idot, crs, crc, cuc, cus, cic, cis, af0, af1, af2,
    iode, iodc, tgd, l2Codes, fitInterval,
  };
}

/** Decode any supported ephemeris message. Returns null for non-ephemeris or decode errors. */
export function decodeEphemeris(frame: Rtcm3Frame): EphemerisInfo | null {
  try {
    switch (frame.messageType) {
      case 1019: return decodeGpsEphemeris(frame.payload);
      case 1020: return decodeGlonassEphemeris(frame.payload);
      case 1042: return decodeBdsEphemeris(frame.payload);
      case 1043: return decodeSbasEphemeris(frame.payload);
      case 1044: return decodeQzssEphemeris(frame.payload);
      case 1045: return decodeGalileoEphemeris(frame.payload, 1045);
      case 1046: return decodeGalileoEphemeris(frame.payload, 1046);
      default: return null;
    }
  } catch {
    return null;
  }
}
