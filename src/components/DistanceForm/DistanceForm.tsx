import type { Position } from '../../types/position';
import { useDistanceCalculator } from '../../hooks/positioning';
import CopyableInput from '../CopyableInput';

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(3)} km`;
  }
  return `${meters.toFixed(3)} m`;
}

function normalizeBearing(deg: number): string {
  return (((deg % 360) + 360) % 360).toFixed(4);
}

export default function DistanceForm({
  title = '',
  position = [1, 0, 0],
  refPosition = [1, 0, 0],
}: {
  title: string;
  position: Position;
  refPosition: Position;
}) {
  const {
    orthodromic,
    loxodromic,
    euclidean,
    initialBearing,
    finalBearing,
    rhumbBearing,
    midpoint,
    horizonA,
    horizonB,
  } = useDistanceCalculator(position, refPosition);

  return (
    <div className="card-output flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-fg m-0">{title}</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
        <div className="card-fields">
          <span className="section-label">Distances</span>

          <span title="Orthodromic (great-circle) distance on the WGS84 ellipsoid">
            Orthodromic
          </span>
          <CopyableInput value={formatDistance(orthodromic)} />

          <span title="Loxodromic (rhumb line) distance — constant bearing path">
            Loxodromic
          </span>
          <CopyableInput value={formatDistance(loxodromic)} />

          <span title="3D Euclidean straight-line distance through the Earth">
            Euclidean
          </span>
          <CopyableInput value={formatDistance(euclidean)} />
        </div>

        <div className="card-fields">
          <span className="section-label">Bearings</span>

          <span title="Initial bearing of the great-circle path (degrees)">
            Initial
          </span>
          <CopyableInput value={`${normalizeBearing(initialBearing)}°`} />

          <span title="Final bearing of the great-circle path (degrees)">
            Final
          </span>
          <CopyableInput value={`${normalizeBearing(finalBearing)}°`} />

          <span title="Constant bearing along the rhumb line (degrees)">
            Rhumb
          </span>
          <CopyableInput value={`${normalizeBearing(rhumbBearing)}°`} />
        </div>

        <div className="card-fields">
          <span className="section-label">Misc</span>

          <span title="Geographic midpoint along the great-circle arc">
            Midpoint
          </span>
          <CopyableInput
            value={`${midpoint[0].toFixed(6)}°, ${midpoint[1].toFixed(6)}°`}
          />

          <span title="Geometric horizon distance from reference position height">
            Horizon (ref)
          </span>
          <CopyableInput value={formatDistance(horizonA)} />

          <span title="Geometric horizon distance from target position height">
            Horizon (pos)
          </span>
          <CopyableInput value={formatDistance(horizonB)} />
        </div>
      </div>
    </div>
  );
}
