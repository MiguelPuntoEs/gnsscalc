import { useMemo } from 'react';
import type {
  AERResult,
  CoordinateFormats,
  DistanceResult,
  ENUResult,
  PositionResult,
} from '@/types/position';
import {
  ecefToGeodetic,
  getAer,
  getEnuDifference,
  geodeticToUtm,
  geodeticToMaidenhead,
  geodeticToGeohash,
  vincenty,
  rhumbLine,
  euclidean3D,
  greatCircleMidpoint,
  horizonDistance,
  deg2dms,
  rad2deg,
} from 'gnss-js/coordinates';

export function usePositionCalculator(
  position: [number, number, number],
): PositionResult {
  const [px, py, pz] = position;
  return useMemo(() => {
    const [latitude, longitude, height] = ecefToGeodetic(px, py, pz);

    const latitudeDeg = rad2deg(latitude);
    const longitudeDeg = rad2deg(longitude);

    const [latitudeDegrees, latitudeMinutes, latitudeSeconds] = deg2dms(
      Math.abs(latitudeDeg),
    );
    const [longitudeDegrees, longitudeMinutes, longitudeSeconds] = deg2dms(
      Math.abs(longitudeDeg),
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
  }, [px, py, pz]);
}

export function useAerCalculator(
  position: [number, number, number],
  refPosition: [number, number, number],
): AERResult {
  const [px, py, pz] = position;
  const [rx, ry, rz] = refPosition;
  return useMemo(() => {
    const [elevation, azimuth, slant] = getAer(px, py, pz, rx, ry, rz);

    return {
      elevationDeg: rad2deg(elevation ?? 0),
      azimuthDeg: rad2deg(azimuth ?? 0),
      slant: slant ?? 0,
    };
  }, [px, py, pz, rx, ry, rz]);
}

export function useENUCalculator(
  position: [number, number, number],
  refPosition: [number, number, number],
): ENUResult {
  const [px, py, pz] = position;
  const [rx, ry, rz] = refPosition;
  return useMemo(() => {
    const [deltaE, deltaN, deltaU] = getEnuDifference(px, py, pz, rx, ry, rz);

    return { deltaE, deltaN, deltaU };
  }, [px, py, pz, rx, ry, rz]);
}

export function useDistanceCalculator(
  position: [number, number, number],
  refPosition: [number, number, number],
): DistanceResult {
  const [px, py, pz] = position;
  const [rx, ry, rz] = refPosition;
  return useMemo(() => {
    const [lat1, lon1, h1] = ecefToGeodetic(rx, ry, rz);
    const [lat2, lon2, h2] = ecefToGeodetic(px, py, pz);

    const {
      distance: orthodromic,
      initialBearing,
      finalBearing,
    } = vincenty(lat1, lon1, lat2, lon2);
    const { distance: loxodromic, bearing: rhumbBearing } = rhumbLine(
      lat1,
      lon1,
      lat2,
      lon2,
    );
    const euclidean = euclidean3D(rx, ry, rz, px, py, pz);

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
  }, [px, py, pz, rx, ry, rz]);
}

export function useCoordinateFormats(
  position: [number, number, number],
): CoordinateFormats {
  const [px, py, pz] = position;
  return useMemo(() => {
    const [lat, lon] = ecefToGeodetic(px, py, pz);

    return {
      utm: geodeticToUtm(lat, lon),
      maidenhead: geodeticToMaidenhead(lat, lon),
      geohash: geodeticToGeohash(lat, lon),
    };
  }, [px, py, pz]);
}
