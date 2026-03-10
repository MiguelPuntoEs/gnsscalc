import useTimeCalculator from '../../hooks/time';
import {
  getDateFromBdsTime,
  getDateFromDayOfWeek,
  getDateFromDayOfYear,
  getDateFromGalTime,
  getDateFromGloN,
  getDateFromGpsData,
  getDateFromGpsTime,
  getDateFromHourCode,
  getDateFromJulianDate,
  getDateFromMJD,
  getDateFromMJD2000,
  getDateFromRINEX,
  getDateFromTai,
  getDateFromTimeOfDay,
  getDateFromTt,
  getDateFromUnixTime,
  getDateFromUtc,
  getGpsLeap,
  MILLISECONDS_IN_SECOND,
} from 'gnss-js';
import type { HourCode } from 'gnss-js';

import { SCALE } from '../../constants/time';
import { createNumberHandler } from '../../util/formats';
import { getDateFromWeekOfYear, parseDate } from '../../util/time';
import Field from '../Field';
import type { FieldProps } from '../Field';

export default function GNSSForm({
  title,
  date = new Date(),
  onDateChange,
}: {
  title: string;
  date: Date;
  onDateChange: (date: Date) => void;
}) {
  const result = useTimeCalculator(date);

  const computationHandle = (
    func: () => Date | undefined
  ): Date | undefined => {
    const resultDate = func();
    if (resultDate) {
      onDateChange(resultDate);
    }
    return resultDate;
  };

  const fields: FieldProps[] = [
    {
      label: 'Week no.',
      value: result.weekNumber.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromGpsData(value, result.timeOfWeek))
      ),
      numeric: true,
    },
    {
      label: 'Time of week',
      value: result.timeOfWeek.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromGpsData(result.weekNumber, value))
      ),
      numeric: true,
    },
    {
      label: 'GPS Time',
      value: result.gpsTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGpsTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      numeric: true,
    },
    {
      label: 'GAL Time',
      value: result.galTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGalTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      numeric: true,
    },
    {
      label: 'BDS Time',
      value: result.bdsTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromBdsTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      numeric: true,
    },
    {
      label: 'UNIX Time',
      value: result.unixTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromUnixTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      numeric: true,
    },
    {
      label: 'GLO N4',
      value: result.gloN4.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(value, result.gloNa, result.timeOfDay)
        )
      ),
      numeric: true,
    },
    {
      label: 'GLO NA',
      value: result.gloNa.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(result.gloN4, value, result.timeOfDay)
        )
      ),
      numeric: true,
    },
    {
      label: 'Day of Year',
      value: result.dayOfYear.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromDayOfYear(value, date))
      ),
      numeric: true,
    },
    {
      label: 'Week of Year',
      value: result.weekOfYear.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromWeekOfYear(value, result.dateGps, result.timeGps)
        )
      ),
      numeric: true,
    },
    {
      label: 'Time of Day',
      value: result.timeOfDay.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromTimeOfDay(value, date))
      ),
      numeric: true,
    },
    {
      label: 'Day of Week',
      value: result.dayOfWeek.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromDayOfWeek(value, date))
      ),
      numeric: true,
    },
    {
      label: 'Hour Code',
      value: result.hourCode,
      onCommit: (value: string) =>
        computationHandle(() => {
          try {
            return getDateFromHourCode(value as HourCode, date);
          } catch {
            return undefined;
          }
        }),
    },
    {
      label: 'Julian Date',
      value: result.julianDate.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromJulianDate(value, SCALE))
      ),
      numeric: true,
    },
    {
      label: 'MJD',
      value: result.mjd.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromMJD(value, SCALE))
      ),
      numeric: true,
    },
    {
      label: 'MJD2000',
      value: result.mjd2000.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromMJD2000(value, SCALE))
      ),
      numeric: true,
    },
    {
      label: 'Leap Sec.',
      value: result.leapSec,
      disabled: true,
      readOnly: true,
    },
    {
      label: 'Date [TAI]',
      value: result.dateTai,
      onCommit: (value: string) =>
        computationHandle(() =>
          getDateFromTai(parseDate(value, result.timeTai))
        ),
    },
    {
      label: 'Time [TAI]',
      value: result.timeTai,
      onCommit: (value: string) =>
        computationHandle(() =>
          getDateFromTai(parseDate(result.dateTai, value))
        ),
    },
    {
      label: 'Date [TT]',
      value: result.dateTT,
      onCommit: (value: string) =>
        computationHandle(() => getDateFromTt(parseDate(value, result.timeTT))),
    },
    {
      label: 'Time [TT]',
      value: result.timeTT,
      onCommit: (value: string) =>
        computationHandle(() => getDateFromTt(parseDate(result.dateTT, value))),
    },
    {
      label: 'Date [UTC]',
      value: result.dateUtc,
      onCommit: (value: string) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(value, result.timeUtc))
        ),
    },
    {
      label: 'Time [UTC]',
      value: result.timeUtc,
      onCommit: (value: string) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(result.dateUtc, value))
        ),
    },
    {
      label: 'Date [GPS]',
      value: result.dateGps,
      onCommit: (value: string) =>
        computationHandle(() => parseDate(value, result.timeGps)),
    },
    {
      label: 'Time [GPS]',
      value: result.timeGps,
      onCommit: (value: string) =>
        computationHandle(() => parseDate(result.dateGps, value)),
    },
    {
      label: 'RINEX',
      value: result.rinex,
      onCommit: (value: string) =>
        computationHandle(() => getDateFromRINEX(value)),
    },
  ];

  return (
    <form className="calc-form">
      <span>{title}</span>

      {fields.map((field) => (
        <Field key={field.label} {...field} />
      ))}

      <button
        className="btn"
        type="button"
        onClick={() => {
          const now = new Date();
          const gpsLeap = getGpsLeap(now);
          onDateChange(
            new Date(now.getTime() + gpsLeap * MILLISECONDS_IN_SECOND)
          );
        }}
      >
        Now
      </button>

      <button
        className="btn-secondary"
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(result.rinex).catch((err) => {
            console.error('Failed to copy: ', err);
          });
        }}
      >
        Copy RINEX
      </button>
    </form>
  );
}
