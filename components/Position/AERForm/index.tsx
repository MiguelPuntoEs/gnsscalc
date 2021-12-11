import Form from "components/Form";
import LabelInput from "components/LabelInput";
import { useAerCalculator } from "hooks/positioning";
import { Position } from "types/position";

type Props = {
  position: Position;
  refPosition: Position
}

const AERForm = ({ position, refPosition }: Props) => {
  const aerPosition = useAerCalculator(position, refPosition);

  if (!aerPosition) {
    return null;
  }

  const elevationDeg = aerPosition.elevationDeg.toFixed(5);
  const azimuthDeg = aerPosition.azimuthDeg.toFixed(5);
  const slant = aerPosition.slant.toFixed(5);

  return (
    <Form title="AER coordinates">
      <LabelInput
        label="&theta;"
        type="number"
        value={elevationDeg}
        readOnly
        disabled
        small
      />

      <LabelInput
        label="&phi;"
        type="number"
        value={azimuthDeg}
        readOnly
        disabled
        small
      />
      <LabelInput
        label="&rho;"
        type="number"
        value={slant}
        readOnly
        disabled
        small
      />
    </Form>
  )
};

export default AERForm;