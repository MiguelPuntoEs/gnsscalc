import { useENUCalculator } from '../../hooks/positioning';
import CalculatorForm from '../CalculatorForm';
import LabelInput from '../LabelInput';

export default function ENUForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}) {
  const { deltaE, deltaN, deltaU } = useENUCalculator(position, refPosition);
  return (
    <CalculatorForm>
      <div />
      <span>{title}</span>

      <LabelInput
        label="&Delta;E"
        type="number"
        value={deltaE}
        readOnly
        disabled
        // onCompute={(value) => computationHandle(() => true)}
      />
      <LabelInput
        label="&Delta;N"
        type="number"
        value={deltaN}
        readOnly
        disabled
        // onCompute={(value) => computationHandle(() => true)}
      />
      <LabelInput
        label="&Delta;U"
        type="number"
        value={deltaU}
        readOnly
        disabled
        // onCompute={(value) => computationHandle(() => true)}
      />
    </CalculatorForm>
  );
}
