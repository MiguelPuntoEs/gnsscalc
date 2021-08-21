import { useAerCalculator } from '../../hooks/positioning';
import CalculatorForm from '../CalculatorForm';
import LabelInput from '../LabelInput';
import styles from './aerform.module.scss';

export default function AERForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}) {
  const { elevationDeg, azimuthDeg, slant } = useAerCalculator(
    position,
    refPosition
  );

  return (
    <CalculatorForm className={styles.aerCoordinates}>
      <div />
      <span>{title}</span>

      <LabelInput
        label="&theta;"
        type="number"
        value={elevationDeg}
        readOnly
        disabled
      />

      <LabelInput
        label="&phi;"
        type="number"
        value={azimuthDeg}
        readOnly
        disabled
      />
      <LabelInput label="&rho;" type="number" value={slant} readOnly disabled />
    </CalculatorForm>
  );
}
