import type { Position } from '@/types/position';
import { geodeticToEcef, deg2rad } from 'gnss-js/coordinates';

// Re-export coordinate functions from gnss-js
export {
  clampUnit,
  geodeticToEcef,
  ecefToGeodetic,
  getEnuDifference,
  getAer,
} from 'gnss-js/coordinates';

/** Maximum plausible distance from Earth center (~7000 km surface + generous margin for orbiting receivers) */
const MAX_ECEF_MAGNITUDE = 50_000_000; // 50 000 km

export function getPositionFromCartesian(
  x: string,
  y: string,
  z: string,
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
  height: number,
): Position {
  const latitudeRad = deg2rad(latitude);
  const longitudeRad = deg2rad(longitude);

  return geodeticToEcef(latitudeRad, longitudeRad, height);
}

export function getPositionFromGeodeticString(
  latitudeString: string,
  longitudeString: string,
  height: string,
): Position | string {
  const heightParsed = Number.parseFloat(height);

  if (Number.isNaN(heightParsed)) return 'Invalid height';

  const latitudeDegrees = Number.parseInt(latitudeString.slice(0, 2), 10);
  const latitudeMinutes = Number.parseInt(latitudeString.slice(4, 6), 10);
  const latitudeSeconds = Number.parseFloat(latitudeString.slice(8, 14));

  if (
    Number.isNaN(latitudeDegrees) ||
    Number.isNaN(latitudeMinutes) ||
    Number.isNaN(latitudeSeconds)
  )
    return 'Invalid latitude';

  if (latitudeDegrees > 90 || latitudeMinutes >= 60 || latitudeSeconds >= 60)
    return 'Latitude out of range';

  const latitudeSign =
    latitudeString[latitudeString.length - 1] === 'S' ? -1 : 1;

  const latitude = deg2rad(
    latitudeSign *
      (latitudeDegrees + latitudeMinutes / 60 + latitudeSeconds / 3600),
  );

  const longitudeDegrees = Number.parseInt(longitudeString.slice(0, 3), 10);
  const longitudeMinutes = Number.parseInt(longitudeString.slice(5, 7), 10);
  const longitudeSeconds = Number.parseFloat(longitudeString.slice(9, 15));

  if (
    Number.isNaN(longitudeDegrees) ||
    Number.isNaN(longitudeMinutes) ||
    Number.isNaN(longitudeSeconds)
  )
    return 'Invalid longitude';

  if (
    longitudeDegrees > 180 ||
    longitudeMinutes >= 60 ||
    longitudeSeconds >= 60
  )
    return 'Longitude out of range';

  const longitudeSign =
    longitudeString[longitudeString.length - 1] === 'W' ? -1 : 1;

  const longitude = deg2rad(
    longitudeSign *
      (longitudeDegrees + longitudeMinutes / 60 + longitudeSeconds / 3600),
  );

  return geodeticToEcef(latitude, longitude, heightParsed);
}
