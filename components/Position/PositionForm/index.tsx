import Form from "components/Form";
import LabelInput from "components/LabelInput";
import { DECIMAL_PLACES_FOR_CARTESIAN, DECIMAL_PLACES_FOR_HEIGHT, DECIMAL_PLACES_FOR_LATITUDE_LONGITUDE } from "constants/position";
import { usePositionCalculator } from "hooks/positioning";
import { Position } from "types/position";
import { formatLatitudeDegMinSecs, formatLongitudeDegMinSecs } from "util/formats";
import { getPositionFromCartesian, getPositionFromGeodetic, getPositionFromGeodeticString } from "util/positioning";

type Props = {
  position: Position;
  title: string;
  onPositionChange: (p: Position) => void;
}

const PositionForm = ({ title, position, onPositionChange }: Props) => {
  const calculator = usePositionCalculator(position);

  if (!calculator) {
    return null;
  }

  const { latitude, longitude, height } = calculator;

  const x = position[0].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const y = position[1].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);
  const z = position[2].toFixed(DECIMAL_PLACES_FOR_CARTESIAN);

  const latitudeString = formatLatitudeDegMinSecs(latitude);
  const longitudeString = formatLongitudeDegMinSecs(longitude);

  console.log({ longitudeString })

  const computationHandle = (func: () => readonly [number, number, number] | undefined) => {
    const resultPosition = func();
    if (resultPosition) {
      onPositionChange(resultPosition as Position);
    }
    return Boolean(resultPosition);
  };


  return (
    <Form title={title}>
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
        value={latitudeString}
        maskOptions={{
          mask: '99º 99\' 99.999" N',
          definitions: { 9: '[0-9]', N: /[NS]/i },
        }}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(value, longitudeString, height)
          )
        }
      />

      <LabelInput
        label="Longitude"
        value={longitudeString}
        maskOptions={{
          mask: '199º 99\' 99.999" E',
          definitions: { 1: '[0-1]', 9: '[0-9]', E: /[EW]/i },
        }}
        onCompute={(value) =>
          computationHandle(() =>
            getPositionFromGeodeticString(latitudeString, value, height)
          )
        }
      />
    </Form>
  )
};

export default PositionForm;