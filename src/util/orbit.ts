/**
 * Satellite orbit computation from broadcast ephemerides.
 * Supports GPS, Galileo, BeiDou (Keplerian) and GLONASS (Runge-Kutta).
 */

import type { KeplerEphemeris, GlonassEphemeris, Ephemeris } from './nav';
import type { EphemerisInfo } from './ntrip';

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const GM_GPS = 3.986005e14;       // m³/s² — WGS84 gravitational parameter
const GM_GAL = 3.986004418e14;    // m³/s² — Galileo
const GM_BDS = 3.986004418e14;    // m³/s² — BeiDou (CGCS2000)
const GM_GLO = 3.9860044e14;      // m³/s² — PZ-90
const OMEGA_E = 7.2921151467e-5;  // rad/s — Earth rotation rate
const AE_GLO = 6378136.0;         // m — Earth equatorial radius (PZ-90)
const J2_GLO = 1.08263e-3;        // J2 zonal harmonic (PZ-90)

const TWO_PI = 2 * Math.PI;

/* ================================================================== */
/*  ECEF position type                                                 */
/* ================================================================== */

export interface SatPosition {
  prn: string;
  x: number;  // m (ECEF)
  y: number;
  z: number;
}

export interface SatAzEl {
  prn: string;
  az: number;   // radians
  el: number;   // radians
  lat: number;  // sub-satellite point latitude (radians)
  lon: number;  // sub-satellite point longitude (radians)
  cn0?: number; // dB-Hz if available
}

export interface DopValues {
  gdop: number;
  pdop: number;
  hdop: number;
  vdop: number;
}

/* ================================================================== */
/*  Keplerian orbit computation (GPS / Galileo / BeiDou)               */
/* ================================================================== */

function gmForSystem(sys: string): number {
  if (sys === 'E') return GM_GAL;
  if (sys === 'C') return GM_BDS;
  return GM_GPS;
}

/**
 * Compute satellite ECEF position from Keplerian ephemeris.
 * @param eph Broadcast ephemeris
 * @param t GPS time of week in seconds
 */
export function keplerPosition(eph: KeplerEphemeris, t: number): SatPosition {
  const GM = gmForSystem(eph.system);
  const a = eph.sqrtA * eph.sqrtA;
  const n0 = Math.sqrt(GM / (a * a * a));
  const n = n0 + eph.deltaN;

  // Time from ephemeris reference epoch
  let tk = t - eph.toe;
  if (tk > 302400) tk -= 604800;
  if (tk < -302400) tk += 604800;

  // Mean anomaly
  let Mk = eph.m0 + n * tk;

  // Eccentric anomaly (Kepler equation, iterative)
  let Ek = Mk;
  for (let i = 0; i < 10; i++) {
    const dE = (Mk - (Ek - eph.e * Math.sin(Ek))) / (1 - eph.e * Math.cos(Ek));
    Ek += dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  // True anomaly
  const sinE = Math.sin(Ek);
  const cosE = Math.cos(Ek);
  const vk = Math.atan2(
    Math.sqrt(1 - eph.e * eph.e) * sinE,
    cosE - eph.e,
  );

  // Argument of latitude
  const phik = vk + eph.omega;
  const sin2phi = Math.sin(2 * phik);
  const cos2phi = Math.cos(2 * phik);

  // Corrections
  const duk = eph.cus * sin2phi + eph.cuc * cos2phi;
  const drk = eph.crs * sin2phi + eph.crc * cos2phi;
  const dik = eph.cis * sin2phi + eph.cic * cos2phi;

  const uk = phik + duk;
  const rk = a * (1 - eph.e * cosE) + drk;
  const ik = eph.i0 + dik + eph.idot * tk;

  // Orbital plane position
  const xp = rk * Math.cos(uk);
  const yp = rk * Math.sin(uk);

  // BeiDou GEO satellites use a different ECEF transformation (BDS-SIS-ICD).
  // GEO sats have near-zero inclination (< 0.2 rad) vs ~0.96 rad for MEO/IGSO.
  const isBdsGeo = eph.system === 'C' && Math.abs(eph.i0) < 0.1 && a > 4.0e7;

  if (isBdsGeo) {
    // GEO node: no Earth rotation subtracted from omegaDot
    const omegak = eph.omega0 + eph.omegaDot * tk - OMEGA_E * eph.toe;
    const cosO = Math.cos(omegak);
    const sinO = Math.sin(omegak);
    const cosI = Math.cos(ik);
    const sinI = Math.sin(ik);

    // Position in quasi-inertial frame
    const xg = xp * cosO - yp * cosI * sinO;
    const yg = xp * sinO + yp * cosI * cosO;
    const zg = yp * sinI;

    // Apply Rz(OMEGA_E * tk) * Rx(-5°)
    const phi = OMEGA_E * tk;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const COS5 = Math.cos(-5 * Math.PI / 180);
    const SIN5 = Math.sin(-5 * Math.PI / 180);

    return {
      prn: eph.prn,
      x:  xg * cosPhi + yg * sinPhi * COS5 + zg * sinPhi * SIN5,
      y: -xg * sinPhi + yg * cosPhi * COS5 + zg * cosPhi * SIN5,
      z:                -yg * SIN5          + zg * COS5,
    };
  }

  // Standard MEO/IGSO: Earth rotation folded into the node
  const omegak = eph.omega0 + (eph.omegaDot - OMEGA_E) * tk - OMEGA_E * eph.toe;

  const cosO = Math.cos(omegak);
  const sinO = Math.sin(omegak);
  const cosI = Math.cos(ik);
  const sinI = Math.sin(ik);

  return {
    prn: eph.prn,
    x: xp * cosO - yp * cosI * sinO,
    y: xp * sinO + yp * cosI * cosO,
    z: yp * sinI,
  };
}

/* ================================================================== */
/*  GLONASS orbit computation (Runge-Kutta 4th order)                  */
/* ================================================================== */

type GloState = [number, number, number, number, number, number]; // x,y,z,vx,vy,vz

function gloDerivatives(
  state: GloState,
  acc: [number, number, number],
): GloState {
  const [x, y, z, vx, vy, vz] = state;
  const [ax, ay, az] = acc;

  const r = Math.sqrt(x * x + y * y + z * z);
  const r2 = r * r;
  const r3 = r2 * r;
  const r5 = r2 * r3;

  const mu_r3 = GM_GLO / r3;
  const j2_term = 1.5 * J2_GLO * AE_GLO * AE_GLO / r5;

  const dvx = -mu_r3 * x + j2_term * x * (5 * z * z / r2 - 1) + OMEGA_E * OMEGA_E * x + 2 * OMEGA_E * vy + ax;
  const dvy = -mu_r3 * y + j2_term * y * (5 * z * z / r2 - 1) + OMEGA_E * OMEGA_E * y - 2 * OMEGA_E * vx + ay;
  const dvz = -mu_r3 * z + j2_term * z * (5 * z * z / r2 - 3) + az;

  return [vx, vy, vz, dvx, dvy, dvz];
}

function rk4Step(
  state: GloState,
  acc: [number, number, number],
  dt: number,
): GloState {
  const k1 = gloDerivatives(state, acc);

  const s2 = state.map((v, i) => v + k1[i]! * dt / 2) as GloState;
  const k2 = gloDerivatives(s2, acc);

  const s3 = state.map((v, i) => v + k2[i]! * dt / 2) as GloState;
  const k3 = gloDerivatives(s3, acc);

  const s4 = state.map((v, i) => v + k3[i]! * dt) as GloState;
  const k4 = gloDerivatives(s4, acc);

  return state.map((v, i) =>
    v + (dt / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!),
  ) as GloState;
}

/**
 * Compute GLONASS satellite ECEF position.
 * @param eph GLONASS ephemeris
 * @param tUtc Target time in UTC seconds (Unix timestamp / 1000)
 */
export function glonassPosition(eph: GlonassEphemeris, tUtc: number): SatPosition {
  const ephTime = eph.tocDate.getTime() / 1000;
  let dt = tUtc - ephTime;

  // GLONASS positions are in km, convert to m for integration
  let state: GloState = [
    eph.x * 1000, eph.y * 1000, eph.z * 1000,
    eph.xDot * 1000, eph.yDot * 1000, eph.zDot * 1000,
  ];
  const acc: [number, number, number] = [
    eph.xAcc * 1000, eph.yAcc * 1000, eph.zAcc * 1000,
  ];

  // Integrate in 60-second steps
  const step = dt > 0 ? 60 : -60;
  const nSteps = Math.floor(Math.abs(dt) / 60);
  const remainder = dt - nSteps * step;

  for (let i = 0; i < nSteps; i++) {
    state = rk4Step(state, acc, step);
  }
  if (Math.abs(remainder) > 0.001) {
    state = rk4Step(state, acc, remainder);
  }

  return { prn: eph.prn, x: state[0], y: state[1], z: state[2] };
}

/* ================================================================== */
/*  Coordinate transforms                                              */
/* ================================================================== */

/** Convert ECEF (x,y,z) in meters to geodetic (lat, lon) in radians. */
export function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; alt: number } {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 2 * f - f * f;
  const ep2 = (a * a - b * b) / (b * b);

  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);

  // Iterative latitude
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 5; i++) {
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(z + e2 * N * sinLat, p);
  }
  const sinLat = Math.sin(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = p / Math.cos(lat) - N;

  return { lat, lon, alt };
}

/** Convert geodetic (lat, lon in radians, alt in meters) to ECEF. */
export function geodeticToEcef(lat: number, lon: number, alt: number): [number, number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [
    (N + alt) * cosLat * Math.cos(lon),
    (N + alt) * cosLat * Math.sin(lon),
    (N * (1 - e2) + alt) * sinLat,
  ];
}

/** Compute azimuth and elevation from receiver ECEF to satellite ECEF. */
export function ecefToAzEl(
  rxX: number, rxY: number, rxZ: number,
  satX: number, satY: number, satZ: number,
): { az: number; el: number } {
  const { lat, lon } = ecefToGeodetic(rxX, rxY, rxZ);

  // ENU rotation
  const dx = satX - rxX;
  const dy = satY - rxY;
  const dz = satZ - rxZ;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  const az = Math.atan2(east, north);
  const el = Math.atan2(up, Math.sqrt(east * east + north * north));

  return { az: (az + TWO_PI) % TWO_PI, el };
}

/* ================================================================== */
/*  DOP computation                                                    */
/* ================================================================== */

/** Compute DOP values from a set of satellite az/el. */
export function computeDop(satAzEls: { az: number; el: number }[]): DopValues | null {
  const n = satAzEls.length;
  if (n < 4) return null;

  // Build geometry matrix H (n×4)
  // H[i] = [cos(el)*sin(az), cos(el)*cos(az), sin(el), 1]
  const H: number[][] = [];
  for (const { az, el } of satAzEls) {
    const cosEl = Math.cos(el);
    H.push([cosEl * Math.sin(az), cosEl * Math.cos(az), Math.sin(el), 1]);
  }

  // Q = (H^T H)^-1 — compute 4x4 matrix
  const HtH: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += H[k]![i]! * H[k]![j]!;
      }
      HtH[i]![j] = sum;
    }
  }

  // Invert 4x4 using cofactor expansion
  const Q = invert4x4(HtH);
  if (!Q) return null;

  const gdop = Math.sqrt(Q[0]![0]! + Q[1]![1]! + Q[2]![2]! + Q[3]![3]!);
  const pdop = Math.sqrt(Q[0]![0]! + Q[1]![1]! + Q[2]![2]!);
  const hdop = Math.sqrt(Q[0]![0]! + Q[1]![1]!);
  const vdop = Math.sqrt(Q[2]![2]!);

  return { gdop, pdop, hdop, vdop };
}

function invert4x4(m: number[][]): number[][] | null {
  // Flatten
  const a = m.flat();
  const inv = new Array(16).fill(0);

  inv[0] = a[5]!*a[10]!*a[15]! - a[5]!*a[11]!*a[14]! - a[9]!*a[6]!*a[15]! + a[9]!*a[7]!*a[14]! + a[13]!*a[6]!*a[11]! - a[13]!*a[7]!*a[10]!;
  inv[4] = -a[4]!*a[10]!*a[15]! + a[4]!*a[11]!*a[14]! + a[8]!*a[6]!*a[15]! - a[8]!*a[7]!*a[14]! - a[12]!*a[6]!*a[11]! + a[12]!*a[7]!*a[10]!;
  inv[8] = a[4]!*a[9]!*a[15]! - a[4]!*a[11]!*a[13]! - a[8]!*a[5]!*a[15]! + a[8]!*a[7]!*a[13]! + a[12]!*a[5]!*a[11]! - a[12]!*a[7]!*a[9]!;
  inv[12] = -a[4]!*a[9]!*a[14]! + a[4]!*a[10]!*a[13]! + a[8]!*a[5]!*a[14]! - a[8]!*a[6]!*a[13]! - a[12]!*a[5]!*a[10]! + a[12]!*a[6]!*a[9]!;
  inv[1] = -a[1]!*a[10]!*a[15]! + a[1]!*a[11]!*a[14]! + a[9]!*a[2]!*a[15]! - a[9]!*a[3]!*a[14]! - a[13]!*a[2]!*a[11]! + a[13]!*a[3]!*a[10]!;
  inv[5] = a[0]!*a[10]!*a[15]! - a[0]!*a[11]!*a[14]! - a[8]!*a[2]!*a[15]! + a[8]!*a[3]!*a[14]! + a[12]!*a[2]!*a[11]! - a[12]!*a[3]!*a[10]!;
  inv[9] = -a[0]!*a[9]!*a[15]! + a[0]!*a[11]!*a[13]! + a[8]!*a[1]!*a[15]! - a[8]!*a[3]!*a[13]! - a[12]!*a[1]!*a[11]! + a[12]!*a[3]!*a[9]!;
  inv[13] = a[0]!*a[9]!*a[14]! - a[0]!*a[10]!*a[13]! - a[8]!*a[1]!*a[14]! + a[8]!*a[2]!*a[13]! + a[12]!*a[1]!*a[10]! - a[12]!*a[2]!*a[9]!;
  inv[2] = a[1]!*a[6]!*a[15]! - a[1]!*a[7]!*a[14]! - a[5]!*a[2]!*a[15]! + a[5]!*a[3]!*a[14]! + a[13]!*a[2]!*a[7]! - a[13]!*a[3]!*a[6]!;
  inv[6] = -a[0]!*a[6]!*a[15]! + a[0]!*a[7]!*a[14]! + a[4]!*a[2]!*a[15]! - a[4]!*a[3]!*a[14]! - a[12]!*a[2]!*a[7]! + a[12]!*a[3]!*a[6]!;
  inv[10] = a[0]!*a[5]!*a[15]! - a[0]!*a[7]!*a[13]! - a[4]!*a[1]!*a[15]! + a[4]!*a[3]!*a[13]! + a[12]!*a[1]!*a[7]! - a[12]!*a[3]!*a[5]!;
  inv[14] = -a[0]!*a[5]!*a[14]! + a[0]!*a[6]!*a[13]! + a[4]!*a[1]!*a[14]! - a[4]!*a[2]!*a[13]! - a[12]!*a[1]!*a[6]! + a[12]!*a[2]!*a[5]!;
  inv[3] = -a[1]!*a[6]!*a[11]! + a[1]!*a[7]!*a[10]! + a[5]!*a[2]!*a[11]! - a[5]!*a[3]!*a[10]! - a[9]!*a[2]!*a[7]! + a[9]!*a[3]!*a[6]!;
  inv[7] = a[0]!*a[6]!*a[11]! - a[0]!*a[7]!*a[10]! - a[4]!*a[2]!*a[11]! + a[4]!*a[3]!*a[10]! + a[8]!*a[2]!*a[7]! - a[8]!*a[3]!*a[6]!;
  inv[11] = -a[0]!*a[5]!*a[11]! + a[0]!*a[7]!*a[9]! + a[4]!*a[1]!*a[11]! - a[4]!*a[3]!*a[9]! - a[8]!*a[1]!*a[7]! + a[8]!*a[3]!*a[5]!;
  inv[15] = a[0]!*a[5]!*a[10]! - a[0]!*a[6]!*a[9]! - a[4]!*a[1]!*a[10]! + a[4]!*a[2]!*a[9]! + a[8]!*a[1]!*a[6]! - a[8]!*a[2]!*a[5]!;

  let det = a[0]! * inv[0] + a[1]! * inv[4] + a[2]! * inv[8] + a[3]! * inv[12];
  if (Math.abs(det) < 1e-20) return null;

  det = 1.0 / det;
  const result: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i]![j] = inv[i * 4 + j]! * det;
    }
  }
  return result;
}

/* ================================================================== */
/*  Ephemeris selection                                                 */
/* ================================================================== */

/**
 * Find the best ephemeris for a given PRN at a given time.
 * Selects the one with the closest epoch (toe/toc) to the target time.
 */
export function selectEphemeris(
  ephemerides: Ephemeris[],
  prn: string,
  timeMs: number,
): Ephemeris | null {
  let best: Ephemeris | null = null;
  let bestDt = Infinity;

  for (const eph of ephemerides) {
    if (eph.prn !== prn) continue;
    const ephTime = eph.tocDate.getTime();
    const dt = Math.abs(timeMs - ephTime);
    // Reject ephemerides older than 4 hours (14400 s)
    if (dt > 4 * 3600 * 1000) continue;
    if (dt < bestDt) {
      bestDt = dt;
      best = eph;
    }
  }
  return best;
}

/**
 * Compute satellite position from ephemeris.
 * @param eph Ephemeris record
 * @param timeMs Target time in Unix milliseconds
 */
export function computeSatPosition(eph: Ephemeris, timeMs: number): SatPosition {
  if (eph.system === 'R' || eph.system === 'S') {
    return glonassPosition(eph, timeMs / 1000);
  }
  // Compute GPS time of week from Unix time
  // GPS epoch: Jan 6, 1980 00:00:00 UTC
  const GPS_EPOCH = Date.UTC(1980, 0, 6);
  const gpsSeconds = (timeMs - GPS_EPOCH) / 1000;
  const tow = gpsSeconds % (7 * 86400);
  return keplerPosition(eph as KeplerEphemeris, tow);
}

/* ================================================================== */
/*  Batch computation for sky plot / DOP                               */
/* ================================================================== */

export interface EpochSkyData {
  time: number;       // Unix ms
  satellites: SatAzEl[];
  dop: DopValues | null;
}

/* ================================================================== */
/*  Time helpers                                                        */
/* ================================================================== */

/** Derive evenly-spaced epoch times from an ephemeris set's toc range. */
export function navTimesFromEph(ephs: Ephemeris[]): number[] {
  let minT = Infinity, maxT = -Infinity;
  for (const eph of ephs) {
    const t = eph.tocDate.getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const span = maxT - minT;
  const step = Math.max(span / 500, 30_000);
  const times: number[] = [];
  for (let t = minT; t <= maxT; t += step) times.push(t);
  if (times.length === 0 && isFinite(minT)) times.push(minT);
  return times;
}

/* ================================================================== */
/*  Unified satellite position computation                             */
/* ================================================================== */

export interface SatPoint {
  lat: number;  // geodetic radians
  lon: number;  // geodetic radians
  az: number;   // radians from receiver (0 if no rxPos)
  el: number;   // radians from receiver (0 if no rxPos)
}

export interface AllPositionsData {
  /** All unique PRNs sorted. */
  prns: string[];
  /** Epoch timestamps in Unix ms. */
  times: number[];
  /** positions[prn][epochIdx] — null if no valid ephemeris. */
  positions: Record<string, (SatPoint | null)[]>;
}

/**
 * Compute satellite positions for ALL PRNs at all times in a single pass.
 * Returns geodetic (lat/lon) for ground tracks and az/el for sky plot.
 * When rxPos is provided, az/el are computed; otherwise they are 0.
 */
export function computeAllPositions(
  ephemerides: Ephemeris[],
  times: number[],
  rxPos?: [number, number, number],
): AllPositionsData {
  // Pre-group ephemerides by PRN for fast lookup
  const ephByPrn = new Map<string, Ephemeris[]>();
  for (const eph of ephemerides) {
    let arr = ephByPrn.get(eph.prn);
    if (!arr) { arr = []; ephByPrn.set(eph.prn, arr); }
    arr.push(eph);
  }

  const prns = [...ephByPrn.keys()].sort();
  const positions: Record<string, (SatPoint | null)[]> = {};
  for (const prn of prns) positions[prn] = [];

  // Precompute receiver trig (avoids ecefToGeodetic per satellite in ecefToAzEl)
  let rxLat = 0, rxLon = 0, sinLat = 0, cosLat = 1, sinLon = 0, cosLon = 1;
  let hasRx = false;
  if (rxPos) {
    const [rxX, rxY, rxZ] = rxPos;
    if (rxX !== 0 || rxY !== 0 || rxZ !== 0) {
      hasRx = true;
      const g = ecefToGeodetic(rxX, rxY, rxZ);
      rxLat = g.lat; rxLon = g.lon;
      sinLat = Math.sin(rxLat); cosLat = Math.cos(rxLat);
      sinLon = Math.sin(rxLon); cosLon = Math.cos(rxLon);
    }
  }

  for (const t of times) {
    for (const prn of prns) {
      const eph = selectBest(ephByPrn.get(prn)!, t);
      if (!eph) { positions[prn]!.push(null); continue; }

      const pos = computeSatPosition(eph, t);
      const geo = ecefToGeodetic(pos.x, pos.y, pos.z);

      let az = 0, el = 0;
      if (hasRx) {
        const dx = pos.x - rxPos![0];
        const dy = pos.y - rxPos![1];
        const dz = pos.z - rxPos![2];
        const east = -sinLon * dx + cosLon * dy;
        const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
        const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;
        az = (Math.atan2(east, north) + TWO_PI) % TWO_PI;
        el = Math.atan2(up, Math.sqrt(east * east + north * north));
      }

      positions[prn]!.push({ lat: geo.lat, lon: geo.lon, az, el });
    }
  }

  return { prns, times, positions };
}

/** Fast ephemeris selection from a pre-filtered array for one PRN. */
function selectBest(ephs: Ephemeris[], timeMs: number): Ephemeris | null {
  let best: Ephemeris | null = null;
  let bestDt = Infinity;
  for (const eph of ephs) {
    const dt = Math.abs(timeMs - eph.tocDate.getTime());
    // GLONASS ephemerides are valid for ~30 min; Keplerian for ~2–4 hours
    const maxAge = (eph.system === 'R' || eph.system === 'S') ? 1800_000 : 4 * 3600_000;
    if (dt > maxAge) continue;
    if (dt < bestDt) { bestDt = dt; best = eph; }
  }
  return best;
}

/* ================================================================== */
/*  Live RTCM3 ephemeris → orbit computation                           */
/* ================================================================== */

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const BDS_EPOCH_MS = Date.UTC(2006, 0, 1);
const GAL_EPOCH_MS = GPS_EPOCH_MS; // Galileo uses GST which shares GPS epoch

/** Convert an RTCM3 EphemerisInfo to the Ephemeris type used by orbit computation. */
function ephInfoToEphemeris(info: EphemerisInfo): Ephemeris | null {
  const sys = info.prn.charAt(0);

  if (sys === 'R') {
    // GLONASS — needs state vector
    if (info.x === undefined || info.y === undefined || info.z === undefined) return null;
    if (info.vx === undefined || info.vy === undefined || info.vz === undefined) return null;
    // Approximate tocDate from tb (15-minute intervals from 00:00 Moscow time = UTC+3)
    const now = new Date(info.lastReceived);
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const tbSec = (info.tb ?? 0) * 900; // tb in 15-min intervals
    const moscowOffset = 3 * 3600; // Moscow = UTC+3
    const tocMs = utcMidnight + (tbSec - moscowOffset) * 1000;
    return {
      system: 'R',
      prn: info.prn,
      tocDate: new Date(tocMs),
      tauN: -(info.af0 ?? 0),  // RTCM stores -tauN
      gammaN: info.gammaN ?? 0,
      messageFrameTime: 0,
      x: info.x, xDot: info.vx, xAcc: info.ax ?? 0,
      y: info.y, yDot: info.vy, yAcc: info.ay ?? 0,
      z: info.z, zDot: info.vz, zAcc: info.az ?? 0,
      health: info.health,
      freqNum: info.freqChannel ?? 0,
    } satisfies GlonassEphemeris;
  }

  // Keplerian systems (GPS/Galileo/BeiDou/QZSS)
  if (info.sqrtA === undefined || info.eccentricity === undefined ||
      info.inclination === undefined || info.omega0 === undefined ||
      info.argPerigee === undefined || info.meanAnomaly === undefined ||
      info.toe === undefined || info.week === undefined) return null;

  // Compute tocDate from week + toc
  let epochMs: number;
  let tocSec = info.toc ?? info.toe;
  if (sys === 'C') {
    epochMs = BDS_EPOCH_MS;
  } else if (sys === 'E') {
    epochMs = GAL_EPOCH_MS;
  } else {
    epochMs = GPS_EPOCH_MS;
  }
  const tocDate = new Date(epochMs + info.week * 7 * 86400_000 + tocSec * 1000);

  return {
    system: sys as 'G' | 'E' | 'C' | 'J' | 'I',
    prn: info.prn,
    toc: tocSec,
    tocDate,
    af0: info.af0 ?? 0,
    af1: info.af1 ?? 0,
    af2: info.af2 ?? 0,
    iode: info.iode ?? 0,
    crs: info.crs ?? 0,
    deltaN: info.deltaN ?? 0,
    m0: info.meanAnomaly,
    cuc: info.cuc ?? 0,
    e: info.eccentricity,
    cus: info.cus ?? 0,
    sqrtA: info.sqrtA,
    toe: info.toe,
    cic: info.cic ?? 0,
    omega0: info.omega0,
    cis: info.cis ?? 0,
    i0: info.inclination,
    crc: info.crc ?? 0,
    omega: info.argPerigee,
    omegaDot: info.omegaDot ?? 0,
    idot: info.idot ?? 0,
    week: info.week,
    svHealth: info.health,
    tgd: 0,
  } satisfies KeplerEphemeris;
}

/**
 * Compute current satellite az/el from live RTCM3 ephemeris data.
 * Returns array of SatAzEl for all satellites with valid ephemeris.
 */
export function computeLiveSkyPositions(
  ephemerides: Map<string, EphemerisInfo>,
  rxPos: [number, number, number],
  cn0Map?: Map<string, number>,
): SatAzEl[] {
  const now = Date.now();
  const result: SatAzEl[] = [];
  const [rxX, rxY, rxZ] = rxPos;

  // Precompute receiver geodetic for ENU transform
  const { lat: rxLat, lon: rxLon } = ecefToGeodetic(rxX, rxY, rxZ);
  const sinRxLat = Math.sin(rxLat), cosRxLat = Math.cos(rxLat);
  const sinRxLon = Math.sin(rxLon), cosRxLon = Math.cos(rxLon);

  for (const info of ephemerides.values()) {
    const eph = ephInfoToEphemeris(info);
    if (!eph) continue;

    try {
      const pos = computeSatPosition(eph, now);
      const geo = ecefToGeodetic(pos.x, pos.y, pos.z);

      // Inline az/el (avoid extra ecefToGeodetic call for rx)
      const dx = pos.x - rxX, dy = pos.y - rxY, dz = pos.z - rxZ;
      const east = -sinRxLon * dx + cosRxLon * dy;
      const north = -sinRxLat * cosRxLon * dx - sinRxLat * sinRxLon * dy + cosRxLat * dz;
      const up = cosRxLat * cosRxLon * dx + cosRxLat * sinRxLon * dy + sinRxLat * dz;
      const az = (Math.atan2(east, north) + TWO_PI) % TWO_PI;
      const el = Math.atan2(up, Math.sqrt(east * east + north * north));

      if (el > -0.05) { // slight margin below horizon
        result.push({
          prn: info.prn,
          az, el,
          lat: geo.lat,
          lon: geo.lon,
          cn0: cn0Map?.get(info.prn),
        });
      }
    } catch {
      // Skip satellites with invalid ephemeris
    }
  }

  return result;
}
