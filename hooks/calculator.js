import {
  ALPHABET,
  MILLISECONDS_IN_DAY,
  MILLISECONDS_IN_HOUR,
  MILLISECONDS_IN_MINUTE,
  MILLISECONDS_IN_SECOND,
  MILLISECONDS_IN_WEEK,
  SECONDS_IN_DAY,
  SECONDS_IN_HOUR,
  SECONDS_IN_MINUTE,
  SECONDS_TT_TAI,
  START_BDS_TIME,
  START_GAL_TIME,
  START_GLO_LEAP,
  START_GPS_TIME,
  START_JULIAN_CALENDAR_UNIX_SECONDS,
  START_LEAP_SECS_GPS,
  START_MJD_UNIX_SECONDS,
  START_UNIX_TIME,
} from "../constants/time";
import moment from "moment";
import { isValidDate } from "../util/dates";
import { useMemo } from "react";

function computeDayOfYear(date) {
  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  const N1 = Math.floor((275 * month) / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);

  return N1 - N2 * N3 + day - 30;
}

function getWeekNumber(date) {
  return Math.floor(getGpsTime(date) / MILLISECONDS_IN_WEEK);
}

function getTimeOfWeek(date) {
  return Math.floor(
    (getGpsTime(date) % MILLISECONDS_IN_WEEK) / MILLISECONDS_IN_SECOND
  );
}

function getGpsTime(date) {
  var time_ms = date.getTime() - START_GPS_TIME.getTime();
  return time_ms;
}

function getGalTime(date) {
  var leaps_gps =
    (getLeapSeconds(date) - START_LEAP_SECS_GPS) * MILLISECONDS_IN_SECOND;
  var time_ms = date.getTime() - START_GAL_TIME.getTime();
  return time_ms;
}

function getBdsTime(date) {
  var leaps_gps =
    (getLeapSeconds(date) - START_LEAP_SECS_GPS) * MILLISECONDS_IN_SECOND;
  var time_ms = date.getTime() - START_BDS_TIME.getTime();
  return time_ms;
}

export function getDateFromGpsData(weekNumber, timeOfWeek) {
  const weekNumberParsed = Number.parseInt(weekNumber);
  const timeOfWeekParsed = Number.parseInt(timeOfWeek);

  console.log(weekNumber, weekNumberParsed, typeof weekNumber);

  if (isNaN(weekNumberParsed) || isNaN(timeOfWeekParsed)) return undefined;

  const date = new Date(
    weekNumberParsed * MILLISECONDS_IN_WEEK +
      timeOfWeekParsed * MILLISECONDS_IN_SECOND +
      START_GPS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGpsTime(gpsTime) {
  const gpsTimeParsed = Number.parseInt(gpsTime);

  if (isNaN(gpsTimeParsed)) return undefined;

  const date = new Date(
    gpsTimeParsed * MILLISECONDS_IN_SECOND + START_GPS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGalTime(galTime) {
  const galTimeParsed = Number.parseInt(galTime);

  if (isNaN(galTimeParsed)) return undefined;

  const date = new Date(
    galTimeParsed * MILLISECONDS_IN_SECOND + START_GAL_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromBdsTime(bdsTime) {
  const bdsTimeParsed = Number.parseInt(bdsTime);

  if (isNaN(bdsTimeParsed)) return undefined;

  const date = new Date(
    bdsTimeParsed * MILLISECONDS_IN_SECOND + START_BDS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromUnixTime(unixTime) {
  const unixTimeParsed = Number.parseInt(unixTime);

  if (isNaN(unixTimeParsed)) return undefined;

  const date = new Date(
    unixTimeParsed * MILLISECONDS_IN_SECOND + START_UNIX_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGloN(n4, na, tod) {
  const n4Parsed = Number.parseInt(n4);
  const naParsed = Number.parseInt(na);
  const todParsed = Number.parseInt(tod);

  if (isNaN(n4Parsed) || isNaN(naParsed) || isNaN(todParsed)) return undefined;

  const date = moment
    .utc(START_GLO_LEAP)
    .add(n4Parsed * 4, "year")
    .add(naParsed - 1, "day")
    .add(todParsed, "second")
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromDayOfYear(dayOfYear, dateUTC, timeUTC) {
  const dayOfYearParsed = Number.parseInt(dayOfYear);

  if (isNaN(dayOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, "YYYY-MM-DD HH:mm:ss")
    .dayOfYear(dayOfYear)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromWeekOfYear(weekOfYear, dateUTC, timeUTC) {
  const weekOfYearParsed = Number.parseInt(weekOfYear);

  if (isNaN(weekOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, "YYYY-MM-DD HH:mm:ss")
    .weeks(weekOfYearParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromTimeOfDay(timeOfDay, dateUTC) {
  const timeOfDayParsed = Number.parseInt(timeOfDay);

  if (isNaN(timeOfDayParsed)) return undefined;

  const date = moment
    .utc(dateUTC, "YYYY-MM-DD")
    .add(timeOfDayParsed, "s")
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromDayOfWeek(dayOfWeek, dateUTC, timeUTC) {
  const dayOfWeekParsed = Number.parseInt(dayOfWeek);

  if (isNaN(dayOfWeekParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, "YYYY-MM-DD HH:mm:ss")
    .day(dayOfWeekParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromHourCode(hourCode, dateUTC, timeUTC) {
  const hour = ALPHABET.indexOf(hourCode);
  if (hour != -1) {
    return moment
      .utc(`${dateUTC} ${timeUTC}`, "YYYY-MM-DD HH:mm:ss")
      .hours(hour)
      .toDate();
  } else {
    return undefined;
  }
}

export function getDateFromJulianDate(julianDate) {
  const julianDateParsed = Number.parseFloat(julianDate);

  if (isNaN(julianDateParsed)) return undefined;

  const date = new Date(
    (julianDateParsed - START_JULIAN_CALENDAR_UNIX_SECONDS) *
      MILLISECONDS_IN_DAY
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromMJD(mjd) {
  // if ([".", ","].includes(mjd[mjd.length - 1])) return undefined;

  const mjdParsed = Number.parseFloat(mjd);

  if (isNaN(mjdParsed)) return undefined;

  const date = new Date(
    (mjdParsed - START_MJD_UNIX_SECONDS) * MILLISECONDS_IN_DAY
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromMJD2000(mjd2000) {
  const mjd2000Parsed = Number.parseFloat(mjd2000);

  if (isNaN(mjd2000Parsed)) return undefined;

  const date = new Date(
    (mjd2000Parsed - START_MJD_UNIX_SECONDS + 51544) * MILLISECONDS_IN_DAY
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromUTC(dateUTC, timeUTC) {
  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, "YYYY-MM-DD HH:mm:ss")
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromRINEX(rinex) {
  const date = moment.utc(rinex, "YYYY MM DD HH mm ss.SSSSSSS").toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

function getTimeOfDay(date) {
  const dateInitialDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0
    )
  );
  return Math.floor(
    (date.getTime() - dateInitialDay.getTime()) / MILLISECONDS_IN_SECOND
  );
}

function getGloN4(date) {
  return Math.floor((date.getUTCFullYear() - START_GLO_LEAP.getFullYear()) / 4);
}

function getGloNA(date) {
  const n4 = getGloN4(date);

  const init4YearPeriod = moment(START_GLO_LEAP)
    .add(n4 * 4, "year")
    .utc();

  return Math.floor(
    moment.duration(moment(date).diff(init4YearPeriod)).asDays() + 1
  );
}

export default function useCalculator(date) {
  const result = useMemo(
    () => ({
      weekNumber: getWeekNumber(date),
      timeOfWeek: Math.floor(getTimeOfWeek(date)),
      dateUTC: moment(date).utc().format("YYYY-MM-DD"),
      timeUTC: moment(date).utc().format("HH:mm:ss"),
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
      leapSec:
        getLeapSeconds(date) +
        " [TAI], " +
        (getLeapSeconds(date) - START_LEAP_SECS_GPS) +
        " [GPS]",
      gpsTime: Math.floor(getGpsTime(date) / MILLISECONDS_IN_SECOND),
      galTime: Math.floor(getGalTime(date) / MILLISECONDS_IN_SECOND),
      bdsTime: Math.floor(getBdsTime(date) / MILLISECONDS_IN_SECOND),
      unixTime: Math.floor(date.getTime() / MILLISECONDS_IN_SECOND),
      gloN4: getGloN4(date),
      gloNa: getGloNA(date),
      dateTai: moment(date)
        .add(getLeapSeconds(date), "seconds")
        .utc()
        .format("YYYY-MM-DD"),
      timeTai: moment(date)
        .add(getLeapSeconds(date), "seconds")
        .utc()
        .format("HH:mm:ss"),
      dateTT: moment(date)
        .add(getLeapSeconds(date) + SECONDS_TT_TAI, "seconds")
        .utc()
        .format("YYYY-MM-DD"),
      timeTT: moment(date)
        .add(getLeapSeconds(date) + SECONDS_TT_TAI, "seconds")
        .utc()
        .format("HH:mm:ss.SSS"),
      rinex: moment(date).utc().format("> YYYY MM DD HH mm ss.SSSSSSS"),
    }),
    [date]
  );

  return result;
}

function getLeapSecondsFromTAI(date) {
  leaps_tai = getLeapSeconds(date);
  date_utc = moment(date).subtract(leaps_tai, "seconds").utc().toDate();
  leaps_utc = getLeapSeconds(date_utc);
  date_tai_ = moment(date).add(leaps_utc, "seconds").utc().toDate();

  if (date_tai_ == date) {
    return leaps_tai;
  } else if (date_tai_ < date) {
    return leaps_tai - 1;
  }
}

function getLeapSeconds(date) {
  if (date >= Date.UTC(1900, 0, 1) + 3692217600000) {
    return 37;
  } else if (date >= Date.UTC(1900, 0, 1) + 3644697600000) {
    return 36;
  } else if (date >= Date.UTC(1900, 0, 1) + 3550089600000) {
    return 35;
  } else if (date >= Date.UTC(1900, 0, 1) + 3439756800000) {
    return 34;
  } else if (date >= Date.UTC(1900, 0, 1) + 3345062400000) {
    return 33;
  } else if (date >= Date.UTC(1900, 0, 1) + 3124137600000) {
    return 32;
  } else if (date >= Date.UTC(1900, 0, 1) + 3076704000000) {
    return 31;
  } else if (date >= Date.UTC(1900, 0, 1) + 3029443200000) {
    return 30;
  } else if (date >= Date.UTC(1900, 0, 1) + 2982009600000) {
    return 29;
  } else if (date >= Date.UTC(1900, 0, 1) + 2950473600000) {
    return 28;
  } else if (date >= Date.UTC(1900, 0, 1) + 2918937600000) {
    return 27;
  } else if (date >= Date.UTC(1900, 0, 1) + 2871676800000) {
    return 26;
  } else if (date >= Date.UTC(1900, 0, 1) + 2840140800000) {
    return 25;
  } else if (date >= Date.UTC(1900, 0, 1) + 2776982400000) {
    return 24;
  } else if (date >= Date.UTC(1900, 0, 1) + 2698012800000) {
    return 23;
  } else if (date >= Date.UTC(1900, 0, 1) + 2634854400000) {
    return 22;
  } else if (date >= Date.UTC(1900, 0, 1) + 2603318400000) {
    return 21;
  } else if (date >= Date.UTC(1900, 0, 1) + 2571782400000) {
    return 20;
  } else if (date >= Date.UTC(1900, 0, 1) + 2524521600000) {
    return 19;
  } else if (date >= Date.UTC(1900, 0, 1) + 2492985600000) {
    return 18;
  } else if (date >= Date.UTC(1900, 0, 1) + 2461449600000) {
    return 17;
  } else if (date >= Date.UTC(1900, 0, 1) + 2429913600000) {
    return 16;
  } else if (date >= Date.UTC(1900, 0, 1) + 2398291200000) {
    return 15;
  } else if (date >= Date.UTC(1900, 0, 1) + 2366755200000) {
    return 14;
  } else if (date >= Date.UTC(1900, 0, 1) + 2335219200000) {
    return 13;
  } else if (date >= Date.UTC(1900, 0, 1) + 2303683200000) {
    return 12;
  } else if (date >= Date.UTC(1900, 0, 1) + 2287785600000) {
    return 11;
  } else if (date >= Date.UTC(1900, 0, 1) + 2272060800000) {
    return 10;
  } else {
    return 0;
  }
}

export function getTimeDifference(startDate, finalDate) {
  if (!isValidDate(startDate) || !isValidDate(finalDate)) return undefined;

  return Math.floor(finalDate.getTime() - startDate.getTime());
}

export function getSecondsFromTimeDifference(timeDifference) {
  if (isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_MINUTE) / MILLISECONDS_IN_SECOND
  );
}
export function getMinutesFromTimeDifference(timeDifference) {
  if (isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_HOUR) / MILLISECONDS_IN_MINUTE
  );
}
export function getHoursFromTimeDifference(timeDifference) {
  if (isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_DAY) / MILLISECONDS_IN_HOUR
  );
}
export function getTotalDaysFromTimeDifference(timeDifference) {
  if (isNaN(timeDifference)) return undefined;
  return Math.floor(timeDifference / MILLISECONDS_IN_DAY);
}

export function getTimeDifferenceObject(timeDifference) {
  if (isNaN(timeDifference)) return undefined;
  return {
    seconds: getSecondsFromTimeDifference(timeDifference),
    minutes: getMinutesFromTimeDifference(timeDifference),
    hours: getHoursFromTimeDifference(timeDifference),
    days: getTotalDaysFromTimeDifference(timeDifference),
  };
}

export function getTimeDifferenceFromObject(timeDifferenceObject) {
  const { seconds, minutes, hours, days } = timeDifferenceObject;

  const secondsParsed = Number.parseInt(seconds);
  const minutesParsed = Number.parseInt(minutes);
  const hoursParsed = Number.parseInt(hours);
  const daysParsed = Number.parseInt(days);

  if (
    isNaN(secondsParsed) ||
    isNaN(minutesParsed) ||
    isNaN(hoursParsed) ||
    isNaN(daysParsed)
  )
    return undefined;

  return (
    getTimeDifferenceFromSeconds(secondsParsed) +
    getTimeDifferenceFromMinutes(minutesParsed) +
    getTimeDifferenceFromHours(hoursParsed) +
    getTimeDifferenceFromDays(daysParsed)
  );
}

export function getTimeDifferenceFromSeconds(seconds) {
  if (isNaN(seconds)) return undefined;
  return seconds * MILLISECONDS_IN_SECOND;
}
export function getTimeDifferenceFromMinutes(minutes) {
  if (isNaN(minutes)) return undefined;
  return minutes * MILLISECONDS_IN_MINUTE;
}
export function getTimeDifferenceFromHours(hours) {
  if (isNaN(hours)) return undefined;
  return hours * MILLISECONDS_IN_HOUR;
}
export function getTimeDifferenceFromDays(days) {
  if (isNaN(days)) return undefined;
  return days * MILLISECONDS_IN_DAY;
}
