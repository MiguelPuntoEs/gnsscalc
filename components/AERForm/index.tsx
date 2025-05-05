import { Position } from '@/types/position';
import { useAerCalculator } from '../../hooks/positioning';
import CalculatorForm from '../CalculatorForm';
import LabelInput from '../LabelInput';
import styles from './aerform.module.scss';

export default function AERForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}: {title: string; position: Position; refPosition: Position}) {
  const aerPosition = useAerCalculator(position, refPosition);

  const elevationDeg = aerPosition.elevationDeg.toFixed(5);
  const azimuthDeg = aerPosition.azimuthDeg.toFixed(5);
  const slant = aerPosition.slant.toFixed(5);

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
