import { describe, it, expect } from 'vitest';
import { vincenty, rhumbLine, euclidean3D, greatCircleMidpoint, horizonDistance } from './geodesy';
import { deg2rad } from './units';

describe('vincenty', () => {
  it('computes distance between London and Paris', () => {
    // London: 51.5074°N, 0.1278°W → Paris: 48.8566°N, 2.3522°E
    const lat1 = deg2rad(51.5074), lon1 = deg2rad(-0.1278);
    const lat2 = deg2rad(48.8566), lon2 = deg2rad(2.3522);
    const { distance } = vincenty(lat1, lon1, lat2, lon2);
    // ~343 km (city center to city center on WGS84)
    expect(distance).toBeGreaterThan(340_000);
    expect(distance).toBeLessThan(345_000);
  });

  it('computes distance between New York and Los Angeles', () => {
    const lat1 = deg2rad(40.7128), lon1 = deg2rad(-74.0060);
    const lat2 = deg2rad(34.0522), lon2 = deg2rad(-118.2437);
    const { distance } = vincenty(lat1, lon1, lat2, lon2);
    // Known ~3944 km
    expect(distance).toBeGreaterThan(3_940_000);
    expect(distance).toBeLessThan(3_950_000);
  });

  it('returns zero for coincident points', () => {
    const lat = deg2rad(45), lon = deg2rad(10);
    const { distance } = vincenty(lat, lon, lat, lon);
    expect(distance).toBe(0);
  });

  it('computes bearings correctly (due north)', () => {
    const lat1 = deg2rad(0), lon = deg2rad(0);
    const lat2 = deg2rad(10);
    const { initialBearing } = vincenty(lat1, lon, lat2, lon);
    // Due north → bearing ≈ 0
    expect(Math.abs(initialBearing)).toBeLessThan(0.001);
  });

  it('computes bearings correctly (due east)', () => {
    const lat = deg2rad(0), lon1 = deg2rad(0), lon2 = deg2rad(10);
    const { initialBearing } = vincenty(lat, lon1, lat, lon2);
    // Due east → bearing ≈ π/2
    expect(initialBearing).toBeCloseTo(Math.PI / 2, 2);
  });
});

describe('rhumbLine', () => {
  it('computes rhumb distance between London and Paris', () => {
    const lat1 = deg2rad(51.5074), lon1 = deg2rad(-0.1278);
    const lat2 = deg2rad(48.8566), lon2 = deg2rad(2.3522);
    const { distance } = rhumbLine(lat1, lon1, lat2, lon2);
    // Rhumb distance should be >= great-circle, but close for short distances
    expect(distance).toBeGreaterThan(340_000);
    expect(distance).toBeLessThan(345_000);
  });

  it('rhumb distance >= orthodromic distance', () => {
    const lat1 = deg2rad(40.7128), lon1 = deg2rad(-74.0060);
    const lat2 = deg2rad(34.0522), lon2 = deg2rad(-118.2437);
    const { distance: rhumb } = rhumbLine(lat1, lon1, lat2, lon2);
    const { distance: ortho } = vincenty(lat1, lon1, lat2, lon2);
    expect(rhumb).toBeGreaterThanOrEqual(ortho * 0.999); // Allow tiny floating point slack
  });
});

describe('euclidean3D', () => {
  it('computes straight-line distance', () => {
    const d = euclidean3D(1, 0, 0, 4, 0, 0);
    expect(d).toBeCloseTo(3, 10);
  });

  it('computes 3D diagonal', () => {
    const d = euclidean3D(0, 0, 0, 3, 4, 0);
    expect(d).toBeCloseTo(5, 10);
  });
});

describe('greatCircleMidpoint', () => {
  it('midpoint of equator segment is on equator', () => {
    const [midLat] = greatCircleMidpoint(0, 0, 0, deg2rad(90));
    expect(midLat).toBeCloseTo(0, 10);
  });

  it('midpoint longitude is average for same-latitude points', () => {
    const [, midLon] = greatCircleMidpoint(
      deg2rad(45), deg2rad(0),
      deg2rad(45), deg2rad(90)
    );
    // Midpoint longitude should be ~45°
    expect(midLon).toBeCloseTo(deg2rad(45), 1);
  });
});

describe('horizonDistance', () => {
  it('returns 0 for zero height', () => {
    expect(horizonDistance(0)).toBe(0);
  });

  it('returns 0 for negative height', () => {
    expect(horizonDistance(-10)).toBe(0);
  });

  it('returns ~3.6 km for 1 m height (standard approximation)', () => {
    const d = horizonDistance(1);
    // Classic formula: ~3.57 km for 1m, but with refraction ~3.86 km
    expect(d).toBeGreaterThan(3_500);
    expect(d).toBeLessThan(4_000);
  });

  it('returns ~113 km for 1000 m height', () => {
    const d = horizonDistance(1000);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(125_000);
  });
});
