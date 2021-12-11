import { useCallback } from "react";
import useCalculator from "hooks/time";
import Form from "components/Form";
import LabelInput from "components/LabelInput";
import { formatNumWithDecimals } from "util/formats";
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
  getDateFromUTC,
  getDateFromWeekOfYear,
} from "util/dates";
import { Button } from "@mui/material";
import FormActions from "components/Form/FormActions";
import CopyRinexButton from "./CopyRinexButton";

type Props = {
  title: string;
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
};

export default function GNSSForm({
  title,
  date = new Date(),
  onDateChange,
}: Props) {
  const result = useCalculator(date);

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

  const computationHandle = (func: () => Date | undefined) => {
    const resultDate = func();
    if (resultDate) {
      onDateChange(resultDate);
    }
    return Boolean(resultDate);
  };

  return (
    <Form title={title}>
      <LabelInput
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
        label="Day of Year"
        value={dayOfYear}
        onCompute={(value) =>
          computationHandle(() => getDateFromDayOfYear(value, dateUTC, timeUTC))
        }
        type="number"
      />
      <LabelInput
        label="Week of Year"
        value={weekOfYear}
        onCompute={(value) =>
          computationHandle(() =>
            getDateFromWeekOfYear(value, dateUTC, timeUTC),
          )
        }
        type="number"
      />
      <LabelInput
        label="Time of Day"
        value={timeOfDay}
        onCompute={(value) =>
          computationHandle(() => getDateFromTimeOfDay(value, dateUTC))
        }
        type="number"
      />
      <LabelInput
        label="Day of Week"
        value={dayOfWeek}
        onCompute={(value) =>
          computationHandle(() => getDateFromDayOfWeek(value, dateUTC, timeUTC))
        }
        type="number"
      />
      <LabelInput
        label="Hour Code"
        value={hourCode}
        onCompute={(value) =>
          computationHandle(() => getDateFromHourCode(value, dateUTC, timeUTC))
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
        label="MJD"
        value={formatNumWithDecimals(mjd, 3)}
        onCompute={(value) => computationHandle(() => getDateFromMJD(value))}
        type="number"
      />
      <LabelInput
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

      <FormActions>
        <CopyRinexButton rinex={rinex} />
        <Button
          variant="contained"
          onClick={() => {
            onDateChange(new Date());
          }}
        >
          Now
        </Button>
      </FormActions>
    </Form>
  );
}
