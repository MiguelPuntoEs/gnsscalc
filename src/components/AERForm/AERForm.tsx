import type { Position } from '../../types/position';
import { useAerCalculator } from '../../hooks/positioning';
import CopyableInput from '../CopyableInput';

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
    refPosition,
  );

  return (
    <div className="card-output flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg m-0">{title}</h3>
      <div className="card-fields">
        <span title="Elevation angle (degrees)">&theta;</span>
        <CopyableInput value={`${elevationDeg.toFixed(5)}°`} />

        <span title="Azimuth angle (degrees)">&phi;</span>
        <CopyableInput value={`${azimuthDeg.toFixed(5)}°`} />

        <span title="Slant range (meters)">&rho;</span>
        <CopyableInput value={`${slant.toFixed(3)} m`} />
      </div>
    </div>
  );
}
