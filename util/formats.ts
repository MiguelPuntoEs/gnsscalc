import { Coordinate } from '@/types/position';

export function formatLatitudeDegMinSecs({
  degrees,
  minutes,
  seconds,
  direction,
}: Coordinate): string {
  // TODO
  return `${degrees.toString().padStart(2, '0')}º ${minutes
    .toString()
    .padStart(2, '0')}' ${seconds.toFixed(3).padStart(6, '0')}" ${direction}`;
}

export function formatLongitudeDegMinSecs({
  degrees,
  minutes,
  seconds,
  direction,
}: Coordinate): string {
  return `${degrees.toString().padStart(3, '0')}º ${minutes
    .toString()
    .padStart(2, '0')}' ${seconds.toFixed(3).padStart(6, '0')}" ${direction}`;
}
