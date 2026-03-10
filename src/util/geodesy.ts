import {
  WGS84_SEMI_MAJOR_AXIS,
  WGS84_ECCENTRICITY_SQUARED,
} from '../constants/geoid';

// WGS84 semi-minor axis
const b = WGS84_SEMI_MAJOR_AXIS * Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED);
// WGS84 flattening
const f = 1 - b / WGS84_SEMI_MAJOR_AXIS;

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
  const U1 = Math.atan((1 - f) * Math.tan(lat1));
  const U2 = Math.atan((1 - f) * Math.tan(lat2));
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

    C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha));
    lambdaPrev = lambda;
    lambda =
      lon2 -
      lon1 +
      (1 - C) *
        f *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - lambdaPrev) > 1e-12 && ++iter < 200);

  const uSq =
    (cos2Alpha! * (WGS84_SEMI_MAJOR_AXIS ** 2 - b ** 2)) / b ** 2;
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

  const distance = b * A * (sigma! - deltaSigma);

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

  // Isometric latitude on the ellipsoid
  const isometricLat = (lat: number) => {
    const sinLat = Math.sin(lat);
    const e = Math.sqrt(WGS84_ECCENTRICITY_SQUARED);
    return Math.log(
      Math.tan(Math.PI / 4 + lat / 2) *
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

  const latMid = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + Bx) ** 2 + By ** 2)
  );
  const lonMid = lon1 + Math.atan2(By, Math.cos(lat1) + Bx);

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
