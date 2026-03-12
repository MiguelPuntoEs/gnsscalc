import type { Position } from '../../types/position';
import { useENUCalculator } from '../../hooks/positioning';
import CopyableInput from '../CopyableInput';

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
    <div className="card-output flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg m-0">{title}</h3>
      <div className="card-fields">
        <label title="East offset (meters)">&Delta;E</label>
        <CopyableInput value={`${deltaE.toFixed(3)} m`} />

        <label title="North offset (meters)">&Delta;N</label>
        <CopyableInput value={`${deltaN.toFixed(3)} m`} />

        <label title="Up offset (meters)">&Delta;U</label>
        <CopyableInput value={`${deltaU.toFixed(3)} m`} />
      </div>
    </div>
  );
}
