import CalculatorForm from '@/components/CalculatorForm';
import LabelInput from '@/components/LabelInput';
import useTimeCalculator from '@/hooks/time';
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
  HourCode,
  MILLISECONDS_IN_SECOND
} from 'gnss-js';
import { useCallback } from 'react';

import { SCALE } from '@/constants/time';
import { createFloatHandler, createIntegerHandler } from '../../util/formats';
import { getDateFromWeekOfYear, parseDate } from '../../util/time';

type FieldConfig = {
  label: string;
  value: string;
  onCompute?: (value: string) => Date | undefined;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  maskOptions?: {
    mask: string;
    formatChars: {
      [key: string]: string;
    };
  };
};

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

  const getKey = useCallback(
    () => JSON.stringify(date) + Math.random(),
    [date]
  );

  const fields: FieldConfig[] = [
    {
      label: 'Week no.',
      value: result.weekNumber.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() => getDateFromGpsData(value, result.timeOfWeek))
      ),
      type: 'number',
    },
    {
      label: 'Time of week',
      value: result.timeOfWeek.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() => getDateFromGpsData(result.weekNumber, value))
      ),
      type: 'number',
    },
    {
      label: 'GPS Time',
      value: result.gpsTime.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() =>
          getDateFromGpsTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      type: 'number',
    },
    {
      label: 'GAL Time',
      value: result.galTime.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() =>
          getDateFromGalTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      type: 'number',
    },
    {
      label: 'BDS Time',
      value: result.bdsTime.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() =>
          getDateFromBdsTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      type: 'number',
    },
    {
      label: 'UNIX Time',
      value: result.unixTime.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() =>
          getDateFromUnixTime(value * MILLISECONDS_IN_SECOND)
        )
      ),
      type: 'number',
    },
    {
      label: 'GLO N4',
      value: result.gloN4.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(value, result.gloNa, result.timeOfDay)
        )
      ),
      type: 'number',
    },
    {
      label: 'GLO NA',
      value: result.gloNa.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(result.gloN4, value, result.timeOfDay)
        )
      ),
      type: 'number',
    },
    {
      label: 'Day of Year',
      value: result.dayOfYear.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() => getDateFromDayOfYear(value, date))
      ),
      type: 'number',
    },
    {
      label: 'Week of Year',
      value: result.weekOfYear.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() =>
          getDateFromWeekOfYear(value, result.dateGps, result.timeGps)
        )
      ),
      type: 'number',
    },
    {
      label: 'Time of Day',
      value: result.timeOfDay.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() => getDateFromTimeOfDay(value, date))
      ),
      type: 'number',
    },
    {
      label: 'Day of Week',
      value: result.dayOfWeek.toString(),
      onCompute: createIntegerHandler((value) =>
        computationHandle(() => getDateFromDayOfWeek(value, date))
      ),
      type: 'number',
    },
    {
      label: 'Hour Code',
      value: result.hourCode,
      onCompute: (value: string) =>
        computationHandle(() => getDateFromHourCode(value as HourCode, date)),
    },
    {
      label: 'Julian Date',
      value: result.julianDate.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() => getDateFromJulianDate(value, SCALE))
      ),
      type: 'number',
    },
    {
      label: 'MJD',
      value: result.mjd.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() => getDateFromMJD(value, SCALE))
      ),
      type: 'number',
    },
    {
      label: 'MJD2000',
      value: result.mjd2000.toString(),
      onCompute: createFloatHandler((value) =>
        computationHandle(() => getDateFromMJD2000(value, SCALE))
      ),
      type: 'number',
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
      onCompute: (value: string) =>
        computationHandle(() =>
          getDateFromTai(parseDate(value, result.timeTai))
        ),
    },
    {
      label: 'Time [TAI]',
      value: result.timeTai,
      onCompute: (value: string) =>
        computationHandle(() =>
          getDateFromTai(parseDate(result.dateTai, value))
        ),
    },
    {
      label: 'Date [TT]',
      value: result.dateTT,
      onCompute: (value: string) =>
        computationHandle(() => getDateFromTt(parseDate(value, result.timeTT))),
    },
    {
      label: 'Time [TT]',
      value: result.timeTT,
      onCompute: (value: string) =>
        computationHandle(() => getDateFromTt(parseDate(result.dateTT, value))),
    },
    {
      label: 'Date [UTC]',
      value: result.dateUtc,
      onCompute: (value: string) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(value, result.timeUtc))
        ),
    },
    {
      label: 'Time [UTC]',
      value: result.timeUtc,
      onCompute: (value: string) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(result.dateUtc, value))
        ),
    },
    {
      label: 'Date [GPS]',
      value: result.dateGps,
      onCompute: (value: string) =>
        computationHandle(() => parseDate(value, result.timeGps)),
    },
    {
      label: 'Time [GPS]',
      value: result.timeGps,
      onCompute: (value: string) =>
        computationHandle(() => parseDate(result.dateGps, value)),
    },
    {
      label: 'RINEX',
      value: result.rinex,
      onCompute: (value: string) =>
        computationHandle(() => getDateFromRINEX(value)),
    },
  ];

  return (
    <CalculatorForm className="">
      <div />
      <span>{title}</span>

      {fields.map((field) => (
        <LabelInput key={getKey()} {...field} />
      ))}

      <div />
      <button
        className="button"
        type="button"
        onClick={() => {
          const date: Date = new Date();
          const gps_leap_seconds: number = getGpsLeap(date);
          onDateChange(
            new Date(date.getTime() + gps_leap_seconds * MILLISECONDS_IN_SECOND)
          );
        }}
      >
        Now
      </button>

      <div />
      <button
        className="button button--secondary"
        onClick={() => {
          navigator.clipboard.writeText(result.rinex).catch((err) => {
            console.error('Failed to copy: ', err);
          });
        }}
      >
        Copy RINEX
      </button>
    </CalculatorForm>
  );
}
