import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import type { Position } from '../types/position';
import { usePositionCalculator, useAerCalculator, useENUCalculator, useDistanceCalculator } from '../hooks/positioning';

import PositionForm from './PositionForm/PositionForm';
import AERForm from './AERForm/AERForm';
import ENUForm from './ENUForm/ENUForm';
import DistanceForm from './DistanceForm/DistanceForm';

const PositionMap = lazy(() => import('./PositionMap'));

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const hash = `p=${pos.map(v => v.toFixed(1)).join(',')}&r=${ref.map(v => v.toFixed(1)).join(',')}`;
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

  const posGeo = usePositionCalculator(position);
  const refGeo = usePositionCalculator(refPosition);
  const aer = useAerCalculator(position, refPosition);
  const enu = useENUCalculator(position, refPosition);
  const dist = useDistanceCalculator(position, refPosition);

  const buildExportData = useCallback(() => ({
    position: {
      ecef: { x: position[0], y: position[1], z: position[2] },
      geodetic: { latitude: posGeo.latitude.value, longitude: posGeo.longitude.value, height: posGeo.height },
    },
    reference: {
      ecef: { x: refPosition[0], y: refPosition[1], z: refPosition[2] },
      geodetic: { latitude: refGeo.latitude.value, longitude: refGeo.longitude.value, height: refGeo.height },
    },
    aer: { elevation_deg: aer.elevationDeg, azimuth_deg: aer.azimuthDeg, slant_m: aer.slant },
    enu: { east_m: enu.deltaE, north_m: enu.deltaN, up_m: enu.deltaU },
    distances: {
      orthodromic_m: dist.orthodromic,
      loxodromic_m: dist.loxodromic,
      euclidean_m: dist.euclidean,
      initial_bearing_deg: dist.initialBearing,
      final_bearing_deg: dist.finalBearing,
      rhumb_bearing_deg: dist.rhumbBearing,
      midpoint: { latitude: dist.midpoint[0], longitude: dist.midpoint[1] },
    },
  }), [position, refPosition, posGeo, refGeo, aer, enu, dist]);

  const handleExportJSON = useCallback(() => {
    const data = buildExportData();
    downloadBlob(JSON.stringify(data, null, 2), 'positioning-results.json', 'application/json');
  }, [buildExportData]);

  const handleExportCSV = useCallback(() => {
    const d = buildExportData();
    const rows = [
      ['field', 'value'],
      ['position_ecef_x', d.position.ecef.x],
      ['position_ecef_y', d.position.ecef.y],
      ['position_ecef_z', d.position.ecef.z],
      ['position_latitude', d.position.geodetic.latitude],
      ['position_longitude', d.position.geodetic.longitude],
      ['position_height', d.position.geodetic.height],
      ['reference_ecef_x', d.reference.ecef.x],
      ['reference_ecef_y', d.reference.ecef.y],
      ['reference_ecef_z', d.reference.ecef.z],
      ['reference_latitude', d.reference.geodetic.latitude],
      ['reference_longitude', d.reference.geodetic.longitude],
      ['reference_height', d.reference.geodetic.height],
      ['elevation_deg', d.aer.elevation_deg],
      ['azimuth_deg', d.aer.azimuth_deg],
      ['slant_m', d.aer.slant_m],
      ['enu_east_m', d.enu.east_m],
      ['enu_north_m', d.enu.north_m],
      ['enu_up_m', d.enu.up_m],
      ['orthodromic_m', d.distances.orthodromic_m],
      ['loxodromic_m', d.distances.loxodromic_m],
      ['euclidean_m', d.distances.euclidean_m],
      ['initial_bearing_deg', d.distances.initial_bearing_deg],
      ['final_bearing_deg', d.distances.final_bearing_deg],
      ['rhumb_bearing_deg', d.distances.rhumb_bearing_deg],
      ['midpoint_latitude', d.distances.midpoint.latitude],
      ['midpoint_longitude', d.distances.midpoint.longitude],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    downloadBlob(csv, 'positioning-results.csv', 'text/csv');
  }, [buildExportData]);

  return (
    <section className="flex flex-col gap-4">
      {/* Export buttons */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleExportCSV}
          className="text-[10px] px-2 py-1 rounded border border-border/60 text-fg/50 hover:text-fg hover:bg-fg/[0.03] transition-colors"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={handleExportJSON}
          className="text-[10px] px-2 py-1 rounded border border-border/60 text-fg/50 hover:text-fg hover:bg-fg/[0.03] transition-colors"
        >
          Export JSON
        </button>
      </div>

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
