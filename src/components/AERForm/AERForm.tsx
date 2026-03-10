import type { Position } from '../../types/position';
import { useAerCalculator } from '../../hooks/positioning';

export default function AERForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}: {
  title: string;
  position: Position;
  refPosition: Position;
}) {
  const { elevationDeg, azimuthDeg, slant } = useAerCalculator(
    position,
    refPosition
  );

  return (
    <form className="calc-form self-start">
      <span>{title}</span>

      <label>&theta;</label>
      <input value={elevationDeg.toFixed(5)} readOnly disabled />

      <label>&phi;</label>
      <input value={azimuthDeg.toFixed(5)} readOnly disabled />

      <label>&rho;</label>
      <input value={slant.toFixed(5)} readOnly disabled />
    </form>
  );
}
