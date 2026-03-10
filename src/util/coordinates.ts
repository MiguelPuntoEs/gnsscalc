import { WGS84_SEMI_MAJOR_AXIS, WGS84_ECCENTRICITY_SQUARED } from '../constants/geoid';

const e = Math.sqrt(WGS84_ECCENTRICITY_SQUARED);
const e2 = WGS84_ECCENTRICITY_SQUARED;

// UTM scale factor
const k0 = 0.9996;

/**
 * Convert geodetic coordinates (radians) to UTM.
 */
export function geo2utm(
  lat: number,
  lon: number
): { easting: number; northing: number; zone: number; hemisphere: 'N' | 'S' } {
  const latDeg = (lat * 180) / Math.PI;
  const lonDeg = (lon * 180) / Math.PI;

  const zone = Math.floor((lonDeg + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180); // central meridian in rad

  const ep2 = e2 / (1 - e2); // e'^2
  const N = WGS84_SEMI_MAJOR_AXIS / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const T = Math.tan(lat) ** 2;
  const C = ep2 * Math.cos(lat) ** 2;
  const A = Math.cos(lat) * (lon - lon0);

  // Meridional arc
  const M =
    WGS84_SEMI_MAJOR_AXIS *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));

  let easting =
    k0 *
    N *
    (A +
      ((1 - T + C) * A ** 3) / 6 +
      ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000;

  let northing =
    k0 *
    (M +
      N *
        Math.tan(lat) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));

  const hemisphere: 'N' | 'S' = latDeg >= 0 ? 'N' : 'S';
  if (hemisphere === 'S') {
    northing += 10000000;
  }

  return { easting, northing, zone, hemisphere };
}

/**
 * Maidenhead grid locator (6 characters) from geodetic coordinates in radians.
 */
export function geo2maidenhead(lat: number, lon: number): string {
  const latDeg = (lat * 180) / Math.PI + 90;
  const lonDeg = (lon * 180) / Math.PI + 180;

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWX';

  const a1 = chars[Math.floor(lonDeg / 20)];
  const a2 = chars[Math.floor(latDeg / 10)];
  const a3 = Math.floor((lonDeg % 20) / 2);
  const a4 = Math.floor(latDeg % 10);
  const a5 = chars[Math.floor(((lonDeg % 2) * 12))] ?? 'A';
  const a6 = chars[Math.floor(((latDeg % 1) * 24))] ?? 'A';

  return `${a1}${a2}${a3}${a4}${a5.toLowerCase()}${a6.toLowerCase()}`;
}

/**
 * Geohash encoding from geodetic coordinates in radians.
 * Returns a geohash string of the given precision (default 8).
 */
export function geo2geohash(lat: number, lon: number, precision = 8): string {
  const latDeg = (lat * 180) / Math.PI;
  const lonDeg = (lon * 180) / Math.PI;

  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90;
  let minLon = -180, maxLon = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLon = true;

  while (hash.length < precision) {
    if (isLon) {
      const mid = (minLon + maxLon) / 2;
      if (lonDeg >= mid) {
        ch = ch | (1 << (4 - bit));
        minLon = mid;
      } else {
        maxLon = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (latDeg >= mid) {
        ch = ch | (1 << (4 - bit));
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }
    isLon = !isLon;
    if (bit < 4) {
      bit++;
    } else {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
