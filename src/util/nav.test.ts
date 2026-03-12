import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseNavFile } from './nav';
import { keplerPosition, ecefToAzEl, computeDop } from './orbit';
import { ecefToGeodetic } from './positioning';
import type { KeplerEphemeris } from './nav';

const NAV_FILE = join(__dirname, '../../data/rinex/navigation/ABMF00GLP_R_20260010000_01D_MN.rnx');

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
    expect(g14.af0).toBeCloseTo(7.258476689458e-4, 10);
    expect(g14.e).toBeCloseTo(6.458024843596e-3, 10);
    expect(g14.sqrtA).toBeCloseTo(5153.644140244, 3);
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

describe('Orbit computation', () => {
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
