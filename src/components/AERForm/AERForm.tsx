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
    refPosition
  );

  return (
    <div className="card-output flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg m-0">{title}</h3>
      <div className="card-fields">
        <label title="Elevation angle (degrees)">&theta;</label>
        <CopyableInput value={`${elevationDeg.toFixed(5)}°`} />

        <label title="Azimuth angle (degrees)">&phi;</label>
        <CopyableInput value={`${azimuthDeg.toFixed(5)}°`} />

        <label title="Slant range (meters)">&rho;</label>
        <CopyableInput value={`${slant.toFixed(3)} m`} />
      </div>
    </div>
  );
}
