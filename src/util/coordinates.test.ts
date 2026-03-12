import { describe, it, expect } from 'vitest';
import { geodeticToUtm, geodeticToMaidenhead, geodeticToGeohash } from './coordinates';
import { deg2rad } from './units';

describe('geodeticToUtm', () => {
  it('converts Madrid coordinates correctly', () => {
    // Madrid: 40.4168°N, 3.7038°W → UTM zone 30N
    const lat = deg2rad(40.4168), lon = deg2rad(-3.7038);
    const { zone, hemisphere, easting, northing } = geodeticToUtm(lat, lon);
    expect(zone).toBe(30);
    expect(hemisphere).toBe('N');
    expect(easting).toBeGreaterThan(400_000);
    expect(easting).toBeLessThan(500_000);
    expect(northing).toBeGreaterThan(4_470_000);
    expect(northing).toBeLessThan(4_480_000);
  });

  it('converts Sydney (southern hemisphere) correctly', () => {
    // Sydney: 33.8688°S, 151.2093°E → UTM zone 56S
    const lat = deg2rad(-33.8688), lon = deg2rad(151.2093);
    const { zone, hemisphere, northing } = geodeticToUtm(lat, lon);
    expect(zone).toBe(56);
    expect(hemisphere).toBe('S');
    // Southern hemisphere gets 10M offset
    expect(northing).toBeGreaterThan(6_000_000);
    expect(northing).toBeLessThan(7_000_000);
  });

  it('easting is always near 500000 at central meridian', () => {
    // Zone 31 central meridian is 3°E
    const lat = deg2rad(45), lon = deg2rad(3);
    const { easting } = geodeticToUtm(lat, lon);
    expect(Math.abs(easting - 500_000)).toBeLessThan(1);
  });
});

describe('geodeticToMaidenhead', () => {
  it('converts Washington DC correctly', () => {
    // 38.9072°N, 77.0369°W → FM18lw
    const lat = deg2rad(38.9072), lon = deg2rad(-77.0369);
    const mh = geodeticToMaidenhead(lat, lon);
    expect(mh).toHaveLength(6);
    expect(mh.slice(0, 4)).toBe('FM18');
  });

  it('converts Paris correctly', () => {
    // 48.8566°N, 2.3522°E → JN18eu
    const lat = deg2rad(48.8566), lon = deg2rad(2.3522);
    const mh = geodeticToMaidenhead(lat, lon);
    expect(mh.slice(0, 2)).toBe('JN');
  });

  it('returns 6 characters', () => {
    const mh = geodeticToMaidenhead(deg2rad(0), deg2rad(0));
    expect(mh).toHaveLength(6);
  });
});

describe('geodeticToGeohash', () => {
  it('returns correct length', () => {
    const gh = geodeticToGeohash(deg2rad(48.8566), deg2rad(2.3522));
    expect(gh).toHaveLength(8);
  });

  it('returns correct length with custom precision', () => {
    const gh = geodeticToGeohash(deg2rad(48.8566), deg2rad(2.3522), 5);
    expect(gh).toHaveLength(5);
  });

  it('encodes known location (Paris center starts with u09)', () => {
    const gh = geodeticToGeohash(deg2rad(48.8566), deg2rad(2.3522));
    expect(gh.startsWith('u09')).toBe(true);
  });

  it('encodes known location (London starts with gcpv)', () => {
    const gh = geodeticToGeohash(deg2rad(51.5074), deg2rad(-0.1278));
    expect(gh.startsWith('gcpv')).toBe(true);
  });

  it('only uses valid base32 characters', () => {
    const gh = geodeticToGeohash(deg2rad(40.4168), deg2rad(-3.7038));
    const valid = '0123456789bcdefghjkmnpqrstuvwxyz';
    for (const ch of gh) {
      expect(valid).toContain(ch);
    }
  });
});
