import { useCallback } from 'react';
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
  Scale,
} from 'gnss-js';
import LabelInput from '@/components/LabelInput';
import useCalculator from '@/hooks/time';
import CalculatorForm from '@/components/CalculatorForm';

import { getDateFromWeekOfYear, parseDate } from '../../util/time';
import { SCALE } from '@/constants/time';

export default function GNSSForm({
  title,
  date = new Date(),
  onDateChange,
}: {
  title: string;
  date: Date;
  onDateChange: (date: Date) => void;
}) {
  const result = useCalculator(date);

  const computationHandle = (func) => {
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

  const fields = [
    {
      label: 'Week no.',
      value: result.weekNumber,
      onCompute: (value) =>
        computationHandle(() => getDateFromGpsData(value, result.timeOfWeek)),
      type: 'number',
    },
    {
      label: 'Time of week',
      value: result.timeOfWeek,
      onCompute: (value) =>
        computationHandle(() => getDateFromGpsData(result.weekNumber, value)),
      type: 'number',
    },
    {
      label: 'GPS Time',
      value: result.gpsTime,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromGpsTime(value * MILLISECONDS_IN_SECOND)
        ),
      type: 'number',
    },
    {
      label: 'GAL Time',
      value: result.galTime,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromGalTime(value * MILLISECONDS_IN_SECOND)
        ),
      type: 'number',
    },
    {
      label: 'BDS Time',
      value: result.bdsTime,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromBdsTime(value * MILLISECONDS_IN_SECOND)
        ),
      type: 'number',
    },
    {
      label: 'UNIX Time',
      value: result.unixTime,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromUnixTime(value * MILLISECONDS_IN_SECOND)
        ),
      type: 'number',
    },
    {
      label: 'GLO N4',
      value: result.gloN4,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromGloN(value, result.gloNa, result.timeOfDay)
        ),
      type: 'number',
    },
    {
      label: 'GLO NA',
      value: result.gloNa,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromGloN(result.gloN4, value, result.timeOfDay)
        ),
      type: 'number',
    },
    {
      label: 'Day of Year',
      value: result.dayOfYear,
      onCompute: (value) =>
        computationHandle(() => getDateFromDayOfYear(value, date)),
      type: 'number',
    },
    {
      label: 'Week of Year',
      value: result.weekOfYear,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromWeekOfYear(value, result.dateGps, result.timeGps)
        ),
      type: 'number',
    },
    {
      label: 'Time of Day',
      value: result.timeOfDay,
      onCompute: (value) =>
        computationHandle(() => getDateFromTimeOfDay(value, date)),
      type: 'number',
    },
    {
      label: 'Day of Week',
      value: result.dayOfWeek,
      onCompute: (value) =>
        computationHandle(() => getDateFromDayOfWeek(value, date)),
      type: 'number',
    },
    {
      label: 'Hour Code',
      value: result.hourCode,
      onCompute: (value) =>
        computationHandle(() => getDateFromHourCode(value, date)),
    },
    {
      label: 'Julian Date',
      value: result.julianDate,
      onCompute: (value) =>
        computationHandle(() => getDateFromJulianDate(value, SCALE)),
      type: 'number',
    },
    {
      label: 'MJD',
      value: result.mjd,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromMJD(Number.parseFloat(value), SCALE)
        ),
      type: 'number',
    },
    {
      label: 'MJD2000',
      value: result.mjd2000,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromMJD2000(Number.parseFloat(value), SCALE)
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
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromTai(parseDate(value, result.timeTai))
        ),
    },
    {
      label: 'Time [TAI]',
      value: result.timeTai,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromTai(parseDate(result.dateTai, value))
        ),
    },
    {
      label: 'Date [TT]',
      value: result.dateTT,
      onCompute: (value) =>
        computationHandle(() => getDateFromTt(parseDate(value, result.timeTT))),
    },
    {
      label: 'Time [TT]',
      value: result.timeTT,
      onCompute: (value) =>
        computationHandle(() => getDateFromTt(parseDate(result.dateTT, value))),
    },
    {
      label: 'Date [UTC]',
      value: result.dateUtc,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(value, result.timeUtc))
        ),
    },
    {
      label: 'Time [UTC]',
      value: result.timeUtc,
      onCompute: (value) =>
        computationHandle(() =>
          getDateFromUtc(parseDate(result.dateUtc, value))
        ),
    },
    {
      label: 'Date [GPS]',
      value: result.dateGps,
      onCompute: (value) =>
        computationHandle(() => parseDate(value, result.timeGps)),
    },
    {
      label: 'Time [GPS]',
      value: result.timeGps,
      onCompute: (value) =>
        computationHandle(() => parseDate(result.dateGps, value)),
    },
    {
      label: 'RINEX',
      value: result.rinex,
      onCompute: (value) => computationHandle(() => getDateFromRINEX(value)),
    },
  ];

  return (
    <CalculatorForm className="">
      <div />
      <span>{title}</span>

      {fields.map((field, index) => (
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
