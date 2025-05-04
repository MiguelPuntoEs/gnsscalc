import moment from 'moment';

export default function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d);
}

export function getDateFromUTC(dateUTC, timeUTC) {
  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
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