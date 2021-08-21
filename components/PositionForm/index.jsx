import {
  DECIMAL_PLACES_FOR_CARTESIAN,
  DECIMAL_PLACES_FOR_HEIGHT,
  DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE,
} from '../../constants/position';
import { usePositionCalculator } from '../../hooks/positioning';
import {
  formatLatitudeDegMinSecs,
  formatLongitudeDegMinSecs,
} from '../../util/formats';
import {
  getPositionFromCartesian,
  getPositionFromGeodetic,
  getPositionFromGeodeticString,
} from '../../util/positioning';
import CalculatorForm from '../CalculatorForm';
import LabelInput from '../LabelInput';

export default function PositionForm({
  position = [4263871.9243, 722591.1075, 4672988.8878],
  onPositionChange,
  title = '',
}) {
  const { latitude, longitude, height } = usePositionCalculator(position);

  const x = position[0].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const y = position[1].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const z = position[2].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);

  const latitudeString = formatLatitudeDegMinSecs(latitude);
  const longitudeString = formatLongitudeDegMinSecs(longitude);

  const computationHandle = (func) => {
    const resultPosition = func();
    if (resultPosition) {
      onPositionChange(resultPosition);
    }
    return resultPosition;
  };

  return (
    <CalculatorForm>
      <div />
      <span>{title}</span>

      <LabelInput
        label="X"
        type="number"
        value={x}
        onCompute={(value) =>
          computationHandle(() => getPositionFromCartesian(value, y, z))
        }
      />
      <LabelInput
        label="Y"
        type="number"
        value={y}
        onCompute={(value) =>
          computationHandle(() => getPositionFromCartesian(x, value, z))
        }
      />
      <LabelInput
        label="Z"
        type="number"
        value={z}
        onCompute={(value) =>
          computationHandle(() => getPositionFromCartesian(x, y, value))
        }
      />

      <LabelInput
        label="Latitude"
        type="number"
        value={latitude.value.toFixed(DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(value, longitude.value, height)
          )
        }
      />
      <LabelInput
        label="Longitude"
        type="number"
        value={longitude.value.toFixed(DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(latitude.value, value, height)
          )
        }
      />
      <LabelInput
        label="Height"
        type="number"
        value={height.toFixed(DECIMAL_PLACES_FOR_HEIGHT)}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodetic(latitude.value, longitude.value, value)
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
            getPositionFromGeodeticString(value, longitudeString, height)
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
            getPositionFromGeodeticString(latitudeString, value, height)
          )
        }
      />
    </CalculatorForm>
  );
}
