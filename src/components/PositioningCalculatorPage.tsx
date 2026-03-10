import { lazy, Suspense, useEffect, useState } from 'react';
import type { Position } from '../types/position';
import { getPositionFromGeodetic } from '../util/positioning';
import PositionForm from './PositionForm/PositionForm';
import AERForm from './AERForm/AERForm';
import ENUForm from './ENUForm/ENUForm';

const PositionMap = lazy(() => import('./PositionMap'));

export default function PositioningCalculatorPage() {
  const [position, setPosition] = useState<Position>([
    4263871.9243, 722591.1075, 4672986.8878,
  ]);
  const [refPosition, setRefPosition] = useState<Position>([
    4253871.9243, 712591.1075, 4072986.8878,
  ]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude, altitude } }) =>
          setRefPosition(
            getPositionFromGeodetic(latitude, longitude, altitude ?? 0)
          )
      );
    }
  }, []);

  return (
    <section className="flex flex-wrap gap-6">
      <PositionForm
        title="Position"
        position={position}
        onPositionChange={setPosition}
      />
      <PositionForm
        title="Reference Position"
        position={refPosition}
        onPositionChange={setRefPosition}
      />
      <AERForm
        title="AER coordinates"
        position={position}
        refPosition={refPosition}
      />
      <ENUForm
        title="ENU coordinates"
        position={position}
        refPosition={refPosition}
      />
      {mounted && (
        <Suspense>
          <PositionMap position={position} refPosition={refPosition} />
        </Suspense>
      )}
    </section>
  );
}
