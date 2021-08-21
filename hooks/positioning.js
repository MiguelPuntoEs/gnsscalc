import { deg2hms, rad2deg } from '../util/units';
import { car2geo, getAer, getEnuDifference } from '../util/positioning';

export function usePositionCalculator(position) {
  const [latitude, longitude, height] = car2geo(
    position[0],
    position[1],
    position[2]
  );

  if (!position) return undefined;

  if (position[0] === 0 && position[1] === 0) {
    return undefined;
  }

  const latitudeDeg = rad2deg(latitude);
  const longitudeDeg = rad2deg(longitude);

  const [latitudeDegrees, latitudeMinutes, latitudeSeconds] = deg2hms(
    Math.abs(latitudeDeg)
  );
  const [longitudeDegrees, longitudeMinutes, longitudeSeconds] = deg2hms(
    Math.abs(longitudeDeg)
  );
  const latitudeDirection = latitude >= 0 ? 'N' : 'S';
  const longitudeDirection = longitude >= 0 ? 'E' : 'W';

  return {
    latitude: {
      value: latitudeDeg,
      degrees: latitudeDegrees,
      minutes: latitudeMinutes,
      seconds: latitudeSeconds,
      direction: latitudeDirection,
    },
    longitude: {
      value: longitudeDeg,
      degrees: longitudeDegrees,
      minutes: longitudeMinutes,
      seconds: longitudeSeconds,
      direction: longitudeDirection,
    },
    height,
  };
}

export function useAerCalculator(position, refPosition) {
  if (!position || !refPosition) return undefined;

  const [elevation, azimuth, slant] = getAer(
    position[0],
    position[1],
    position[2],
    refPosition[0],
    refPosition[1],
    refPosition[2]
  );

  const elevationDeg = rad2deg(elevation);
  const azimuthDeg = rad2deg(azimuth);

  return {
    elevationDeg,
    azimuthDeg,
    slant,
  };
}

export function useENUCalculator(position, refPosition) {
  if (!position || !refPosition) return undefined;

  const [deltaE, deltaN, deltaU] = getEnuDifference(
    position[0],
    position[1],
    position[2],
    refPosition[0],
    refPosition[1],
    refPosition[2]
  );

  return {
    deltaE,
    deltaN,
    deltaU,
  };
}
