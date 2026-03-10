import { useMemo } from 'react';
import type { AERResult, CoordinateFormats, DistanceResult, ENUResult, PositionResult } from '@/types/position';
import { car2geo, getAer, getEnuDifference } from '@/util/positioning';
import { geo2utm, geo2maidenhead, geo2geohash } from '@/util/coordinates';
import { vincenty, rhumbLine, euclidean3D, greatCircleMidpoint, horizonDistance } from '@/util/geodesy';
import { deg2hms, rad2deg } from '../util/units';

export function usePositionCalculator(
  position: [number, number, number]
): PositionResult {
  return useMemo(() => {
    const [latitude, longitude, height] = car2geo(
      position[0],
      position[1],
      position[2]
    );

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
  }, [position[0], position[1], position[2]]);
}

export function useAerCalculator(
  position: [number, number, number],
  refPosition: [number, number, number]
): AERResult {
  return useMemo(() => {
    const [elevation, azimuth, slant] = getAer(
      position[0],
      position[1],
      position[2],
      refPosition[0],
      refPosition[1],
      refPosition[2]
    );

    return {
      elevationDeg: rad2deg(elevation ?? 0),
      azimuthDeg: rad2deg(azimuth ?? 0),
      slant: slant ?? 0,
    };
  }, [position[0], position[1], position[2], refPosition[0], refPosition[1], refPosition[2]]);
}

export function useENUCalculator(
  position: [number, number, number],
  refPosition: [number, number, number]
): ENUResult {
  return useMemo(() => {
    const [deltaE, deltaN, deltaU] = getEnuDifference(
      position[0],
      position[1],
      position[2],
      refPosition[0],
      refPosition[1],
      refPosition[2]
    );

    return { deltaE, deltaN, deltaU };
  }, [position[0], position[1], position[2], refPosition[0], refPosition[1], refPosition[2]]);
}

export function useDistanceCalculator(
  position: [number, number, number],
  refPosition: [number, number, number]
): DistanceResult {
  return useMemo(() => {
    const [lat1, lon1, h1] = car2geo(refPosition[0], refPosition[1], refPosition[2]);
    const [lat2, lon2, h2] = car2geo(position[0], position[1], position[2]);

    const { distance: orthodromic, initialBearing, finalBearing } = vincenty(lat1, lon1, lat2, lon2);
    const { distance: loxodromic, bearing: rhumbBearing } = rhumbLine(lat1, lon1, lat2, lon2);
    const euclidean = euclidean3D(
      refPosition[0], refPosition[1], refPosition[2],
      position[0], position[1], position[2]
    );

    const [midLat, midLon] = greatCircleMidpoint(lat1, lon1, lat2, lon2);

    return {
      orthodromic,
      loxodromic,
      euclidean,
      initialBearing: rad2deg(initialBearing),
      finalBearing: rad2deg(finalBearing),
      rhumbBearing: rad2deg(rhumbBearing),
      midpoint: [rad2deg(midLat), rad2deg(midLon)] as [number, number],
      horizonA: horizonDistance(h1),
      horizonB: horizonDistance(h2),
    };
  }, [position[0], position[1], position[2], refPosition[0], refPosition[1], refPosition[2]]);
}

export function useCoordinateFormats(
  position: [number, number, number]
): CoordinateFormats {
  return useMemo(() => {
    const [lat, lon] = car2geo(position[0], position[1], position[2]);

    return {
      utm: geo2utm(lat, lon),
      maidenhead: geo2maidenhead(lat, lon),
      geohash: geo2geohash(lat, lon),
    };
  }, [position[0], position[1], position[2]]);
}
