import { DateTime } from 'luxon';

export default function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d);
}

export function parseDate(dateStr: string, timeStr: string): Date {
  const dt_string: string =
    dateStr.replace(/[.,;\s]+/g, '-') + 'T' + timeStr.replace(/[,;\s]+/g, ':');
  console.log('parseDate', dt_string);
  const dt = DateTime.fromISO(dt_string, { zone: 'utc' });

  return dt.isValid ? dt.toJSDate() : new Date();
}

export function getDateFromWeekOfYear(
  weekOfYear: number,
  dateStr: string,
  timeStr: string
): Date | undefined {
  const baseDate = DateTime.fromJSDate(parseDate(dateStr, timeStr), {
    zone: 'utc',
  });

  const dt = DateTime.fromObject(
    {
      weekYear: baseDate.weekYear,
      weekNumber: weekOfYear,
      weekday: baseDate.weekday,
      hour: baseDate.hour,
      minute: baseDate.minute,
      second: baseDate.second,
      millisecond: baseDate.millisecond,
    },
    { zone: 'utc' }
  );

  return dt.isValid ? dt.toJSDate() : new Date();
}
