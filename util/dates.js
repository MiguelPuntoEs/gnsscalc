import moment from 'moment';

import {
  ALPHABET,
  MILLISECONDS_IN_DAY,
  MILLISECONDS_IN_HOUR,
  MILLISECONDS_IN_MINUTE,
  MILLISECONDS_IN_SECOND,
  MILLISECONDS_IN_WEEK,
  START_BDS_TIME,
  START_GAL_TIME,
  START_GLO_LEAP,
  START_GPS_TIME,
  START_JULIAN_CALENDAR_UNIX_SECONDS,
  START_MJD_UNIX_SECONDS,
  START_UNIX_TIME,
} from '../constants/time';

export default function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d);
}

export function getLeapSeconds(date) {
  if (date >= Date.UTC(1900, 0, 1) + 3692217600000) {
    return 37;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3644697600000) {
    return 36;
  }

  if (date >= Date.UTC(1900, 0, 1) + 3550089600000) {
    return 35;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3439756800000) {
    return 34;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3345062400000) {
    return 33;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3124137600000) {
    return 32;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3076704000000) {
    return 31;
  }
  if (date >= Date.UTC(1900, 0, 1) + 3029443200000) {
    return 30;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2982009600000) {
    return 29;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2950473600000) {
    return 28;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2918937600000) {
    return 27;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2871676800000) {
    return 26;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2840140800000) {
    return 25;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2776982400000) {
    return 24;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2698012800000) {
    return 23;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2634854400000) {
    return 22;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2603318400000) {
    return 21;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2571782400000) {
    return 20;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2524521600000) {
    return 19;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2492985600000) {
    return 18;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2461449600000) {
    return 17;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2429913600000) {
    return 16;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2398291200000) {
    return 15;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2366755200000) {
    return 14;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2335219200000) {
    return 13;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2303683200000) {
    return 12;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2287785600000) {
    return 11;
  }
  if (date >= Date.UTC(1900, 0, 1) + 2272060800000) {
    return 10;
  }
  return 0;
}

export function getGpsTime(date) {
  return date.getTime() - START_GPS_TIME.getTime();
}

export function getGalTime(date) {
  return date.getTime() - START_GAL_TIME.getTime();
}

export function getBdsTime(date) {
  return date.getTime() - START_BDS_TIME.getTime();
}

export function getUnixTime(date) {
  return date.getTime() - START_UNIX_TIME.getTime();
}

export function getWeekNumber(date) {
  return Math.floor(getGpsTime(date) / MILLISECONDS_IN_WEEK);
}

export function getTimeOfWeek(date) {
  return Math.floor(
    (getGpsTime(date) % MILLISECONDS_IN_WEEK) / MILLISECONDS_IN_SECOND
  );
}

export function getTimeOfDay(date) {
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

export function getGloN4(date) {
  return Math.floor((date.getUTCFullYear() - START_GLO_LEAP.getFullYear()) / 4);
}

export function getGloNA(date) {
  const n4 = getGloN4(date);

  const init4YearPeriod = moment(START_GLO_LEAP)
    .add(n4 * 4, 'year')
    .utc();

  return Math.floor(
    moment.duration(moment(date).diff(init4YearPeriod)).asDays() + 1
  );
}

export function getDateFromGpsData(weekNumber, timeOfWeek) {
  const weekNumberParsed = Number.parseInt(weekNumber, 10);
  const timeOfWeekParsed = Number.parseInt(timeOfWeek, 10);

  if (Number.isNaN(weekNumberParsed) || Number.isNaN(timeOfWeekParsed))
    return undefined;

  const date = new Date(
    weekNumberParsed * MILLISECONDS_IN_WEEK +
      timeOfWeekParsed * MILLISECONDS_IN_SECOND +
      START_GPS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGpsTime(gpsTime) {
  const gpsTimeParsed = Number.parseInt(gpsTime, 10);

  if (Number.isNaN(gpsTimeParsed)) return undefined;

  const date = new Date(
    gpsTimeParsed * MILLISECONDS_IN_SECOND + START_GPS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGalTime(galTime) {
  const galTimeParsed = Number.parseInt(galTime, 10);

  if (Number.isNaN(galTimeParsed)) return undefined;

  const date = new Date(
    galTimeParsed * MILLISECONDS_IN_SECOND + START_GAL_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromBdsTime(bdsTime) {
  const bdsTimeParsed = Number.parseInt(bdsTime, 10);

  if (Number.isNaN(bdsTimeParsed)) return undefined;

  const date = new Date(
    bdsTimeParsed * MILLISECONDS_IN_SECOND + START_BDS_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromUnixTime(unixTime) {
  const unixTimeParsed = Number.parseInt(unixTime, 10);

  if (Number.isNaN(unixTimeParsed)) return undefined;

  const date = new Date(
    unixTimeParsed * MILLISECONDS_IN_SECOND + START_UNIX_TIME.getTime()
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromGloN(n4, na, tod) {
  const n4Parsed = Number.parseInt(n4, 10);
  const naParsed = Number.parseInt(na, 10);
  const todParsed = Number.parseInt(tod, 10);

  if (
    Number.isNaN(n4Parsed) ||
    Number.isNaN(naParsed) ||
    Number.isNaN(todParsed)
  )
    return undefined;

  const date = moment
    .utc(START_GLO_LEAP)
    .add(n4Parsed * 4, 'year')
    .add(naParsed - 1, 'day')
    .add(todParsed, 'second')
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromDayOfYear(dayOfYear, dateUTC, timeUTC) {
  const dayOfYearParsed = Number.parseInt(dayOfYear, 10);

  if (Number.isNaN(dayOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .dayOfYear(dayOfYear)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromWeekOfYear(weekOfYear, dateUTC, timeUTC) {
  const weekOfYearParsed = Number.parseInt(weekOfYear, 10);

  if (Number.isNaN(weekOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .weeks(weekOfYearParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromTimeOfDay(timeOfDay, dateUTC) {
  const timeOfDayParsed = Number.parseInt(timeOfDay, 10);

  if (Number.isNaN(timeOfDayParsed)) return undefined;

  const date = moment
    .utc(dateUTC, 'YYYY-MM-DD')
    .add(timeOfDayParsed, 's')
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromDayOfWeek(dayOfWeek, dateUTC, timeUTC) {
  const dayOfWeekParsed = Number.parseInt(dayOfWeek, 10);

  if (Number.isNaN(dayOfWeekParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .day(dayOfWeekParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromHourCode(hourCode, dateUTC, timeUTC) {
  const hour = ALPHABET.indexOf(hourCode);
  if (hour !== -1) {
    return moment
      .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
      .hours(hour)
      .toDate();
  }
  return undefined;
}

export function getDateFromJulianDate(julianDate) {
  const julianDateParsed = Number.parseFloat(julianDate);

  if (Number.isNaN(julianDateParsed)) return undefined;

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

  if (Number.isNaN(mjdParsed)) return undefined;

  const date = new Date(
    (mjdParsed - START_MJD_UNIX_SECONDS) * MILLISECONDS_IN_DAY
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromMJD2000(mjd2000) {
  const mjd2000Parsed = Number.parseFloat(mjd2000);

  if (Number.isNaN(mjd2000Parsed)) return undefined;

  const date = new Date(
    (mjd2000Parsed - START_MJD_UNIX_SECONDS + 51544) * MILLISECONDS_IN_DAY
  );

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromUTC(dateUTC, timeUTC) {
  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromRINEX(rinex) {
  const date = moment.utc(rinex, 'YYYY MM DD HH mm ss.SSSSSSS').toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getLeapSecondsFromTAI(date) {
  const leapsTAI = getLeapSeconds(date);
  const dateUTC = moment(date).subtract(leapsTAI, 'seconds').utc().toDate();
  const leapsUTC = getLeapSeconds(dateUTC);
  const dateTAI = moment(date).add(leapsUTC, 'seconds').utc().toDate();

  if (dateTAI.getTime() === date.getTime()) {
    return leapsTAI;
  }

  if (dateTAI.getTime() < date.getTime()) {
    return leapsTAI - 1;
  }

  return 0;
}

export function getTimeDifference(startDate, finalDate) {
  if (!isValidDate(startDate) || !isValidDate(finalDate)) return undefined;

  return Math.floor(finalDate.getTime() - startDate.getTime());
}

export function getSecondsFromTimeDifference(timeDifference) {
  if (Number.isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_MINUTE) / MILLISECONDS_IN_SECOND
  );
}
export function getMinutesFromTimeDifference(timeDifference) {
  if (Number.isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_HOUR) / MILLISECONDS_IN_MINUTE
  );
}
export function getHoursFromTimeDifference(timeDifference) {
  if (Number.isNaN(timeDifference)) return undefined;
  return Math.floor(
    (timeDifference % MILLISECONDS_IN_DAY) / MILLISECONDS_IN_HOUR
  );
}
export function getTotalDaysFromTimeDifference(timeDifference) {
  if (Number.isNaN(timeDifference)) return undefined;
  return Math.floor(timeDifference / MILLISECONDS_IN_DAY);
}

export function getTimeDifferenceFromSeconds(seconds) {
  if (Number.isNaN(seconds)) return undefined;
  return seconds * MILLISECONDS_IN_SECOND;
}
export function getTimeDifferenceFromMinutes(minutes) {
  if (Number.isNaN(minutes)) return undefined;
  return minutes * MILLISECONDS_IN_MINUTE;
}
export function getTimeDifferenceFromHours(hours) {
  if (Number.isNaN(hours)) return undefined;
  return hours * MILLISECONDS_IN_HOUR;
}
export function getTimeDifferenceFromDays(days) {
  if (Number.isNaN(days)) return undefined;
  return days * MILLISECONDS_IN_DAY;
}

export function getTimeDifferenceFromObject(timeDifferenceObject) {
  const { seconds, minutes, hours, days } = timeDifferenceObject;

  const secondsParsed = Number.parseInt(seconds, 10);
  const minutesParsed = Number.parseInt(minutes, 10);
  const hoursParsed = Number.parseInt(hours, 10);
  const daysParsed = Number.parseInt(days, 10);

  if (
    Number.isNaN(secondsParsed) ||
    Number.isNaN(minutesParsed) ||
    Number.isNaN(hoursParsed) ||
    Number.isNaN(daysParsed)
  )
    return undefined;

  return (
    getTimeDifferenceFromSeconds(secondsParsed) +
    getTimeDifferenceFromMinutes(minutesParsed) +
    getTimeDifferenceFromHours(hoursParsed) +
    getTimeDifferenceFromDays(daysParsed)
  );
}
