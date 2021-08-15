import { useCallback } from "react";
import {
  getTimeDifferenceFromObject,
  getTimeDifferenceObject,
} from "../../hooks/calculator";
import LabelInput from "../LabelInput";
import styles from "./gnsstimedifference.module.scss";

export default function GNSSTimeDifference({
  timeDifference = 0,
  onTimeDifferenceChange,
}) {
  const { seconds, minutes, hours, days } =
    getTimeDifferenceObject(timeDifference);

  const computationHandle = (timeDifferenceObject) => {
    const resultTimeDifference =
      getTimeDifferenceFromObject(timeDifferenceObject);
    if (resultTimeDifference) {
      onTimeDifferenceChange(resultTimeDifference);
    }
    return resultTimeDifference;
  };

  const getKey = useCallback(
    () => JSON.stringify(timeDifference) + Math.random(),
    [timeDifference]
  );

  return (
    <>
      <form
        id="time_difference"
        className={`${styles.container} ${styles.timeDifference}`}
      >
        <label></label>
        <label>Difference</label>

        <LabelInput
          key={getKey()}
          label="Days"
          type="number"
          value={days}
          onCompute={(value) =>
            computationHandle({ seconds, minutes, hours, days: value })
          }
        />
        <LabelInput
          key={getKey()}
          label="Hours"
          type="number"
          value={hours}
          onCompute={(value) =>
            computationHandle({ seconds, minutes, hours: value, days })
          }
        />
        <LabelInput
          key={getKey()}
          label="Minutes"
          type="number"
          value={minutes}
          onCompute={(value) =>
            computationHandle({ seconds, minutes: value, hours, days })
          }
        />
        <LabelInput
          key={getKey()}
          label="Seconds"
          type="number"
          value={seconds}
          onCompute={(value) =>
            computationHandle({ seconds: value, minutes, hours, days })
          }
        />
        <label></label>
        <button
          type="button"
          onClick={() => {
            onTimeDifferenceChange(0);
          }}
        >
          Reset
        </button>
      </form>
    </>
  );
}
