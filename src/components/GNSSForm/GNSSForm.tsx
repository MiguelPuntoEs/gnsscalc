import { useCallback, useRef, useState } from 'react';
import useEditableValue from '../../hooks/useEditableValue';
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
} from 'gnss-js/time';
import type { HourCode } from 'gnss-js/time';

import { SCALE } from '../../constants/time';
import { createNumberHandler } from '../../util/formats';
import { getDateFromWeekOfYear, parseDate } from '../../util/time';
import { useCopyFeedback } from '../CopyIcon';
import Field from '../Field';
import type { FieldProps } from '../Field';

function FieldSection({
  label,
  fields,
}: {
  label: string;
  fields: FieldProps[];
}) {
  return (
    <div className="card-fields">
      <span className="section-label">{label}</span>
      {fields.map((field) => (
        <Field key={field.label} {...field} />
      ))}
    </div>
  );
}

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
    func: () => Date | undefined,
  ): Date | undefined => {
    const resultDate = func();
    if (resultDate) {
      onDateChange(resultDate);
    }
    return resultDate;
  };

  const gpsWeekFields: FieldProps[] = [
    {
      label: 'Week no.',
      value: result.weekNumber.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGpsData(value, result.timeOfWeek * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
    {
      label: 'Time of week',
      value: result.timeOfWeek.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGpsData(result.weekNumber, value * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
  ];

  const timestampFields: FieldProps[] = [
    {
      label: 'GPS Time',
      value: result.gpsTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGpsTime(value * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
    {
      label: 'GAL Time',
      value: result.galTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGalTime(value * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
    {
      label: 'BDS Time',
      value: result.bdsTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromBdsTime(value * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
    {
      label: 'UNIX Time',
      value: result.unixTime.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromUnixTime(value * MILLISECONDS_IN_SECOND),
        ),
      ),
      numeric: true,
    },
  ];

  const glonassFields: FieldProps[] = [
    {
      label: 'GLO N4',
      value: result.gloN4.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(
            value,
            result.gloNa,
            result.timeOfDay * MILLISECONDS_IN_SECOND,
          ),
        ),
      ),
      numeric: true,
    },
    {
      label: 'GLO NA',
      value: result.gloNa.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromGloN(
            result.gloN4,
            value,
            result.timeOfDay * MILLISECONDS_IN_SECOND,
          ),
        ),
      ),
      numeric: true,
    },
  ];

  const calendarFields: FieldProps[] = [
    {
      label: 'Day of Year',
      value: result.dayOfYear.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromDayOfYear(value, date)),
      ),
      numeric: true,
    },
    {
      label: 'Week of Year',
      value: result.weekOfYear.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromWeekOfYear(value, result.dateGps, result.timeGps),
        ),
      ),
      numeric: true,
    },
    {
      label: 'Time of Day',
      value: result.timeOfDay.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() =>
          getDateFromTimeOfDay(value * MILLISECONDS_IN_SECOND, date),
        ),
      ),
      numeric: true,
    },
    {
      label: 'Day of Week',
      value: result.dayOfWeek.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromDayOfWeek(value, date)),
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
  ];

  const julianFields: FieldProps[] = [
    {
      label: 'Julian Date',
      value: result.julianDate.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromJulianDate(value, SCALE)),
      ),
      numeric: true,
    },
    {
      label: 'MJD',
      value: result.mjd.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromMJD(value, SCALE)),
      ),
      numeric: true,
    },
    {
      label: 'MJD2000',
      value: result.mjd2000.toString(),
      onCommit: createNumberHandler((value) =>
        computationHandle(() => getDateFromMJD2000(value, SCALE)),
      ),
      numeric: true,
    },
  ];

  const dateTimeFields: FieldProps[] = [
    {
      label: 'Date [TAI]',
      value: result.dateTai,
      onCommit: (value: string) => {
        const d = parseDate(value, result.timeTai);
        return computationHandle(() => d && getDateFromTai(d));
      },
    },
    {
      label: 'Time [TAI]',
      value: result.timeTai,
      onCommit: (value: string) => {
        const d = parseDate(result.dateTai, value);
        return computationHandle(() => d && getDateFromTai(d));
      },
    },
    {
      label: 'Date [TT]',
      value: result.dateTT,
      onCommit: (value: string) => {
        const d = parseDate(value, result.timeTT);
        return computationHandle(() => d && getDateFromTt(d));
      },
    },
    {
      label: 'Time [TT]',
      value: result.timeTT,
      onCommit: (value: string) => {
        const d = parseDate(result.dateTT, value);
        return computationHandle(() => d && getDateFromTt(d));
      },
    },
    {
      label: 'Date [UTC]',
      value: result.dateUtc,
      onCommit: (value: string) => {
        const d = parseDate(value, result.timeUtc);
        return computationHandle(() => d && getDateFromUtc(d));
      },
    },
    {
      label: 'Time [UTC]',
      value: result.timeUtc,
      onCommit: (value: string) => {
        const d = parseDate(result.dateUtc, value);
        return computationHandle(() => d && getDateFromUtc(d));
      },
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
  ];

  const getRinex = useCallback(() => result.rinex, [result.rinex]);
  const { copied: rinexCopied, copy: copyRinex } = useCopyFeedback(getRinex);

  const [nowPressed, setNowPressed] = useState(false);
  const nowTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const rinexEdit = useEditableValue(result.rinex, (value: string) =>
    computationHandle(() => getDateFromRINEX(value)),
  );

  return (
    <form className="card flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg m-0">{title}</h3>
        <div className="flex gap-2">
          <button
            className={`inline-flex items-center gap-1 text-xs transition-colors rounded-md px-2 py-1 border cursor-pointer ${
              rinexCopied
                ? 'text-green-400 border-green-400/30'
                : 'text-fg/50 hover:text-fg border-fg/10 hover:border-fg/20'
            }`}
            type="button"
            onClick={copyRinex}
          >
            {rinexCopied ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
            {rinexCopied ? 'Copied!' : 'RINEX'}
          </button>
          <button
            className={`inline-flex items-center gap-1 text-xs transition-colors rounded-md px-2 py-1 border cursor-pointer font-semibold ${nowPressed ? 'text-green-400 border-green-400/30' : 'text-accent border-accent/30 hover:border-accent/50'}`}
            type="button"
            onClick={() => {
              const now = new Date();
              now.setMilliseconds(0);
              const gpsLeap = getGpsLeap(now);
              onDateChange(
                new Date(now.getTime() + gpsLeap * MILLISECONDS_IN_SECOND),
              );
              setNowPressed(true);
              clearTimeout(nowTimeout.current);
              nowTimeout.current = setTimeout(() => setNowPressed(false), 1500);
            }}
          >
            {nowPressed ? 'Updated!' : 'Now'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] tabular-nums">
        <span
          className="inline-flex items-center rounded-full bg-accent/10 text-accent/80 px-2 py-0.5 font-medium"
          title="GPS time minus UTC"
        >
          GPS &minus; UTC = {result.leapGpsUtc}s
        </span>
        <span
          className="inline-flex items-center rounded-full bg-accent/10 text-accent/80 px-2 py-0.5 font-medium"
          title="TAI minus UTC"
        >
          TAI &minus; UTC = {result.leapTaiUtc}s
        </span>
      </div>

      {/* RINEX – hero field */}
      <input
        value={rinexEdit.value}
        onChange={rinexEdit.onChange}
        onKeyDown={rinexEdit.onKeyDown}
        onBlur={rinexEdit.onBlur}
        aria-invalid={rinexEdit.error || undefined}
        className={`w-full font-mono text-center bg-accent/5 border border-accent/20 rounded px-3 py-1.5 text-sm ${rinexEdit.error ? '!border-red-500 !text-red-500' : ''}`}
      />

      <FieldSection label="GPS Week" fields={gpsWeekFields} />
      <FieldSection label="Timestamps" fields={timestampFields} />
      <FieldSection label="GLONASS" fields={glonassFields} />
      <FieldSection label="Calendar" fields={calendarFields} />
      <FieldSection label="Julian" fields={julianFields} />
      <FieldSection label="Date / Time" fields={dateTimeFields} />
    </form>
  );
}
