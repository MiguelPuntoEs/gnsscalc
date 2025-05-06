import { TimeDifference } from 'gnss-js';
import {
  MILLISECONDS_IN_DAY,
  MILLISECONDS_IN_HOUR,
  MILLISECONDS_IN_MINUTE,
  MILLISECONDS_IN_SECOND,
} from '../constants/time';

export default function useTimeDifferenceCalculator(
  timeDifference: number
): TimeDifference {
  const timeDifferenceSign = Math.sign(timeDifference);
  const timeDifferenceAbsolute = Math.abs(timeDifference);

  const seconds =
    (timeDifferenceSign * (timeDifferenceAbsolute % MILLISECONDS_IN_MINUTE)) /
    MILLISECONDS_IN_SECOND;

  const minutes =
    timeDifferenceSign *
    Math.floor(
      (timeDifferenceAbsolute % MILLISECONDS_IN_HOUR) / MILLISECONDS_IN_MINUTE
    );
  const hours =
    timeDifferenceSign *
    Math.floor(
      (timeDifferenceAbsolute % MILLISECONDS_IN_DAY) / MILLISECONDS_IN_HOUR
    );
  const days =
    timeDifferenceSign *
    Math.floor(timeDifferenceAbsolute / MILLISECONDS_IN_DAY);

  return {
    seconds,
    minutes,
    hours,
    days,
  };
}
