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
  getDateFromTimeOfDay,
  getDateFromUnixTime,
} from 'gnss-js';
import LabelInput from '../LabelInput';
import useCalculator from '../../hooks/time';
import { formatNumWithDecimals } from '../../util/formats';
import CalculatorForm from '../CalculatorForm';
import Button from '../Button';

import { getDateFromUTC, getDateFromWeekOfYear } from '../../util/time';

export default function GNSSForm({ title, date = new Date(), onDateChange }) {
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
      onCompute: (value) => computationHandle(() => getDateFromGpsData(value, result.timeOfWeek)),
      type: 'number',
    },
    {
      label: 'Time of week',
      value: result.timeOfWeek,
      onCompute: (value) => computationHandle(() => getDateFromGpsData(result.weekNumber, value)),
      type: 'number',
    },
    {
      label: 'GPS Time',
      value: result.gpsTime,
      onCompute: (value) => computationHandle(() => getDateFromGpsTime(value)),
      type: 'number',
    },
    {
      label: 'GAL Time',
      value: result.galTime,
      onCompute: (value) => computationHandle(() => getDateFromGalTime(value)),
      type: 'number',
    },
    {
      label: 'BDS Time',
      value: result.bdsTime,
      onCompute: (value) => computationHandle(() => getDateFromBdsTime(value)),
      type: 'number',
    },
    {
      label: 'UNIX Time',
      value: result.unixTime,
      onCompute: (value) => computationHandle(() => getDateFromUnixTime(value)),
      type: 'number',
    },
    {
      label: (
        <span>
          GLO N<sub>4</sub>
        </span>
      ),
      value: result.gloN4,
      onCompute: (value) => computationHandle(() => getDateFromGloN(value, result.gloNa, result.timeOfDay)),
      type: 'number',
    },
    {
      label: (
        <span>
          GLO N<sup>A</sup>
        </span>
      ),
      value: result.gloNa,
      onCompute: (value) => computationHandle(() => getDateFromGloN(result.gloN4, value, result.timeOfDay)),
      type: 'number',
    },
    {
      label: 'Day of Year',
      value: result.dayOfYear,
      onCompute: (value) => computationHandle(() => getDateFromDayOfYear(value, date)),
      type: 'number',
    },
    {
      label: 'Week of Year',
      value: result.weekOfYear,
      onCompute: (value) => computationHandle(() => getDateFromWeekOfYear(value, result.dateUTC, result.timeUTC)),
      type: 'number',
    },
    {
      label: 'Time of Day',
      value: result.timeOfDay,
      onCompute: (value) => computationHandle(() => getDateFromTimeOfDay(value, date)),
      type: 'number',
    },
    {
      label: 'Day of Week',
      value: result.dayOfWeek,
      onCompute: (value) => computationHandle(() => getDateFromDayOfWeek(value, date)),
      type: 'number',
    },
    {
      label: 'Hour Code',
      value: result.hourCode,
      onCompute: (value) => computationHandle(() => getDateFromHourCode(value, date)),
    },
    {
      label: 'Julian Date',
      value: result.julianDate,
      onCompute: (value) => computationHandle(() => getDateFromJulianDate(value)),
      type: 'number',
    },
    {
      label: 'MJD',
      value: formatNumWithDecimals(result.mjd, 3),
      onCompute: (value) => computationHandle(() => getDateFromMJD(value)),
      type: 'number',
    },
    {
      label: 'MJD2000',
      value: result.mjd2000,
      onCompute: (value) => computationHandle(() => getDateFromMJD2000(value)),
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
      disabled: true,
      readOnly: true,
    },
    {
      label: 'Time [TAI]',
      value: result.timeTai,
      disabled: true,
      readOnly: true,
    },
    {
      label: 'Date [TT]',
      value: result.dateTT,
      disabled: true,
      readOnly: true,
    },
    {
      label: 'Time [TT]',
      value: result.timeTT,
      disabled: true,
      readOnly: true,
    },
    {
      label: 'Date [UTC]',
      value: result.dateUTC,
      onCompute: (value) => computationHandle(() => getDateFromUTC(value, result.timeUTC)),
    },
    {
      label: 'Time [UTC]',
      value: result.timeUTC,
      onCompute: (value) => computationHandle(() => getDateFromUTC(result.dateUTC, value)),
    },
    {
      label: 'RINEX',
      value: result.rinex,
      onCompute: (value) => computationHandle(() => getDateFromRINEX(value)),
    },
  ];

  return (
    <CalculatorForm>
      <div />
      <span>{title}</span>

      {fields.map((field, index) => (
        <LabelInput key={getKey()} {...field} />
      ))}

      <div />
      <Button
        type="button"
        onClick={() => {
          onDateChange(new Date());
        }}
      >
        Now
      </Button>

      <div />
      <Button
        type="button"
        secondary
        onClick={() => {
          navigator.clipboard
            .writeText(result.rinex)
            .catch((err) => {
              console.error('Failed to copy: ', err);
            });
        }}
      >
        Copy RINEX
      </Button>
    </CalculatorForm>
  );
}
