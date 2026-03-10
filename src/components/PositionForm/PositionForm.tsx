import { useId, useRef, useState } from 'react';
import { IMaskInput } from 'react-imask';
import {
  DECIMAL_PLACES_FOR_CARTESIAN,
  DECIMAL_PLACES_FOR_HEIGHT,
  DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE,
} from '../../constants/position';
import { usePositionCalculator } from '../../hooks/positioning';
import type { Position } from '../../types/position';
import {
  formatLatitudeDegMinSecs,
  formatLongitudeDegMinSecs,
  createNumberHandler,
} from '../../util/formats';
import {
  getPositionFromCartesian,
  getPositionFromGeodetic,
  getPositionFromGeodeticString,
} from '../../util/positioning';
import Field from '../Field';

function MaskedField({
  label,
  value,
  onCommit,
  mask,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => unknown;
  mask: string;
}) {
  const id = useId();
  const [error, setError] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const displayRef = useRef(value);

  const commit = () => {
    const result = onCommit(displayRef.current);
    setError(result === undefined);
  };

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <IMaskInput
        id={id}
        mask={mask}
        definitions={{ '0': /\d/ }}
        lazy={false}
        overwrite
        value={value}
        onAccept={(val: string) => {
          displayRef.current = val;
          if (error) setError(false);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter') commit();
        }}
        onBlur={commit}
        className={error ? 'border-2 border-red-500 text-red-500' : ''}
      />
    </>
  );
}

export default function PositionForm({
  title = '',
  position = [4263871.9243, 722591.1075, 4672988.8878],
  onPositionChange,
}: {
  title?: string;
  position: Position;
  onPositionChange: (position: Position) => void;
}) {
  const { latitude, longitude, height } = usePositionCalculator(position);

  const x = position[0].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const y = position[1].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const z = position[2].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);

  const latitudeString = formatLatitudeDegMinSecs(latitude);
  const longitudeString = formatLongitudeDegMinSecs(longitude);
  const heightString = height.toFixed(DECIMAL_PLACES_FOR_HEIGHT);

  const computationHandle = (func: () => Position | undefined) => {
    const resultPosition = func();
    if (resultPosition) {
      onPositionChange(resultPosition);
    }
    return resultPosition;
  };

  return (
    <form className="calc-form">
      <span>{title}</span>

      <Field
        label="X"
        numeric
        value={x}
        onCommit={(value) =>
          computationHandle(() => getPositionFromCartesian(value, y, z))
        }
      />
      <Field
        label="Y"
        numeric
        value={y}
        onCommit={(value) =>
          computationHandle(() => getPositionFromCartesian(x, value, z))
        }
      />
      <Field
        label="Z"
        numeric
        value={z}
        onCommit={(value) =>
          computationHandle(() => getPositionFromCartesian(x, y, value))
        }
      />

      <Field
        label="Latitude"
        numeric
        value={(latitude.value ?? 0).toFixed(
          DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE
        )}
        onCommit={createNumberHandler((value) =>
          computationHandle(() =>
            getPositionFromGeodetic(value, longitude.value ?? 0, height)
          )
        )}
      />
      <Field
        label="Longitude"
        numeric
        value={(longitude.value ?? 0).toFixed(
          DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE
        )}
        onCommit={createNumberHandler((value) =>
          computationHandle(() =>
            getPositionFromGeodetic(latitude.value ?? 0, value, height)
          )
        )}
      />
      <Field
        label="Height"
        numeric
        value={height.toFixed(DECIMAL_PLACES_FOR_HEIGHT)}
        onCommit={createNumberHandler((value) =>
          computationHandle(() =>
            getPositionFromGeodetic(
              latitude.value ?? 0,
              longitude.value ?? 0,
              value
            )
          )
        )}
      />

      <MaskedField
        label="Latitude"
        value={latitudeString}
        mask={`00º 00' 00.000" N`}
        onCommit={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(value, longitudeString, heightString)
          )
        }
      />
      <MaskedField
        label="Longitude"
        value={longitudeString}
        mask={`000º 00' 00.000" E`}
        onCommit={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(latitudeString, value, heightString)
          )
        }
      />
    </form>
  );
}
