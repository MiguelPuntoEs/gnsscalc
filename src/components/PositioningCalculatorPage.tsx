import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import type { Position } from '../types/position';

import PositionForm from './PositionForm/PositionForm';
import AERForm from './AERForm/AERForm';
import ENUForm from './ENUForm/ENUForm';
import DistanceForm from './DistanceForm/DistanceForm';

const PositionMap = lazy(() => import('./PositionMap'));

const DEFAULT_POS: Position = [4263871.9243, 722591.1075, 4672986.8878];
const DEFAULT_REF: Position = [4837068.7779, -270548.3974, 4134608.7081];

function parseHash(): { pos: Position; ref: Position } | null {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const p = params.get('p')?.split(',').map(Number);
    const r = params.get('r')?.split(',').map(Number);
    if (p?.length === 3 && r?.length === 3 && p.every(isFinite) && r.every(isFinite)) {
      return { pos: p as Position, ref: r as Position };
    }
  } catch { /* ignore malformed hash */ }
  return null;
}

function writeHash(pos: Position, ref: Position) {
  const hash = `p=${pos.map(v => v.toFixed(4)).join(',')}&r=${ref.map(v => v.toFixed(4)).join(',')}`;
  window.history.replaceState(null, '', `#${hash}`);
}

export default function PositioningCalculatorPage() {
  const [position, setPosition] = useState<Position>(() => {
    return parseHash()?.pos ?? DEFAULT_POS;
  });
  const [refPosition, setRefPosition] = useState<Position>(() => {
    return parseHash()?.ref ?? DEFAULT_REF;
  });

  // Sync state to URL hash
  useEffect(() => {
    writeHash(position, refPosition);
  }, [position, refPosition]);

  const handleSwap = useCallback(() => {
    setPosition(refPosition);
    setRefPosition(position);
  }, [position, refPosition]);

  return (
    <section className="flex flex-col gap-4">
      {/* Row 1: Position inputs side by side */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
        <PositionForm
          title="Position"
          position={position}
          onPositionChange={setPosition}
        />

        {/* Swap button */}
        <button
          type="button"
          title="Swap positions"
          className="hidden md:flex self-center mt-8 p-2 rounded-full bg-bg-raised border border-border/60 text-fg/50 hover:text-fg hover:border-fg/50 transition-colors"
          onClick={handleSwap}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Mobile swap */}
        <button
          type="button"
          className="md:hidden btn-secondary flex items-center justify-center gap-1.5 text-xs"
          onClick={handleSwap}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
            <path fillRule="evenodd" d="M13.2 2.24a.75.75 0 00.04 1.06l2.1 1.95H6.75a.75.75 0 000 1.5h8.59l-2.1 1.95a.75.75 0 101.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 00-1.06.04zm-6.4 8a.75.75 0 00-1.06-.04l-3.5 3.25a.75.75 0 000 1.1l3.5 3.25a.75.75 0 101.02-1.1l-2.1-1.95h8.59a.75.75 0 000-1.5H4.66l2.1-1.95a.75.75 0 00.04-1.06z" clipRule="evenodd" />
          </svg>
          Swap positions
        </button>

        <PositionForm
          title="Reference Position"
          position={refPosition}
          onPositionChange={setRefPosition}
        />
      </div>

      {/* Row 2: Map + output cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
        <Suspense
          fallback={
            <div
              className="rounded-xl border border-border/60 bg-bg-raised animate-pulse"
              style={{ height: 350 }}
            />
          }
        >
          <PositionMap position={position} refPosition={refPosition} />
        </Suspense>

        <div className="flex flex-col gap-4 md:w-56">
          <AERForm
            title="AER"
            position={position}
            refPosition={refPosition}
          />
          <ENUForm
            title="ENU"
            position={position}
            refPosition={refPosition}
          />
        </div>
      </div>

      {/* Row 3: Distance full width */}
      <DistanceForm
        title="Distances & bearings"
        position={position}
        refPosition={refPosition}
      />
    </section>
  );
}
