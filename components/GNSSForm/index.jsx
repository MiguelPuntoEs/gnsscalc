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
  const result = useCalculator(date); // Echte Ergebnisse

  const {
    bdsTime,
    dateUTC,
    dateTai,
    dateTT,
    dayOfWeek,
    dayOfYear,
    galTime,
    gloN4,
    gloNa,
    gpsTime,
    hourCode,
    julianDate,
    leapSec,
    mjd,
    mjd2000,
    rinex,
    timeUTC,
    timeOfDay,
    timeOfWeek,
    timeTai,
    timeTT,
    unixTime,
    weekNumber,
    weekOfYear,
  } = result;

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

  return (
    <CalculatorForm>
      <div />
      <span>{title}</span>

      <LabelInput
        key={getKey()}
        label="Week no."
        value={weekNumber}
        onCompute={(value) =>
          computationHandle(() => getDateFromGpsData(value, timeOfWeek))
        }
        type="number"
      />
      <LabelInput
        label="Time of week"
        value={timeOfWeek}
        onCompute={(value) =>
          computationHandle(() => getDateFromGpsData(weekNumber, value))
        }
        type="number"
      />
      <LabelInput
        label="GPS Time"
        value={gpsTime}
        onCompute={(value) =>
          computationHandle(() => getDateFromGpsTime(value))
        }
        type="number"
      />
      <LabelInput
        label="GAL Time"
        value={galTime}
        onCompute={(value) =>
          computationHandle(() => getDateFromGalTime(value))
        }
        type="number"
      />
      <LabelInput
        label="BDS Time"
        value={bdsTime}
        onCompute={(value) =>
          computationHandle(() => getDateFromBdsTime(value))
        }
        type="number"
      />
      <LabelInput
        label="UNIX Time"
        value={unixTime}
        onCompute={(value) =>
          computationHandle(() => getDateFromUnixTime(value))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label={
          <span>
            GLO N<sub>4</sub>
          </span>
        }
        value={gloN4}
        onCompute={(value) =>
          computationHandle(() => getDateFromGloN(value, gloNa, timeOfDay))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label={
          <span>
            GLO N<sup>A</sup>
          </span>
        }
        value={gloNa}
        onCompute={(value) =>
          computationHandle(() => getDateFromGloN(gloN4, value, timeOfDay))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="Day of Year"
        value={dayOfYear}
        onCompute={(value) =>
          computationHandle(() => getDateFromDayOfYear(value, date))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="Week of Year"
        value={weekOfYear}
        onCompute={(value) =>
          computationHandle(() =>
            getDateFromWeekOfYear(value, dateUTC, timeUTC)
          )
        }
        type="number"
      />
      <LabelInput
        label="Time of Day"
        value={timeOfDay}
        onCompute={(value) =>
          computationHandle(() => getDateFromTimeOfDay(value, date))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="Day of Week"
        value={dayOfWeek}
        onCompute={(value) =>
          computationHandle(() => getDateFromDayOfWeek(value, date))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="Hour Code"
        value={hourCode}
        onCompute={(value) =>
          computationHandle(() => getDateFromHourCode(value, date))
        }
      />
      <LabelInput
        label="Julian Date"
        value={julianDate}
        onCompute={(value) =>
          computationHandle(() => getDateFromJulianDate(value))
        }
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="MJD"
        value={formatNumWithDecimals(mjd, 3)}
        onCompute={(value) => computationHandle(() => getDateFromMJD(value))}
        type="number"
      />
      <LabelInput
        key={getKey()}
        label="MJD2000"
        value={mjd2000}
        onCompute={(value) =>
          computationHandle(() => getDateFromMJD2000(value))
        }
        type="number"
      />
      <LabelInput label="Leap Sec." value={leapSec} disabled readOnly />
      <LabelInput label="Date [TAI]" value={dateTai} disabled readOnly />
      <LabelInput label="Time [TAI]" value={timeTai} disabled readOnly />
      <LabelInput label="Date [TT]" value={dateTT} disabled readOnly />
      <LabelInput label="Time [TT]" value={timeTT} disabled readOnly />
      <LabelInput
        key={getKey()}
        label="Date [UTC]"
        value={dateUTC}
        onCompute={(value) =>
          computationHandle(() => getDateFromUTC(value, timeUTC))
        }
      />
      <LabelInput
        label="Time [UTC]"
        value={timeUTC}
        onCompute={(value) =>
          computationHandle(() => getDateFromUTC(dateUTC, value))
        }
      />
      <LabelInput
        label="RINEX"
        value={rinex}
        onCompute={(value) => computationHandle(() => getDateFromRINEX(value))}
      />

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
            .writeText(rinex)
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
