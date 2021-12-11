import { deg2hms, rad2deg } from "util/units";
import { car2geo, getAer, getEnuDifference } from "util/positioning";

export function usePositionCalculator(position: [number, number, number]) {
  if (!position) return undefined;

  if (position[0] === 0 && position[1] === 0) {
    return undefined;
  }

  const [latitude, longitude, height] = car2geo(...position);

  const latitudeDeg = rad2deg(latitude);
  const longitudeDeg = rad2deg(longitude);

  const latHms = deg2hms(Math.abs(latitudeDeg));
  const longHms = deg2hms(Math.abs(longitudeDeg));

  if (!latHms || !longHms) {
    return undefined;
  }

  const [latitudeDegrees, latitudeMinutes, latitudeSeconds] = latHms;
  const [longitudeDegrees, longitudeMinutes, longitudeSeconds] = longHms;

  const latitudeDirection = latitude >= 0 ? "N" : "S";
  const longitudeDirection = longitude >= 0 ? "E" : "W";

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

export function useAerCalculator(
  position: [number, number, number],
  refPosition: [number, number, number],
) {
  if (!position || !refPosition) return undefined;

  const [elevation, azimuth, slant] = getAer(...position, ...refPosition);

  const elevationDeg = rad2deg(elevation);
  const azimuthDeg = rad2deg(azimuth);

  return {
    elevationDeg,
    azimuthDeg,
    slant,
  };
}

export function useENUCalculator(
  position: [number, number, number],
  refPosition: [number, number, number],
) {
  if (!position || !refPosition) return undefined;

  const [deltaE, deltaN, deltaU] = getEnuDifference(
    ...position,
    ...refPosition,
  );

  return {
    deltaE,
    deltaN,
    deltaU,
  };
}
