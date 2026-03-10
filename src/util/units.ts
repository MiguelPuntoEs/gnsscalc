export function rad2deg(radians: number): number {
  return (radians * 180.0) / Math.PI;
}

export function deg2rad(degrees: number): number {
  return (degrees * Math.PI) / 180.0;
}

export function deg2hms(deg: number): [number, number, number] {
  let h = Math.floor(deg);
  let m = Math.floor(deg * 60) % 60;
  let s = (deg * 3600) % 60;

  if (s >= 59.9995) {
    m += 1;
    s = 0;
  }

  if (m === 60) {
    h += 1;
    m = 0;
  }

  return [h, m, s];
}
