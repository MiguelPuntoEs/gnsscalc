import { useMemo } from 'react';

import { SCALE } from '@/constants/time';
import { TimeResult } from '@/types/time';
import {
  getBdsTime,
  getDayOfWeek,
  getDayOfYear,
  getGalTime,
  getGloN4,
  getGloNA,
  getGpsLeap,
  getGpsTime,
  getHourCode,
  getJulianDate,
  getLeap,
  getMJD,
  getMJD2000,
  getRINEX,
  getTaiDate,
  getTimeOfDay,
  getTimeOfWeek,
  getTtDate,
  getUnixTime,
  getUtcDate,
  getWeekNumber,
  getWeekOfYear,
  MILLISECONDS_IN_SECOND
} from 'gnss-js';

export default function useCalculator(date: Date): TimeResult {
  const result = useMemo(
    () => ({
      weekNumber: getWeekNumber(date),
      timeOfWeek: getTimeOfWeek(date),
      dayOfYear: getDayOfYear(date),
      weekOfYear: getWeekOfYear(date),
      timeOfDay: getTimeOfDay(date),
      dayOfWeek: getDayOfWeek(date),
      hourCode: getHourCode(date),
      julianDate: getJulianDate(date, SCALE).toFixed(6),
      mjd: getMJD(date, SCALE).toFixed(6),
      mjd2000: getMJD2000(date, SCALE).toFixed(6),
      leapSec: `${getLeap(date)} [TAI], ${getGpsLeap(date)} [GPS]`,
      gpsTime: getGpsTime(date) / MILLISECONDS_IN_SECOND,
      galTime: getGalTime(date) / MILLISECONDS_IN_SECOND,
      bdsTime: getBdsTime(date) / MILLISECONDS_IN_SECOND,
      unixTime: getUnixTime(date) / MILLISECONDS_IN_SECOND,
      gloN4: getGloN4(date),
      gloNa: getGloNA(date),
      dateTai: getTaiDate(date).toISOString().split('T')[0],
      timeTai: getTaiDate(date).toISOString().split('T')[1].slice(0, -1),
      dateTT: getTtDate(date).toISOString().split('T')[0],
      timeTT: getTtDate(date).toISOString().split('T')[1].slice(0, -1),
      dateUtc: getUtcDate(date).toISOString().split('T')[0],
      timeUtc: getUtcDate(date).toISOString().split('T')[1].slice(0, -1),
      dateGps: date.toISOString().split('T')[0],
      timeGps: date.toISOString().split('T')[1].slice(0, -1),
      rinex: getRINEX(date),
    }),
    [date]
  );

  return result;
}
