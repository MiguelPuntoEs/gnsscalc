import { getTimeDifferenceFromObject } from 'gnss-js/time';
import type { TimeDifference } from 'gnss-js/time';
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
    <form className="card-output flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg m-0">Difference</h3>
        <button
          className="inline-flex items-center gap-1 text-[11px] text-fg/50 hover:text-fg transition-colors bg-transparent border-0 p-0 m-0 cursor-pointer"
          type="button"
          onClick={() => onTimeDifferenceChange(0)}
        >
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
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Reset
        </button>
      </div>
      <div className="card-fields">
        <Field
          label="Days"
          value={days.toString()}
          onCommit={createNumberHandler((value) =>
            computationHandle({ seconds, minutes, hours, days: value }),
          )}
        />
        <Field
          label="Hours"
          value={hours.toString()}
          onCommit={createNumberHandler((value) =>
            computationHandle({ seconds, minutes, hours: value, days }),
          )}
        />
        <Field
          label="Minutes"
          value={minutes.toString()}
          onCommit={createNumberHandler((value) =>
            computationHandle({ seconds, minutes: value, hours, days }),
          )}
        />
        <Field
          label="Seconds"
          value={seconds.toString()}
          onCommit={createNumberHandler((value) =>
            computationHandle({ seconds: value, minutes, hours, days }),
          )}
        />
      </div>
    </form>
  );
}
