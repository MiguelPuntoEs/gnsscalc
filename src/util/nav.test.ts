import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseNavFile } from './nav';
import { keplerPosition, ecefToAzEl, computeDop, computeSatPosition } from './orbit';
import { ecefToGeodetic } from './positioning';
import type { KeplerEphemeris, GlonassEphemeris, Ephemeris } from './nav';

const NAV_FILE = join(__dirname, '../../test-fixtures/BRDC.nav');
// Cross-version validation files (downloaded by scripts/fetch-e2e-data.sh)
const CROSS_V2_FILE = join(__dirname, '../../test-fixtures/brdc_v2.nav');
const CROSS_V2_GLO_FILE = join(__dirname, '../../test-fixtures/brdc_v2_glo.nav');
const CROSS_V3_FILE = join(__dirname, '../../test-fixtures/brdc_v3_igs.nav');
const CROSS_V4_FILE = join(__dirname, '../../test-fixtures/brdc_v4_dlr.nav');
const HAS_CROSS_DATA = existsSync(CROSS_V2_FILE) && existsSync(CROSS_V3_FILE) && existsSync(CROSS_V4_FILE);
const HAS_V2_DATA = existsSync(CROSS_V2_FILE);

describe.skipIf(!HAS_V2_DATA)('RINEX 2 Navigation file parser', () => {
  let result: ReturnType<typeof parseNavFile>;

  it('reads the file', () => {
    const text = readFileSync(CROSS_V2_FILE, 'utf-8');
    result = parseNavFile(text);
  });

  it('parses header', () => {
    expect(result.header.version).toBe(2);
    expect(result.header.leapSeconds).toBe(18);
  });

  it('parses iono corrections from ION ALPHA/BETA', () => {
    expect(result.header.ionoCorrections['GPSA']).toBeDefined();
    expect(result.header.ionoCorrections['GPSA']!.length).toBe(4);
    expect(result.header.ionoCorrections['GPSB']).toBeDefined();
    expect(result.header.ionoCorrections['GPSB']!.length).toBe(4);
  });

  it('parses GPS ephemerides with correct PRN format', () => {
    const gps = result.ephemerides.filter(e => e.system === 'G');
    expect(gps.length).toBeGreaterThan(0);
    // PRNs should be like G01, G03, etc.
    for (const e of gps) {
      expect(e.prn).toMatch(/^G\d{2}$/);
    }
  });

  it('parses first record correctly', () => {
    const g01 = result.ephemerides.find(e => e.prn === 'G01') as KeplerEphemeris;
    expect(g01).toBeDefined();
    expect(g01.af0).toBeCloseTo(0.347841065377e-3, 12);
    expect(g01.af1).toBeCloseTo(-0.295585778076e-11, 20);
    expect(g01.tocDate.getUTCFullYear()).toBe(2026);
    expect(g01.tocDate.getUTCMonth()).toBe(0); // January
    expect(g01.tocDate.getUTCDate()).toBe(1);
  });

  it('parses many records', () => {
    expect(result.ephemerides.length).toBeGreaterThan(100);
  });

  it('has correct field mappings (health, week)', () => {
    const g01 = result.ephemerides.find(e => e.prn === 'G01') as KeplerEphemeris;
    expect(g01.svHealth).toBe(0); // healthy
    expect(g01.week).toBe(2399);
  });
});

describe('Navigation file parser', () => {
  const text = readFileSync(NAV_FILE, 'utf-8');
  const result = parseNavFile(text);

  it('parses header', () => {
    expect(result.header.version).toBe(3.04);
    expect(result.header.leapSeconds).toBe(18);
  });

  it('parses GPS ephemerides', () => {
    const gps = result.ephemerides.filter(e => e.system === 'G');
    expect(gps.length).toBeGreaterThan(0);
    const g14 = gps.find(e => e.prn === 'G14') as KeplerEphemeris;
    expect(g14).toBeDefined();
    expect(g14.af0).toBeCloseTo(2.863593399520e-4, 10);
    expect(g14.e).toBeCloseTo(3.804026404400e-3, 10);
    expect(g14.sqrtA).toBeCloseTo(5153.677343370, 3);
  });

  it('parses GLONASS ephemerides', () => {
    const glo = result.ephemerides.filter(e => e.system === 'R');
    expect(glo.length).toBeGreaterThan(0);
  });

  it('parses Galileo ephemerides', () => {
    const gal = result.ephemerides.filter(e => e.system === 'E');
    expect(gal.length).toBeGreaterThan(0);
  });

  it('parses BeiDou ephemerides', () => {
    const bds = result.ephemerides.filter(e => e.system === 'C');
    expect(bds.length).toBeGreaterThan(0);
  });

  it('parses many records', () => {
    expect(result.ephemerides.length).toBeGreaterThan(100);
  });
});

describe('Orbit computation – nav file', () => {
  it('computes GPS satellite position from ephemeris', () => {
    const text = readFileSync(NAV_FILE, 'utf-8');
    const result = parseNavFile(text);
    const g14 = result.ephemerides.find(e => e.prn === 'G14') as KeplerEphemeris;

    // Compute position at toe
    const pos = keplerPosition(g14, g14.toe);
    // Position should be roughly at GPS orbit altitude (~26,000 km)
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(20e6); // > 20,000 km
    expect(r).toBeLessThan(30e6);    // < 30,000 km
  });
});

describe('Orbit computation', () => {
  it('computes azimuth and elevation', () => {
    // Receiver at ECEF roughly at equator
    const rxX = 6378137; // on equator, prime meridian
    const rxY = 0;
    const rxZ = 0;

    // Satellite directly above
    const { az, el } = ecefToAzEl(rxX, rxY, rxZ, rxX + 20e6, 0, 0);
    expect(el).toBeCloseTo(Math.PI / 2, 1); // ~90° elevation
  });

  it('converts ECEF to geodetic', () => {
    // Point on equator at prime meridian
    const [lat, lon] = ecefToGeodetic(6378137, 0, 0);
    expect(lat).toBeCloseTo(0, 5);
    expect(lon).toBeCloseTo(0, 5);

    // North pole
    const [npLat] = ecefToGeodetic(0, 0, 6356752.314);
    expect(npLat).toBeCloseTo(Math.PI / 2, 3);
  });

  it('computes DOP from satellite geometry', () => {
    // 4 sats at varying elevations, evenly spread in azimuth
    const sats = [
      { az: 0, el: 30 }, { az: 90, el: 60 },
      { az: 180, el: 20 }, { az: 270, el: 70 },
    ].map(({ az, el }) => ({ az: az * Math.PI / 180, el: el * Math.PI / 180 }));
    const dop = computeDop(sats);
    expect(dop).not.toBeNull();
    expect(dop!.pdop).toBeGreaterThan(1);
    expect(dop!.pdop).toBeLessThan(5);
    expect(dop!.hdop).toBeLessThan(dop!.pdop);
  });

  it('returns null DOP with fewer than 4 sats', () => {
    const sats = [{ az: 0, el: 0.5 }, { az: 1, el: 0.5 }, { az: 2, el: 0.5 }];
    expect(computeDop(sats)).toBeNull();
  });
});

// ── Cross-version validation (RINEX 2 vs 3 vs 4, same day) ─────────
// Run `scripts/fetch-e2e-data.sh` to download the required files.
describe.skipIf(!HAS_CROSS_DATA)('Cross-version nav validation (2026/001)', () => {
  // Build lookup: PRN+toc → ephemeris (first match per PRN+toc)
  function buildEphMap(ephs: Ephemeris[]) {
    const kepler = new Map<string, KeplerEphemeris>();
    const glonass = new Map<string, GlonassEphemeris>();
    for (const e of ephs) {
      const k = `${e.prn}_${e.tocDate.toISOString()}`;
      if (e.system === 'R' || e.system === 'S') {
        if (!glonass.has(k)) glonass.set(k, e as GlonassEphemeris);
      } else {
        if (!kepler.has(k)) kepler.set(k, e as KeplerEphemeris);
      }
    }
    return { kepler, glonass };
  }

  let v2k: Map<string, KeplerEphemeris>;
  let v3k: Map<string, KeplerEphemeris>;
  let v4k: Map<string, KeplerEphemeris>;
  let v2g: Map<string, GlonassEphemeris>;
  let v3g: Map<string, GlonassEphemeris>;
  let v4g: Map<string, GlonassEphemeris>;

  beforeAll(() => {
    const m2 = buildEphMap(parseNavFile(readFileSync(CROSS_V2_FILE, 'utf-8')).ephemerides);
    const m3 = buildEphMap(parseNavFile(readFileSync(CROSS_V3_FILE, 'utf-8')).ephemerides);
    const m4 = buildEphMap(parseNavFile(readFileSync(CROSS_V4_FILE, 'utf-8')).ephemerides);
    v2k = m2.kepler;
    v3k = m3.kepler;  v3g = m3.glonass;
    v4k = m4.kepler;  v4g = m4.glonass;
    // RINEX 2 GLONASS is a separate file (.26g)
    if (existsSync(CROSS_V2_GLO_FILE)) {
      v2g = buildEphMap(parseNavFile(readFileSync(CROSS_V2_GLO_FILE, 'utf-8')).ephemerides).glonass;
    } else {
      v2g = new Map();
    }
  });

  // ── GPS (V2 vs V3 vs V4) ──────────────────────────────────────

  it('all versions parse GPS ephemerides', () => {
    const gps2 = [...v2k.values()].filter(e => e.system === 'G').length;
    const gps3 = [...v3k.values()].filter(e => e.system === 'G').length;
    const gps4 = [...v4k.values()].filter(e => e.system === 'G').length;
    expect(gps2).toBeGreaterThan(50);
    expect(gps3).toBeGreaterThan(50);
    expect(gps4).toBeGreaterThan(50);
  });

  it('GPS ephemeris fields match across V2, V3, and V4', () => {
    const commonKeys: string[] = [];
    for (const key of v2k.keys()) {
      if (v3k.has(key) && v4k.has(key)) commonKeys.push(key);
    }
    expect(commonKeys.length).toBeGreaterThan(30);

    const fields: (keyof KeplerEphemeris)[] = [
      'af0', 'af1', 'af2', 'e', 'sqrtA', 'i0', 'omega0', 'omega', 'm0',
      'deltaN', 'omegaDot', 'idot', 'cuc', 'cus', 'crc', 'crs', 'cic', 'cis',
      'toe', 'week',
    ];

    for (const key of commonKeys.slice(0, 10)) {
      const e2 = v2k.get(key)!;
      const e3 = v3k.get(key)!;
      const e4 = v4k.get(key)!;
      for (const f of fields) {
        const val2 = e2[f] as number;
        const val3 = e3[f] as number;
        const val4 = e4[f] as number;
        expect(val3).toBeCloseTo(val2, 7);
        expect(val4).toBeCloseTo(val2, 7);
      }
    }
  });

  it('GPS satellite positions agree within 1 mm (V2 vs V3 vs V4)', () => {
    const commonKeys: string[] = [];
    for (const key of v2k.keys()) {
      if (v3k.has(key) && v4k.has(key)) commonKeys.push(key);
    }

    for (const key of commonKeys.slice(0, 5)) {
      const e2 = v2k.get(key)!;
      const e3 = v3k.get(key)!;
      const e4 = v4k.get(key)!;
      const p2 = keplerPosition(e2, e2.toe);
      const p3 = keplerPosition(e3, e3.toe);
      const p4 = keplerPosition(e4, e4.toe);
      const dist23 = Math.sqrt((p2.x - p3.x) ** 2 + (p2.y - p3.y) ** 2 + (p2.z - p3.z) ** 2);
      const dist24 = Math.sqrt((p2.x - p4.x) ** 2 + (p2.y - p4.y) ** 2 + (p2.z - p4.z) ** 2);
      expect(dist23).toBeLessThan(0.001);
      expect(dist24).toBeLessThan(0.001);
    }
  });

  // ── Galileo (V3 vs V4) ────────────────────────────────────────

  it('V3 and V4 parse Galileo ephemerides', () => {
    const gal3 = [...v3k.values()].filter(e => e.system === 'E').length;
    const gal4 = [...v4k.values()].filter(e => e.system === 'E').length;
    expect(gal3).toBeGreaterThan(20);
    expect(gal4).toBeGreaterThan(20);
  });

  it('Galileo ephemeris fields match V3 vs V4', () => {
    const common: string[] = [];
    for (const [key, e] of v3k) {
      if (e.system === 'E' && v4k.has(key)) common.push(key);
    }
    expect(common.length).toBeGreaterThan(0);

    const fields: (keyof KeplerEphemeris)[] = [
      'af0', 'af1', 'af2', 'e', 'sqrtA', 'i0', 'omega0', 'omega', 'm0',
      'deltaN', 'omegaDot', 'idot', 'cuc', 'cus', 'crc', 'crs', 'cic', 'cis',
      'toe', 'week',
    ];

    for (const key of common.slice(0, 10)) {
      const e3 = v3k.get(key)!;
      const e4 = v4k.get(key)!;
      for (const f of fields) {
        expect(e4[f] as number).toBeCloseTo(e3[f] as number, 7);
      }
    }
  });

  // ── BeiDou (V3 vs V4) ─────────────────────────────────────────

  it('V3 and V4 parse BeiDou ephemerides', () => {
    const bds3 = [...v3k.values()].filter(e => e.system === 'C').length;
    const bds4 = [...v4k.values()].filter(e => e.system === 'C').length;
    expect(bds3).toBeGreaterThan(20);
    expect(bds4).toBeGreaterThan(20);
  });

  it('BeiDou ephemeris fields match V3 vs V4', () => {
    const common: string[] = [];
    for (const [key, e] of v3k) {
      if (e.system === 'C' && v4k.has(key)) common.push(key);
    }
    expect(common.length).toBeGreaterThan(0);

    const fields: (keyof KeplerEphemeris)[] = [
      'af0', 'af1', 'af2', 'e', 'sqrtA', 'i0', 'omega0', 'omega', 'm0',
      'deltaN', 'omegaDot', 'idot', 'cuc', 'cus', 'crc', 'crs', 'cic', 'cis',
      'toe', 'week',
    ];

    for (const key of common.slice(0, 10)) {
      const e3 = v3k.get(key)!;
      const e4 = v4k.get(key)!;
      for (const f of fields) {
        expect(e4[f] as number).toBeCloseTo(e3[f] as number, 7);
      }
    }
  });

  // ── GLONASS (V2 vs V3 vs V4) ─────────────────────────────────

  it('V3 and V4 parse GLONASS ephemerides', () => {
    expect(v3g.size).toBeGreaterThan(20);
    expect(v4g.size).toBeGreaterThan(20);
  });

  it('V2 GLONASS file parses ephemerides', () => {
    if (v2g.size === 0) return; // .26g not downloaded
    expect(v2g.size).toBeGreaterThan(20);
  });

  it('GLONASS ephemeris fields match across versions', () => {
    const fields: (keyof GlonassEphemeris)[] = [
      'tauN', 'gammaN', 'x', 'xDot', 'xAcc',
      'y', 'yDot', 'yAcc', 'z', 'zDot', 'zAcc',
      'health', 'freqNum',
    ];

    // V3 vs V4
    const common34: string[] = [];
    for (const key of v3g.keys()) {
      if (v4g.has(key)) common34.push(key);
    }
    expect(common34.length).toBeGreaterThan(0);
    for (const key of common34.slice(0, 10)) {
      const e3 = v3g.get(key)!;
      const e4 = v4g.get(key)!;
      for (const f of fields) {
        expect(e4[f] as number).toBeCloseTo(e3[f] as number, 7);
      }
    }

    // V2 vs V3 (if .26g available) — V2 D19.12 has ~12 sig digits,
    // but large km values (e.g. 14122 km) only preserve ~6 decimal places.
    if (v2g.size > 0) {
      const common23: string[] = [];
      for (const key of v2g.keys()) {
        if (v3g.has(key)) common23.push(key);
      }
      expect(common23.length).toBeGreaterThan(0);
      for (const key of common23.slice(0, 10)) {
        const e2 = v2g.get(key)!;
        const e3 = v3g.get(key)!;
        for (const f of fields) {
          expect(e3[f] as number).toBeCloseTo(e2[f] as number, 6);
        }
      }
    }
  });

  // ── Keplerian position agreement across all constellations (V3 vs V4) ──

  it.each(['G', 'E', 'C', 'J'] as const)('%s satellite positions agree within 1 mm (V3 vs V4)', (sys) => {
    const common: string[] = [];
    for (const [key, e] of v3k) {
      if (e.system === sys && v4k.has(key)) common.push(key);
    }
    if (common.length === 0) return; // skip if no common records for this system

    for (const key of common.slice(0, 5)) {
      const e3 = v3k.get(key)!;
      const e4 = v4k.get(key)!;
      const p3 = keplerPosition(e3, e3.toe);
      const p4 = keplerPosition(e4, e4.toe);
      const dist = Math.sqrt((p3.x - p4.x) ** 2 + (p3.y - p4.y) ** 2 + (p3.z - p4.z) ** 2);
      expect(dist).toBeLessThan(0.001);
    }
  });
});
