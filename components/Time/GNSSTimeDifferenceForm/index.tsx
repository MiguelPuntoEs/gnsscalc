import { Button } from "@mui/material";
import Form from "components/Form";
import FormActions from "components/Form/FormActions";
import LabelInput from "components/LabelInput";
import useTimeDifferenceCalculator from "hooks/timeDifference";
import {
  getTimeDifference,
  getTimeDifferenceFromObject,
  TimeDifference,
} from "util/dates";

type Props = {
  startDate: Date;
  endDate: Date;
  onDifferenceChange: (endDate: Date) => void;
};

const GNSSTimeDifferenceForm = ({
  endDate,
  onDifferenceChange,
  startDate,
}: Props) => {
  const timeDifference = getTimeDifference(startDate, endDate) || 0;

  const calculator = useTimeDifferenceCalculator(timeDifference);

  if (!calculator) {
    return <span>Calculator not loadable</span>;
  }

  const { days, hours, minutes, seconds } = calculator;

  const handleDifferenceChange = (td: TimeDifference) => {
    const result = getTimeDifferenceFromObject(td);
    if (result) {
      onDifferenceChange(new Date(startDate.getTime() + result));
    }

    return Boolean(result);
  };

  return (
    <Form title="Difference">
      <LabelInput
        label="Days"
        type="number"
        value={days}
        onCompute={(value) =>
          handleDifferenceChange({ seconds, minutes, hours, days: value })
        }
      />
      <LabelInput
        label="Hours"
        type="number"
        value={hours}
        onCompute={(value) =>
          handleDifferenceChange({ seconds, minutes, hours: value, days })
        }
      />
      <LabelInput
        label="Minutes"
        type="number"
        value={minutes}
        onCompute={(value) =>
          handleDifferenceChange({ seconds, minutes: value, hours, days })
        }
      />
      <LabelInput
        label="Seconds"
        type="number"
        value={seconds}
        onCompute={(value) =>
          handleDifferenceChange({ seconds: value, minutes, hours, days })
        }
      />
      <div />
      <FormActions>
        <Button
          type="button"
          variant="contained"
          onClick={() => {
            onDifferenceChange(startDate);
          }}
        >
          Reset
        </Button>
      </FormActions>
    </Form>
  );
};

export default GNSSTimeDifferenceForm;
