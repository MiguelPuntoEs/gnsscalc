import { getTimeDifferenceFromObject } from 'gnss-js';
import type { TimeDifference } from 'gnss-js';
import useTimeDifferenceCalculator from '../../hooks/timeDifference';
import { createNumberHandler } from '../../util/formats';
import Field from '../Field';

export default function GNSSTimeDifference({
  timeDifference = 0,
  onTimeDifferenceChange,
}: {
  timeDifference: number;
  onTimeDifferenceChange: (timeDifference: number) => void;
}) {
  const { seconds, minutes, hours, days }: TimeDifference =
    useTimeDifferenceCalculator(timeDifference);

  const computationHandle = (timeDifferenceObject: TimeDifference) => {
    const resultTimeDifference =
      getTimeDifferenceFromObject(timeDifferenceObject);
    onTimeDifferenceChange(resultTimeDifference);
    return resultTimeDifference;
  };

  return (
    <form className="calc-form self-start">
      <span>Difference</span>

      <Field
        label="Days"
        value={days.toString()}
        onCommit={createNumberHandler((value) =>
          computationHandle({ seconds, minutes, hours, days: value })
        )}
      />
      <Field
        label="Hours"
        value={hours.toString()}
        onCommit={createNumberHandler((value) =>
          computationHandle({ seconds, minutes, hours: value, days })
        )}
      />
      <Field
        label="Minutes"
        value={minutes.toString()}
        onCommit={createNumberHandler((value) =>
          computationHandle({ seconds, minutes: value, hours, days })
        )}
      />
      <Field
        label="Seconds"
        value={seconds.toString()}
        onCommit={createNumberHandler((value) =>
          computationHandle({ seconds: value, minutes, hours, days })
        )}
      />

      <button
        className="btn"
        type="button"
        onClick={() => onTimeDifferenceChange(0)}
      >
        Reset
      </button>
    </form>
  );
}
