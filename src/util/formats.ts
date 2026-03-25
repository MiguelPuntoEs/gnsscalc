import type { Coordinate } from '@/types/position';

export function formatLatitudeDegMinSecs({
  degrees,
  minutes,
  seconds,
  direction,
}: Coordinate): string {
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

export function createNumberHandler<T>(
  handler: (value: number) => T,
): (value: string) => T | undefined {
  return (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return undefined;
    return handler(parsed);
  };
}
