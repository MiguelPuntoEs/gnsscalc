import type { Position } from '../../types/position';
import { useENUCalculator } from '../../hooks/positioning';

export default function ENUForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}: {
  title: string;
  position: Position;
  refPosition: Position;
}) {
  const { deltaE, deltaN, deltaU } = useENUCalculator(position, refPosition);

  return (
    <form className="calc-form self-start">
      <span>{title}</span>

      <label>&Delta;E</label>
      <input value={deltaE.toFixed(5)} readOnly disabled />

      <label>&Delta;N</label>
      <input value={deltaN.toFixed(5)} readOnly disabled />

      <label>&Delta;U</label>
      <input value={deltaU.toFixed(5)} readOnly disabled />
    </form>
  );
}
