import { Position } from '@/types/position';
import {
  DECIMAL_PLACES_FOR_CARTESIAN,
  DECIMAL_PLACES_FOR_HEIGHT,
  DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE,
} from '@/constants/position';
import { usePositionCalculator } from '@/hooks/positioning';
import {
  formatLatitudeDegMinSecs,
  formatLongitudeDegMinSecs,
} from '@/util/formats';
import {
  getPositionFromCartesian,
  getPositionFromGeodetic,
  getPositionFromGeodeticString,
} from '@/util/positioning';
import CalculatorForm from '@/components/CalculatorForm';
import LabelInput from '@/components/LabelInput';

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

  const computationHandle = (func) => {
    const resultPosition = func();
    if (resultPosition) {
      onPositionChange(resultPosition);
    }
    return resultPosition;
  };

  return (
    <CalculatorForm className="">
      <div />
      <span>{title}</span>

      <LabelInput
        label="X"
        type="number"
        value={x}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromCartesian(value.toString(), y, z)
          )
        }
      />
      <LabelInput
        label="Y"
        type="number"
        value={y}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromCartesian(x, value.toString(), z)
          )
        }
      />
      <LabelInput
        label="Z"
        type="number"
        value={z}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromCartesian(x, y, value.toString())
          )
        }
      />

      <LabelInput
        label="Latitude"
        type="number"
        value={latitude.value.toFixed(DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(
              Number.parseFloat(value.toString()),
              longitude.value,
              height
            )
          )
        }
      />
      <LabelInput
        label="Longitude"
        type="number"
        value={longitude.value.toFixed(DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(
              latitude.value,
              Number.parseFloat(value.toString()),
              height
            )
          )
        }
      />
      <LabelInput
        label="Height"
        type="number"
        value={height.toFixed(DECIMAL_PLACES_FOR_HEIGHT)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(
              latitude.value,
              longitude.value,
              Number.parseFloat(value.toString())
            )
          )
        }
      />

      <LabelInput
        label="Latitude"
        type="number"
        value={latitudeString}
        maskOptions={{
          mask: '99º 99\' 99.999" N',
          formatChars: { 9: '[0-9]', N: '[N,S]' },
        }}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(
              value.toString(),
              longitudeString,
              heightString
            )
          )
        }
      />

      <LabelInput
        label="Longitude"
        type="number"
        value={longitudeString}
        maskOptions={{
          mask: '199º 99\' 99.999" E',
          formatChars: { 1: '[0-1]', 9: '[0-9]', E: '[E,W]' },
        }}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(
              latitudeString,
              value.toString(),
              heightString
            )
          )
        }
      />
    </CalculatorForm>
  );
}
