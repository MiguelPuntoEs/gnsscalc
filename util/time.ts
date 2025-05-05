import moment from 'moment';

export default function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d);
}

export function getDateFromUTC(dateUTC: string, timeUTC: string): Date | undefined {
  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}

export function getDateFromWeekOfYear(weekOfYear: string, dateUTC: string, timeUTC: string): Date | undefined {
  const weekOfYearParsed = Number.parseInt(weekOfYear, 10);

  if (Number.isNaN(weekOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateUTC} ${timeUTC}`, 'YYYY-MM-DD HH:mm:ss')
    .weeks(weekOfYearParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}