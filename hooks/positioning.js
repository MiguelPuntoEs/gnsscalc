const WGS84_SEMI_MAJOR_AXIS = 6378137;
const WGS84_ECCENTRICITY_SQUARED = 0.006694379990197;

export function geo2car(lat, lon, h) {
  const N =
    WGS84_SEMI_MAJOR_AXIS /
    Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * Math.pow(Math.sin(lat), 2));

  const x = (N + h) * Math.cos(lat) * Math.cos(lon);
  const y = (N + h) * Math.cos(lat) * Math.sin(lon);
  const z = ((1 - WGS84_ECCENTRICITY_SQUARED) * N + h) * Math.sin(lat);

  return [x, y, z];
}

export function car2geo(x, y, z) {
  const MAX_ITER = 30;
  const MAX_DELTA_ITER = 1e-15;
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
  let lati = Math.atan(z / p / (1 - WGS84_ECCENTRICITY_SQUARED));
  let iter = 0;

  let lati_, Ni, hi;

  while (True) {
    lati_ = lati;
    Ni =
      WGS84_SEMI_MAJOR_AXIS /
      Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * Math.pow(Math.sin(lati_), 2));
    hi = p / Math.cos(lati_) - Ni;
    lati = Math.atan(
      z / p / (1 - (Ni / (Ni + hi)) * WGS84_ECCENTRICITY_SQUARED)
    );
    if (Math.abs(lati - lati_) < MAX_DELTA_ITER) {
      break;
    }
    iter += 1;
    if (iter > MAX_ITER) {
      break;
    }
  }

  return [lati, lon, hi];
}

export function getEnuDifference(x, y, z, xRef, yRef, zRef) {
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
  const slant = Math.sqrt(
    Math.pow(x - xRef, 2) + Math.pow(y - yRef, 2) + Math.pow(z - zRef, 2)
  );

  const [deltaE, deltaN, deltaU] = getEnuDifference(x, y, z, xRef, yRef, zRef);

  const elevation = Math.asin(deltaU / slant);
  const azimuth = Math.atan2(deltaE, deltaN);

  return [elevation, azimuth, slant];
}
