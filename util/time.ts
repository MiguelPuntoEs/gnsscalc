import moment from 'moment';

export default function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d);
}

export function parseDate(dateStr: string, timeStr: string): Date {
  const timestamp = Date.parse(`${dateStr}T${timeStr}`);
  if (!timestamp) {
    console.error('Invalid date or time string');
    return new Date();
  }

  return new Date(timestamp);
}

export function getDateFromWeekOfYear(
  weekOfYear: string,
  dateStr: string,
  timeStr: string
): Date | undefined {
  const weekOfYearParsed = Number.parseInt(weekOfYear, 10);

  if (Number.isNaN(weekOfYearParsed)) return undefined;

  const date = moment
    .utc(`${dateStr} ${timeStr}`, 'YYYY-MM-DD HH:mm:ss.SSS')
    .weeks(weekOfYearParsed)
    .toDate();

  if (!isValidDate(date)) return undefined;

  return date;
}
