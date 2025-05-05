import { Position } from '@/types/position';
import { useENUCalculator } from '../../hooks/positioning';
import CalculatorForm from '../CalculatorForm';
import LabelInput from '../LabelInput';
import styles from './enuform.module.scss';

export default function ENUForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}: {title: string; position: Position; refPosition: Position}) {
  const deltaENU = useENUCalculator(position, refPosition);
  const deltaE = deltaENU.deltaE.toFixed(5);
  const deltaN = deltaENU.deltaN.toFixed(5);
  const deltaU = deltaENU.deltaU.toFixed(5);

  return (
    <CalculatorForm className={styles.enuCoordinates}>
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
