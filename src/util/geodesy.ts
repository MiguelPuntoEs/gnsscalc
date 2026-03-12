import {
  WGS84_SEMI_MAJOR_AXIS,
  WGS84_ECCENTRICITY_SQUARED,
  WGS84_SEMI_MINOR_AXIS,
  WGS84_FLATTENING,
} from '../constants/geoid';

/**
 * Vincenty's inverse formula — orthodromic (great-circle) distance,
 * initial bearing, and final bearing on the WGS84 ellipsoid.
 * Returns { distance (m), initialBearing (rad), finalBearing (rad) }.
 */
export function vincenty(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { distance: number; initialBearing: number; finalBearing: number } {
  const U1 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(lat1));
  const U2 = Math.atan((1 - WGS84_FLATTENING) * Math.tan(lat2));
  const sinU1 = Math.sin(U1),
    cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2),
    cosU2 = Math.cos(U2);

  let lambda = lon2 - lon1;
  let lambdaPrev: number;
  let sinSigma: number,
    cosSigma: number,
    sigma: number;
  let sinAlpha: number,
    cos2Alpha: number,
    cos2SigmaM: number;
  let C: number;

  let iter = 0;
  do {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2
    );

    if (sinSigma === 0) {
      return { distance: 0, initialBearing: 0, finalBearing: 0 };
    }

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);

    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha ** 2;

    cos2SigmaM =
      cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;

    C = (WGS84_FLATTENING / 16) * cos2Alpha * (4 + WGS84_FLATTENING * (4 - 3 * cos2Alpha));
    lambdaPrev = lambda;
    lambda =
      lon2 -
      lon1 +
      (1 - C) *
        WGS84_FLATTENING *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && ++iter < 200);

  if (iter >= 200) {
    // Antipodal or near-antipodal: Vincenty fails to converge.
    // Fall back to spherical great-circle approximation.
    const cosLat1 = Math.cos(lat1), sinLat1 = Math.sin(lat1);
    const cosLat2 = Math.cos(lat2), sinLat2 = Math.sin(lat2);
    const dLon = lon2 - lon1;
    sigma = Math.acos(
      Math.min(1, Math.max(-1, sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon)))
    );
    // Use mean radius for distance when Vincenty won't converge
    const distance = WGS84_SEMI_MAJOR_AXIS * sigma;
    const ib = Math.atan2(
      cosLat2 * Math.sin(dLon),
      cosLat1 * sinLat2 - sinLat1 * cosLat2 * Math.cos(dLon)
    );
    const fb = Math.atan2(
      cosLat1 * Math.sin(-dLon),
      -sinLat1 * cosLat2 + cosLat1 * sinLat2 * Math.cos(-dLon)
    );
    return { distance, initialBearing: ib, finalBearing: fb };
  }

  const uSq =
    (cos2Alpha! * (WGS84_SEMI_MAJOR_AXIS ** 2 - WGS84_SEMI_MINOR_AXIS ** 2)) / WGS84_SEMI_MINOR_AXIS ** 2;
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma! *
    (cos2SigmaM! +
      (B / 4) *
        (cosSigma! * (-1 + 2 * cos2SigmaM! ** 2) -
          (B / 6) *
            cos2SigmaM! *
            (-3 + 4 * sinSigma! ** 2) *
            (-3 + 4 * cos2SigmaM! ** 2)));

  const distance = WGS84_SEMI_MINOR_AXIS * A * (sigma! - deltaSigma);

  // Bearings
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);

  const initialBearing = Math.atan2(
    cosU2 * sinLambda,
    cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
  );
  const finalBearing = Math.atan2(
    cosU1 * sinLambda,
    -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda
  );

  return { distance, initialBearing, finalBearing };
}

/**
 * Loxodromic (rhumb line) distance and constant bearing on the WGS84 ellipsoid.
 * Uses the ellipsoidal rhumb-line formula with isometric latitudes.
 */
export function rhumbLine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { distance: number; bearing: number } {
  const dLat = lat2 - lat1;
  let dLon = lon2 - lon1;

  // Isometric latitude on the ellipsoid (clamped to avoid log(0)/log(∞) at poles)
  const MAX_LAT = Math.PI / 2 - 1e-10;
  const isometricLat = (lat: number) => {
    const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    const sinLat = Math.sin(clampedLat);
    const e = Math.sqrt(WGS84_ECCENTRICITY_SQUARED);
    return Math.log(
      Math.tan(Math.PI / 4 + clampedLat / 2) *
        ((1 - e * sinLat) / (1 + e * sinLat)) ** (e / 2)
    );
  };

  const psi1 = isometricLat(lat1);
  const psi2 = isometricLat(lat2);
  const dPsi = psi2 - psi1;

  // Stretch factor q — ratio of latitude change to isometric latitude change
  const q = Math.abs(dPsi) > 1e-12 ? dLat / dPsi : Math.cos(lat1);

  // Wrap longitude difference to [-PI, PI]
  if (Math.abs(dLon) > Math.PI) {
    dLon = dLon > 0 ? -(2 * Math.PI - dLon) : 2 * Math.PI + dLon;
  }

  const bearing = Math.atan2(dLon, dPsi);

  // Meridional arc length approximation on the ellipsoid
  const e2 = WGS84_ECCENTRICITY_SQUARED;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  // Radius of curvature in meridian, averaged
  const meridionalRadius =
    WGS84_SEMI_MAJOR_AXIS *
    (1 - e2) *
    (1 +
      (3 / 4) * e2 +
      (45 / 64) * e4 +
      (175 / 256) * e6);

  const distance = Math.sqrt(dLat ** 2 + q ** 2 * dLon ** 2) * meridionalRadius;

  return { distance, bearing };
}

/**
 * 3D Euclidean (straight-line, through-the-earth) distance between two ECEF positions.
 */
export function euclidean3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}

/**
 * Geodetic midpoint along the great-circle arc.
 * Returns [lat, lon] in radians.
 */
export function greatCircleMidpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): [number, number] {
  const dLon = lon2 - lon1;
  const Bx = Math.cos(lat2) * Math.cos(dLon);
  const By = Math.cos(lat2) * Math.sin(dLon);

  const sumX = Math.cos(lat1) + Bx;
  const denom = Math.sqrt(sumX ** 2 + By ** 2);

  // Near-antipodal: denominator approaches 0, midpoint is indeterminate.
  // Return average latitude with lon1 as a reasonable fallback.
  if (denom < 1e-15) {
    return [(lat1 + lat2) / 2, lon1];
  }

  const latMid = Math.atan2(Math.sin(lat1) + Math.sin(lat2), denom);
  const lonMid = lon1 + Math.atan2(By, sumX);

  return [latMid, lonMid];
}

/**
 * Geometric horizon distance from a given height above the ellipsoid.
 * Uses the simple geometric formula with refraction coefficient k = 0.13 (standard atmosphere).
 */
export function horizonDistance(heightMeters: number): number {
  if (heightMeters <= 0) return 0;
  const k = 0.13; // standard atmospheric refraction coefficient
  const R = WGS84_SEMI_MAJOR_AXIS;
  // Effective Earth radius accounting for refraction
  const Re = R / (1 - k);
  return Math.sqrt(2 * Re * heightMeters + heightMeters ** 2);
}
