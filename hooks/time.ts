import { useMemo } from 'react';

import {
  getBdsTime,
  getGalTime,
  getGloN4,
  getGloNA,
  getGpsTime,
  getJulianDate,
  getLeap,
  getGpsLeap,
  getMJD,
  getTimeOfDay,
  getTimeOfWeek,
  getUnixTime,
  getWeekNumber,
  getHourCode,
  MILLISECONDS_IN_SECOND,
  getMJD2000,
  getTaiDate,
  getTtDate,
  getRINEX,
  getDayOfWeek,
  getWeekOfYear,
  getDayOfYear,
  getUtcDate,
} from 'gnss-js';
import { TimeResult } from '@/types/time';

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
      julianDate: getJulianDate(date).toFixed(6),
      mjd: getMJD(date).toFixed(3),
      mjd2000: getMJD2000(date).toFixed(3),
      leapSec: `${getLeap(date)} [TAI], ${getGpsLeap(date)} [GPS]`,
      gpsTime: getGpsTime(date) / MILLISECONDS_IN_SECOND,
      galTime: getGalTime(date) / MILLISECONDS_IN_SECOND,
      bdsTime: getBdsTime(date) / MILLISECONDS_IN_SECOND,
      unixTime: getUnixTime(date) / MILLISECONDS_IN_SECOND,
      gloN4: getGloN4(date),
      gloNa: getGloNA(date),
      dateTai: getTaiDate(date).toISOString().split('T')[0],
      timeTai: getTaiDate(date).toISOString().split('T')[1],
      dateTT: getTtDate(date).toISOString().split('T')[0],
      timeTT: getTtDate(date).toISOString().split('T')[1],
      dateUtc: getUtcDate(date).toISOString().split('T')[0],
      timeUtc: getUtcDate(date).toISOString().split('T')[1],
      dateGps: date.toISOString().split('T')[0],
      timeGps: date.toISOString().split('T')[1],
      rinex: getRINEX(date),
    }),
    [date]
  );

  return result;
}
