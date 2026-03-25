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
        <span title="East offset (meters)">&Delta;E</span>
        <CopyableInput value={`${deltaE.toFixed(3)} m`} />

        <span title="North offset (meters)">&Delta;N</span>
        <CopyableInput value={`${deltaN.toFixed(3)} m`} />

        <span title="Up offset (meters)">&Delta;U</span>
        <CopyableInput value={`${deltaU.toFixed(3)} m`} />
      </div>
    </div>
  );
}
