import Form from "components/Form";
import LabelInput from "components/LabelInput";
import { useENUCalculator } from "hooks/positioning";
import { Position } from "types/position";

type Props = {
  position: Position;
  refPosition: Position;
}

const ENUForm = ({ position, refPosition }: Props) => {
  const deltaENU = useENUCalculator(position, refPosition);

  if (!deltaENU) {
    return null;
  }

  const deltaE = deltaENU.deltaE.toFixed(5);
  const deltaN = deltaENU.deltaN.toFixed(5);
  const deltaU = deltaENU.deltaU.toFixed(5);

  return (
    <Form title="ENU coordinates">
      <LabelInput
        label="&Delta;E"
        type="number"
        value={deltaE}
        readOnly
        disabled
        small
      />
      <LabelInput
        label="&Delta;N"
        type="number"
        value={deltaN}
        readOnly
        disabled
        small
      />
      <LabelInput
        label="&Delta;U"
        type="number"
        value={deltaU}
        readOnly
        disabled
        small
      />
    </Form>
  )
};

export default ENUForm;