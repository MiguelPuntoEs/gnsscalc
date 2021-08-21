import moment from 'moment';
import { useMemo } from 'react';
import {
  ALPHABET,
  MILLISECONDS_IN_DAY,
  MILLISECONDS_IN_SECOND,
  SECONDS_TT_TAI,
  START_JULIAN_CALENDAR_UNIX_SECONDS,
  START_LEAP_SECS_GPS,
  START_MJD_UNIX_SECONDS,
} from '../constants/time';
import {
  getBdsTime,
  getGalTime,
  getGloN4,
  getGloNA,
  getGpsTime,
  getLeapSeconds,
  getTimeOfDay,
  getTimeOfWeek,
  getUnixTime,
  getWeekNumber,
} from '../util/dates';

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
      hourCode: ALPHABET[date.getUTCHours()],
      julianDate: (
        date.getTime() / MILLISECONDS_IN_DAY +
        START_JULIAN_CALENDAR_UNIX_SECONDS
      ).toFixed(6),
      mjd: date.getTime() / MILLISECONDS_IN_DAY + START_MJD_UNIX_SECONDS,
      mjd2000: (
        date.getTime() / MILLISECONDS_IN_DAY +
        START_MJD_UNIX_SECONDS -
        51544
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
