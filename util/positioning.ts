import { Position } from '@/types/position';
import { MINUTES_IN_DEGREE, SECONDS_IN_DEGREE } from '../constants/angles';
import {
  WGS84_ECCENTRICITY_SQUARED,
  WGS84_SEMI_MAJOR_AXIS,
} from '../constants/geoid';
import { deg2rad } from './units';

export function geo2car(
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

export function car2geo(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const MAX_ITER = 50;
  const MAX_DELTA_ITER = 1e-15;
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x ** 2 + y ** 2);
  let lati = Math.atan(z / p / (1 - WGS84_ECCENTRICITY_SQUARED));
  let iter = 0;

  let latiPrev;
  let Ni;
  let hi;

  while (true) {
    latiPrev = lati;
    Ni =
      WGS84_SEMI_MAJOR_AXIS /
      Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * Math.sin(latiPrev) ** 2);
    hi = p / Math.cos(latiPrev) - Ni;
    lati = Math.atan(
      z / p / (1 - (Ni / (Ni + hi)) * WGS84_ECCENTRICITY_SQUARED)
    );
    if (Math.abs(lati - latiPrev) < MAX_DELTA_ITER) {
      break;
    }
    iter += 1;
    if (iter > MAX_ITER) {
      break;
    }
  }

  return [lati, lon, hi];
}

export function getPositionFromCartesian(
  x: string,
  y: string,
  z: string
): [number, number, number] | undefined {
  const xParsed = Number.parseFloat(x);
  const yParsed = Number.parseFloat(y);
  const zParsed = Number.parseFloat(z);

  if (Number.isNaN(xParsed) || Number.isNaN(yParsed) || Number.isNaN(zParsed))
    return undefined;

  if (xParsed === 0 && yParsed === 0) return undefined;

  return [xParsed, yParsed, zParsed];
}

export function getPositionFromGeodetic(
  latitude: number,
  longitude: number,
  height: number
): Position {
  const latitudeRad = deg2rad(latitude);
  const longitudeRad = deg2rad(longitude);

  return geo2car(latitudeRad, longitudeRad, height);
}

export function getEnuDifference(
  x: number,
  y: number,
  z: number,
  xRef: number,
  yRef: number,
  zRef: number
): [number, number, number] {
  const [latRef, lonRef] = car2geo(xRef, yRef, zRef);

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

export function getAer(x, y, z, xRef, yRef, zRef) {
  const slant = Math.sqrt((x - xRef) ** 2 + (y - yRef) ** 2 + (z - zRef) ** 2);

  if (!slant) return [0, 0, 0];

  const [deltaE, deltaN, deltaU] = getEnuDifference(x, y, z, xRef, yRef, zRef);

  const elevation = Math.asin(deltaU / slant);
  const azimuth = Math.atan2(deltaE, deltaN);

  return [elevation, azimuth, slant];
}

export function getPositionFromGeodeticString(
  latitudeString: string,
  longitudeString: string,
  height: string
): [number, number, number] | undefined {
  const heightParsed = Number.parseFloat(height);

  if (Number.isNaN(heightParsed)) return undefined;

  const latitudeDegrees = Number.parseInt(latitudeString.slice(0, 2), 10);
  const latitudeMinutes = Number.parseInt(latitudeString.slice(4, 6), 10);
  const latitudeSeconds = Number.parseFloat(latitudeString.slice(8, 14));

  if (
    Number.isNaN(latitudeDegrees) ||
    Number.isNaN(latitudeMinutes) ||
    Number.isNaN(latitudeSeconds)
  ) {
    return undefined;
  }

  const latitudeSign =
    latitudeString[latitudeString.length - 1] === 'S' ? -1 : 1;

  const latitude = deg2rad(
    latitudeSign *
      (latitudeDegrees +
        latitudeMinutes / MINUTES_IN_DEGREE +
        latitudeSeconds / SECONDS_IN_DEGREE)
  );

  const longitudeDegrees = Number.parseInt(longitudeString.slice(0, 3), 10);
  const longitudeMinutes = Number.parseInt(longitudeString.slice(5, 7), 10);
  const longitudeSeconds = Number.parseFloat(longitudeString.slice(9, 15));

  if (
    Number.isNaN(longitudeDegrees) ||
    Number.isNaN(longitudeMinutes) ||
    Number.isNaN(longitudeSeconds)
  )
    return undefined;

  const longitudeSign =
    longitudeString[longitudeString.length - 1] === 'W' ? -1 : 1;

  const longitude = deg2rad(
    longitudeSign *
      (longitudeDegrees +
        longitudeMinutes / MINUTES_IN_DEGREE +
        longitudeSeconds / SECONDS_IN_DEGREE)
  );

  return geo2car(latitude, longitude, heightParsed);
}
