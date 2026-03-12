import type { Position } from '@/types/position';
import {
    WGS84_ECCENTRICITY_SQUARED,
    WGS84_SEMI_MAJOR_AXIS,
} from '../constants/geoid';
import { deg2rad } from './units';

/** Clamp value to [-1, 1] before passing to asin/acos to prevent NaN from rounding errors. */
export function clampUnit(x: number): number {
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

export function geodeticToEcef(
  lat: number,
  lon: number,
  h: number
): [number, number, number] {
  const N =
    WGS84_SEMI_MAJOR_AXIS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * Math.sin(lat) ** 2);

  const x = (N + h) * Math.cos(lat) * Math.cos(lon);
  const y = (N + h) * Math.cos(lat) * Math.sin(lon);
  const z = ((1 - WGS84_ECCENTRICITY_SQUARED) * N + h) * Math.sin(lat);

  return [x, y, z];
}

export function ecefToGeodetic(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);

  // Near-polar singularity: p ≈ 0 causes division issues in the standard iteration
  if (p < 1e-10) {
    const b = WGS84_SEMI_MAJOR_AXIS * Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED);
    const lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
    const alt = Math.abs(z) - b;
    return [lat, lon, alt];
  }

  // Iterative Bowring method
  let lat = Math.atan2(z, p * (1 - WGS84_ECCENTRICITY_SQUARED));
  let N: number;
  let alt: number = 0;
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    N = WGS84_SEMI_MAJOR_AXIS / Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLat * sinLat);
    const prevLat = lat;
    lat = Math.atan2(z + WGS84_ECCENTRICITY_SQUARED * N * sinLat, p);
    if (Math.abs(lat - prevLat) < 1e-15) break;
  }
  const sinLat = Math.sin(lat);
  N = WGS84_SEMI_MAJOR_AXIS / Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinLat * sinLat);
  alt = p / Math.cos(lat) - N;

  return [lat, lon, alt];
}

/** Maximum plausible distance from Earth center (~7000 km surface + generous margin for orbiting receivers) */
const MAX_ECEF_MAGNITUDE = 50_000_000; // 50 000 km

export function getPositionFromCartesian(
  x: string,
  y: string,
  z: string
): Position | string {
  const xParsed = Number.parseFloat(x);
  const yParsed = Number.parseFloat(y);
  const zParsed = Number.parseFloat(z);

  if (Number.isNaN(xParsed) || Number.isNaN(yParsed) || Number.isNaN(zParsed))
    return 'Invalid number';

  if (xParsed === 0 && yParsed === 0) return 'X and Y cannot both be zero';

  const magnitude = Math.sqrt(xParsed ** 2 + yParsed ** 2 + zParsed ** 2);
  if (magnitude > MAX_ECEF_MAGNITUDE) return 'Position too far from Earth';

  return [xParsed, yParsed, zParsed];
}

export function getPositionFromGeodetic(
  latitude: number,
  longitude: number,
  height: number
): Position {
  const latitudeRad = deg2rad(latitude);
  const longitudeRad = deg2rad(longitude);

  return geodeticToEcef(latitudeRad, longitudeRad, height);
}

export function getEnuDifference(
  x: number,
  y: number,
  z: number,
  xRef: number,
  yRef: number,
  zRef: number
): [number, number, number] {
  const [latRef, lonRef] = ecefToGeodetic(xRef, yRef, zRef);

  const deltaX = x - xRef;
  const deltaY = y - yRef;
  const deltaZ = z - zRef;

  const deltaE = -Math.sin(lonRef) * deltaX + Math.cos(lonRef) * deltaY;
  const deltaN =
    -Math.cos(lonRef) * Math.sin(latRef) * deltaX -
    Math.sin(lonRef) * Math.sin(latRef) * deltaY +
    Math.cos(latRef) * deltaZ;
  const deltaU =
    Math.cos(lonRef) * Math.cos(latRef) * deltaX +
    Math.sin(lonRef) * Math.cos(latRef) * deltaY +
    Math.sin(latRef) * deltaZ;

  return [deltaE, deltaN, deltaU];
}

export function getAer(
  x: number,
  y: number,
  z: number,
  xRef: number,
  yRef: number,
  zRef: number
): [number, number, number] {
  const slant = Math.sqrt((x - xRef) ** 2 + (y - yRef) ** 2 + (z - zRef) ** 2);

  if (!slant) return [0, 0, 0];

  const [deltaE, deltaN, deltaU] = getEnuDifference(x, y, z, xRef, yRef, zRef);

  const elevation = Math.asin(clampUnit(deltaU / slant));
  const azimuth = Math.atan2(deltaE, deltaN);

  return [elevation, azimuth, slant];
}

export function getPositionFromGeodeticString(
  latitudeString: string,
  longitudeString: string,
  height: string
): Position | string {
  const heightParsed = Number.parseFloat(height);

  if (Number.isNaN(heightParsed)) return 'Invalid height';

  const latitudeDegrees = Number.parseInt(latitudeString.slice(0, 2), 10);
  const latitudeMinutes = Number.parseInt(latitudeString.slice(4, 6), 10);
  const latitudeSeconds = Number.parseFloat(latitudeString.slice(8, 14));

  if (Number.isNaN(latitudeDegrees) || Number.isNaN(latitudeMinutes) || Number.isNaN(latitudeSeconds))
    return 'Invalid latitude';

  if (latitudeDegrees > 90 || latitudeMinutes >= 60 || latitudeSeconds >= 60)
    return 'Latitude out of range';

  const latitudeSign =
    latitudeString[latitudeString.length - 1] === 'S' ? -1 : 1;

  const latitude = deg2rad(
    latitudeSign *
      (latitudeDegrees +
        latitudeMinutes / 60 +
        latitudeSeconds / 3600)
  );

  const longitudeDegrees = Number.parseInt(longitudeString.slice(0, 3), 10);
  const longitudeMinutes = Number.parseInt(longitudeString.slice(5, 7), 10);
  const longitudeSeconds = Number.parseFloat(longitudeString.slice(9, 15));

  if (Number.isNaN(longitudeDegrees) || Number.isNaN(longitudeMinutes) || Number.isNaN(longitudeSeconds))
    return 'Invalid longitude';

  if (longitudeDegrees > 180 || longitudeMinutes >= 60 || longitudeSeconds >= 60)
    return 'Longitude out of range';

  const longitudeSign =
    longitudeString[longitudeString.length - 1] === 'W' ? -1 : 1;

  const longitude = deg2rad(
    longitudeSign *
      (longitudeDegrees +
        longitudeMinutes / 60 +
        longitudeSeconds / 3600)
  );

  return geodeticToEcef(latitude, longitude, heightParsed);
}
