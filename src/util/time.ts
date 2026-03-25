import { DateTime } from 'luxon';
import type { WeekdayNumbers } from 'luxon';

export function parseDate(dateStr: string, timeStr: string): Date | undefined {
  const dt_string: string =
    dateStr.replace(/[.,;\s]+/g, '-') + 'T' + timeStr.replace(/[,;\s]+/g, ':');
  const dt = DateTime.fromISO(dt_string, { zone: 'utc' });

  return dt.isValid ? dt.toJSDate() : undefined;
}

export function getDateFromWeekOfYear(
  weekOfYear: number,
  dateStr: string,
  timeStr: string,
): Date | undefined {
  const parsed = parseDate(dateStr, timeStr);
  if (!parsed) return undefined;

  const baseDate = DateTime.fromJSDate(parsed, {
    zone: 'utc',
  });

  const dt = DateTime.fromObject(
    {
      weekYear: baseDate.weekYear,
      weekNumber: weekOfYear,
      weekday: baseDate.weekday as WeekdayNumbers,
      hour: baseDate.hour,
      minute: baseDate.minute,
      second: baseDate.second,
      millisecond: baseDate.millisecond,
    },
    { zone: 'utc' },
  );

  return dt.isValid ? dt.toJSDate() : undefined;
}
