import { MINUTES_IN_DEGREE, SECONDS_IN_DEGREE } from '../constants/angles';
import { SECONDS_IN_MINUTE } from '../constants/time';

export function rad2deg(radians: number): number {
  return (radians * 180.0) / Math.PI;
}
export function deg2rad(degrees: number): number {
  return (degrees * Math.PI) / 180.0;
}
export function deg2hms(deg: number): [number, number, number] {

  let h: number = Math.floor(deg);
  let m: number = Math.floor(deg * MINUTES_IN_DEGREE) % MINUTES_IN_DEGREE;
  let s: number = (deg * SECONDS_IN_DEGREE) % SECONDS_IN_MINUTE;

  if (Number.parseFloat(s.toFixed(3)) === 60.0) {
    m += 1;
    s = 0;
  }

  if (m === 60) {
    h += 1;
    m = 0;
  }

  return [h, m, s];
}
