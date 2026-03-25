import { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import type { EpochSkyData, SatAzEl, AllPositionsData } from 'gnss-js/orbit';
import { computeDop } from 'gnss-js/orbit';
import { systemName, systemCmp } from 'gnss-js/rinex';
import type { EpochGrid } from '../util/epoch-grid';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import { DEFAULT_ELEV_MASK_DEG } from 'gnss-js/constants';
import PolarSkyPlot from './PolarSkyPlot';
import type { TrackPoint, TrackSegments } from './PolarSkyPlot';
import GroundTrackMap from './GroundTrackMap';
import DopTimeline from './DopTimeline';
import ElevationHeatmap from './ElevationHeatmap';
import ElevationCn0 from './ElevationCn0';

export default function SkyPlotCharts({
  allPositions,
  observedPrns,
  rxPos,
  grid,
}: {
  allPositions: AllPositionsData;
  observedPrns?: Set<string>[] | null;
  rxPos?: [number, number, number];
  grid?: EpochGrid;
}) {
  const { prns, times, positions } = allPositions;
  const numEpochs = times.length;

  const hasRxPos =
    !!rxPos && (rxPos[0] !== 0 || rxPos[1] !== 0 || rxPos[2] !== 0);
  const hasObs = !!observedPrns && observedPrns.length > 0;

  const [elevMaskDeg, setElevMaskDeg] = useState(DEFAULT_ELEV_MASK_DEG);
  const elevMaskRad = (elevMaskDeg * Math.PI) / 180;

  const [epochIdx, setEpochIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  const allSystems = useMemo(() => {
    const set = new Set<string>();
    for (const prn of prns) set.add(prn.charAt(0));
    return [...set].sort(systemCmp);
  }, [prns]);

  const [enabledSystems, setEnabledSystems] = useState<Set<string>>(
    () => new Set(allSystems),
  );
  useEffect(() => {
    setEnabledSystems(new Set(allSystems));
  }, [allSystems]);

  const toggleSystem = useCallback((sys: string) => {
    setEnabledSystems((prev) => {
      const next = new Set(prev);
      if (next.has(sys)) next.delete(sys);
      else next.add(sys);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!playing) {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (ts - lastFrameRef.current > 50) {
        lastFrameRef.current = ts;
        setEpochIdx((prev) => (prev + 1) % numEpochs);
      }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [playing, numEpochs]);

  const fullGroundTracks = useMemo(() => {
    const segs: TrackSegments = {};
    for (const prn of prns) {
      if (!enabledSystems.has(prn.charAt(0))) continue;
      const pts = positions[prn]!;
      segs[prn] = [];
      let currentSeg: TrackPoint[] | null = null;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (!pt) {
          currentSeg = null;
          continue;
        }
        if (!currentSeg) {
          currentSeg = [];
          segs[prn].push(currentSeg);
        }
        currentSeg.push({ az: 0, el: 0, lat: pt.lat, lon: pt.lon, epoch: i });
      }
    }
    return segs;
  }, [prns, positions, enabledSystems]);

  const { skyTracks, skyCurrentPositions, skyCurrentObserved } = useMemo(() => {
    if (!hasRxPos)
      return {
        skyTracks: {} as TrackSegments,
        skyCurrentPositions: {} as Record<string, SatAzEl>,
        skyCurrentObserved: new Set<string>(),
      };
    const segs: TrackSegments = {};
    const wasAbove: Record<string, boolean> = {};
    for (let i = 0; i <= epochIdx && i < numEpochs; i++) {
      const aboveNow = new Set<string>();
      for (const prn of prns) {
        if (!enabledSystems.has(prn.charAt(0))) continue;
        const pt = positions[prn]![i];
        if (!pt || pt.el < elevMaskRad) continue;
        aboveNow.add(prn);
        if (!segs[prn]) segs[prn] = [];
        if (!wasAbove[prn]) segs[prn].push([]);
        segs[prn].at(-1)!.push({
          az: pt.az,
          el: pt.el,
          lat: pt.lat,
          lon: pt.lon,
          epoch: i,
        });
      }
      for (const prn of Object.keys(segs)) {
        wasAbove[prn] = aboveNow.has(prn);
      }
    }

    const cur: Record<string, SatAzEl> = {};
    const obs = new Set<string>();
    if (epochIdx >= 0 && epochIdx < numEpochs) {
      const epochObs = observedPrns?.[epochIdx];
      for (const prn of prns) {
        if (!enabledSystems.has(prn.charAt(0))) continue;
        const pt = positions[prn]![epochIdx];
        if (!pt || pt.el < elevMaskRad) continue;
        cur[prn] = { prn, az: pt.az, el: pt.el, lat: pt.lat, lon: pt.lon };
        if (epochObs?.has(prn)) obs.add(prn);
      }
    }
    return {
      skyTracks: segs,
      skyCurrentPositions: cur,
      skyCurrentObserved: obs,
    };
  }, [
    epochIdx,
    prns,
    positions,
    enabledSystems,
    hasRxPos,
    observedPrns,
    numEpochs,
    elevMaskRad,
  ]);

  const { groundTracks, groundCurrentPositions } = useMemo(() => {
    const sliced: TrackSegments = {};
    for (const [prn, segments] of Object.entries(fullGroundTracks)) {
      const prnSegs: TrackPoint[][] = [];
      for (const seg of segments) {
        if (seg[0]!.epoch > epochIdx) break;
        if (seg.at(-1)!.epoch <= epochIdx) {
          prnSegs.push(seg);
        } else {
          let end = seg.length;
          for (let j = 0; j < seg.length; j++) {
            if (seg[j]!.epoch > epochIdx) {
              end = j;
              break;
            }
          }
          if (end > 0) prnSegs.push(seg.slice(0, end));
          break;
        }
      }
      if (prnSegs.length > 0) sliced[prn] = prnSegs;
    }

    const cur: Record<string, SatAzEl> = {};
    for (const prn of prns) {
      if (!enabledSystems.has(prn.charAt(0))) continue;
      const pt = positions[prn]?.[epochIdx];
      if (pt) cur[prn] = { prn, az: 0, el: 0, lat: pt.lat, lon: pt.lon };
    }
    return { groundTracks: sliced, groundCurrentPositions: cur };
  }, [fullGroundTracks, epochIdx, prns, positions, enabledSystems]);

  const epochSkyData = useMemo<EpochSkyData[] | null>(() => {
    if (!hasRxPos || !hasObs) return null;
    const result: EpochSkyData[] = [];
    for (let i = 0; i < numEpochs; i++) {
      const sats: SatAzEl[] = [];
      const epochObs = observedPrns[i];
      if (epochObs) {
        for (const prn of epochObs) {
          const pt = positions[prn]?.[i];
          if (!pt || pt.el < elevMaskRad) continue;
          sats.push({ prn, az: pt.az, el: pt.el, lat: pt.lat, lon: pt.lon });
        }
      }
      const dop = computeDop(sats);
      result.push({ time: times[i]!, satellites: sats, dop });
    }
    return result;
  }, [
    positions,
    times,
    observedPrns,
    hasRxPos,
    hasObs,
    numEpochs,
    elevMaskRad,
  ]);

  const currentTime = useMemo(() => {
    if (epochIdx < 0 || epochIdx >= numEpochs) return '';
    const d = new Date(times[epochIdx]!);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`;
  }, [times, epochIdx, numEpochs]);

  const rxGeo = useMemo(() => {
    if (!rxPos) return null;
    const [x, y, z] = rxPos;
    if (x === 0 && y === 0 && z === 0) return null;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    return { lat, lon };
  }, [rxPos]);

  const satCount = Object.keys(skyCurrentPositions).length;

  if (numEpochs === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg/50">
            {hasRxPos ? 'Sky plot' : 'Satellite orbits'}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-fg/40 font-mono">
            {hasRxPos && (
              <>
                <span>{satCount} SVs</span>
                <span className="text-fg/20">|</span>
              </>
            )}
            <span>{currentTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {allSystems.map((sys) => {
            const color = SYSTEM_COLORS[sys] ?? '#7c8aff';
            const enabled = enabledSystems.has(sys);
            return (
              <label
                key={sys}
                className="flex items-center gap-1.5 cursor-pointer select-none"
              >
                <span
                  className="size-3 rounded-sm border flex items-center justify-center transition-colors"
                  style={{
                    borderColor: enabled ? color : 'rgba(255,255,255,0.12)',
                    backgroundColor: enabled ? color : 'transparent',
                  }}
                >
                  {enabled && (
                    <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
                      <path
                        d="M2.5 6l2.5 2.5 4.5-5"
                        stroke="#1a1a24"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleSystem(sys)}
                  className="sr-only"
                />
                <span
                  className="text-[11px] text-fg/50"
                  style={{ color: enabled ? color : undefined }}
                >
                  {systemName(sys)}
                </span>
              </label>
            );
          })}
        </div>

        {hasRxPos && (
          <PolarSkyPlot
            tracks={skyTracks}
            currentPositions={skyCurrentPositions}
            observedPrns={skyCurrentObserved}
            elevMaskDeg={elevMaskDeg}
          />
        )}

        {hasRxPos && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-fg/40 whitespace-nowrap">
              Elev. mask
            </span>
            <div
              role="slider"
              aria-valuemin={0}
              aria-valuemax={45}
              aria-valuenow={elevMaskDeg}
              aria-label="Elevation mask"
              tabIndex={0}
              className="flex-1 relative h-5 flex items-center group cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width),
                );
                setElevMaskDeg(Math.round(pct * 45));
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
                  setElevMaskDeg((v) => Math.min(45, v + 1));
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
                  setElevMaskDeg((v) => Math.max(0, v - 1));
              }}
            >
              <div className="absolute inset-x-0 h-[3px] rounded-full bg-border/40" />
              <div
                className="absolute left-0 h-[3px] rounded-full"
                style={{
                  width: `${(elevMaskDeg / 45) * 100}%`,
                  backgroundColor: 'rgba(255, 80, 80, 0.5)',
                }}
              />
              <div
                className="absolute size-3 rounded-full border-2 -translate-x-1/2 transition-transform group-hover:scale-125"
                style={{
                  left: `${(elevMaskDeg / 45) * 100}%`,
                  backgroundColor: 'rgba(255, 80, 80, 0.7)',
                  borderColor: 'var(--color-bg-raised)',
                }}
              />
              <input
                type="range"
                min={0}
                max={45}
                step={1}
                value={elevMaskDeg}
                onChange={(e) => setElevMaskDeg(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[10px] text-fg/50 font-mono w-6 text-right">
              {elevMaskDeg}°
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            className="flex items-center justify-center size-7 rounded-md bg-fg/5 hover:bg-fg/10 text-fg/50 hover:text-fg/70 transition-colors"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-3.5"
              >
                <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="size-3.5"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            )}
          </button>
          <div
            role="slider"
            aria-valuemin={0}
            aria-valuemax={numEpochs - 1}
            aria-valuenow={epochIdx}
            aria-label="Epoch timeline"
            tabIndex={0}
            className="flex-1 relative h-5 flex items-center group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(
                0,
                Math.min(1, (e.clientX - rect.left) / rect.width),
              );
              setEpochIdx(Math.round(pct * (numEpochs - 1)));
              setPlaying(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
                setEpochIdx((v) => Math.min(numEpochs - 1, v + 1));
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
                setEpochIdx((v) => Math.max(0, v - 1));
            }}
          >
            <div className="absolute inset-x-0 h-[3px] rounded-full bg-border/40" />
            <div
              className="absolute left-0 h-[3px] rounded-full"
              style={{
                width: `${(epochIdx / Math.max(1, numEpochs - 1)) * 100}%`,
                backgroundColor: 'var(--color-accent)',
                opacity: 0.7,
              }}
            />
            <div
              className="absolute size-3 rounded-full border-2 -translate-x-1/2 transition-transform group-hover:scale-125"
              style={{
                left: `${(epochIdx / Math.max(1, numEpochs - 1)) * 100}%`,
                backgroundColor: 'var(--color-accent)',
                borderColor: 'var(--color-bg-raised)',
              }}
            />
            <input
              type="range"
              min={0}
              max={numEpochs - 1}
              value={epochIdx}
              onChange={(e) => {
                setEpochIdx(Number(e.target.value));
                setPlaying(false);
              }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
          Ground tracks
        </span>
        <GroundTrackMap
          tracks={groundTracks}
          currentPositions={groundCurrentPositions}
          rxLat={rxGeo?.lat}
          rxLon={rxGeo?.lon}
        />
      </div>

      {epochSkyData && <ElevationHeatmap skyData={epochSkyData} />}
      {epochSkyData && grid && (
        <ElevationCn0 epochSkyData={epochSkyData} grid={grid} />
      )}
      {epochSkyData && <DopTimeline skyData={epochSkyData} />}
    </div>
  );
}
