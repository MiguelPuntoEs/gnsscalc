import moment from 'moment';
import { useMemo } from 'react';

import {
  getBdsTime,
  getGalTime,
  getGloN4,
  getGloNA,
  getGpsTime,
  getJulianDate,
  getLeapSeconds,
  getMJD,
  getTimeOfDay,
  getTimeOfWeek,
  getUnixTime,
  getWeekNumber,
  getHourCode,
  MILLISECONDS_IN_SECOND,
  SECONDS_TT_TAI,
  START_LEAP_SECS_GPS,
} from 'gnss-js';

export default function useCalculator(date) {
  const result = useMemo(
    () => ({
      weekNumber: getWeekNumber(date),
      timeOfWeek: Math.floor(getTimeOfWeek(date)),
      dateUTC: moment(date).utc().format('YYYY-MM-DD'),
      timeUTC: moment(date).utc().format('HH:mm:ss'),
      dayOfYear: moment(date).utc().dayOfYear(),
      weekOfYear: moment(date).utc().weeks(),
      timeOfDay: getTimeOfDay(date),
      dayOfWeek: date.getUTCDay(),
      hourCode: getHourCode(date),
      julianDate: getJulianDate(date).toFixed(6),
      mjd: getMJD(date).toFixed(3),
      mjd2000: (
        getMJD(date) - 51544.0
      ).toFixed(3),
      leapSec: `${getLeapSeconds(date)} [TAI], ${
        getLeapSeconds(date) - START_LEAP_SECS_GPS
      } [GPS]`,
      gpsTime: Math.floor(getGpsTime(date) / MILLISECONDS_IN_SECOND),
      galTime: Math.floor(getGalTime(date) / MILLISECONDS_IN_SECOND),
      bdsTime: Math.floor(getBdsTime(date) / MILLISECONDS_IN_SECOND),
      unixTime: Math.floor(getUnixTime(date) / MILLISECONDS_IN_SECOND),
      gloN4: getGloN4(date),
      gloNa: getGloNA(date),
      dateTai: moment(date)
        .add(getLeapSeconds(date), 'seconds')
        .utc()
        .format('YYYY-MM-DD'),
      timeTai: moment(date)
        .add(getLeapSeconds(date), 'seconds')
        .utc()
        .format('HH:mm:ss'),
      dateTT: moment(date)
        .add(getLeapSeconds(date) + SECONDS_TT_TAI, 'seconds')
        .utc()
        .format('YYYY-MM-DD'),
      timeTT: moment(date)
        .add(getLeapSeconds(date) + SECONDS_TT_TAI, 'seconds')
        .utc()
        .format('HH:mm:ss.SSS'),
      rinex: moment(date).utc().format('> YYYY MM DD HH mm ss.SSSSSSS'),
    }),
    [date]
  );

  return result;
}
