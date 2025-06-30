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

/**
 * Create a validated onCompute handler for integer inputs
 * @param handler - Function that takes the parsed number and returns the computation result
 * @returns onCompute handler that validates input and calls the handler
 */
export function createIntegerHandler<T>(
  handler: (value: number) => T
): (value: string) => T | undefined {
  return (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return undefined;
    return handler(parsed);
  };
}

/**
 * Create a validated onCompute handler for float inputs
 * @param handler - Function that takes the parsed number and returns the computation result
 * @returns onCompute handler that validates input and calls the handler
 */
export function createFloatHandler<T>(
  handler: (value: number) => T
): (value: string) => T | undefined {
  return (value: string) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return undefined;
    return handler(parsed);
  };
}
