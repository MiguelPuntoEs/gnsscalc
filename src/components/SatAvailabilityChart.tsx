import { useMemo, useRef, useCallback, useEffect } from 'react';
import type { Ephemeris } from 'gnss-js/rinex';
import type { EpochGrid } from '../util/epoch-grid';
import { buildAvailabilityGrids, CellState } from '../util/availability-grid';
import type { AvailabilityGrid } from '../util/availability-grid';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import { formatUTCTime } from 'gnss-js/constants';
import { systemName } from 'gnss-js/rinex';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

/* ================================================================== */
/*  Color palette                                                      */
/* ================================================================== */

const STATE_COLORS: Record<number, string> = {
  [CellState.Empty]: 'rgba(255,255,255,0.03)',
  [CellState.EphHealthy]: '#4ade80',
  [CellState.EphUnhealthy]: '#f87171',
  [CellState.ObsEphHealthy]: '#4ade80',
  [CellState.ObsEphUnhealthy]: '#f87171',
  [CellState.ObsNoEph]: '#fbbf24',
  [CellState.NotObsHasEph]: 'rgba(160,160,170,0.30)',
};

const STATE_LABELS_NAV: [number, string, string][] = [
  [CellState.EphHealthy, '#4ade80', 'Healthy'],
  [CellState.EphUnhealthy, '#f87171', 'Unhealthy'],
];

const STATE_LABELS_OBS: [number, string, string][] = [
  [CellState.ObsEphHealthy, '#4ade80', 'Observed + healthy'],
  [CellState.ObsEphUnhealthy, '#f87171', 'Observed + unhealthy'],
  [CellState.ObsNoEph, '#fbbf24', 'Observed, no eph'],
  [CellState.NotObsHasEph, 'rgba(160,160,170,0.5)', 'Has eph, not observed'],
];

/* ================================================================== */
/*  Single constellation canvas                                        */
/* ================================================================== */

const LABEL_W = 36;
const LEGEND_H = 40;

function ConstellationGrid({ ag }: { ag: AvailabilityGrid }) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { prns, times, cells, hasObs, system } = ag;
  const nBins = times.length;
  const nPrns = prns.length;

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const t = getChartTheme();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const plotW = rect.width - LABEL_W;
      const plotH = rect.height - LEGEND_H - 16;
      if (nPrns === 0 || nBins === 0) return;

      const cellW = plotW / nBins;
      const cellH = Math.min(plotH / nPrns, 14);
      const actualH = cellH * nPrns;

      // Draw cells
      for (let r = 0; r < nPrns; r++) {
        for (let c = 0; c < nBins; c++) {
          const state = cells[c * nPrns + r]!;
          if (state === CellState.Empty) continue;
          ctx.fillStyle = STATE_COLORS[state] ?? 'transparent';
          ctx.fillRect(
            LABEL_W + c * cellW,
            r * cellH,
            cellW + 0.5,
            cellH - 0.5,
          );
        }
      }

      // PRN labels
      ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const sysColor = SYSTEM_COLORS[system] ?? t.canvasText + '0.5)';
      for (let r = 0; r < nPrns; r++) {
        ctx.fillStyle = sysColor;
        ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
        ctx.fillStyle = t.canvasText + '0.5)';
        ctx.fillText(prns[r]!, LABEL_W - 4, r * cellH + cellH / 2);
      }

      // Time labels
      const timeY = actualH + 12;
      ctx.fillStyle = t.canvasText + '0.4)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const labelStep = Math.max(1, Math.floor(nBins / 6));
      for (let c = 0; c < nBins; c += labelStep) {
        const d = new Date(times[c]!);
        const lbl = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        ctx.fillText(lbl, LABEL_W + c * cellW + cellW / 2, timeY);
      }

      // Legend
      const labels = hasObs ? STATE_LABELS_OBS : STATE_LABELS_NAV;
      const legendY = actualH + 24;
      ctx.font = '8px ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      let lx = LABEL_W;
      for (const [, color, label] of labels) {
        ctx.fillStyle = color;
        ctx.fillRect(lx, legendY, 8, 8);
        ctx.fillStyle = t.canvasText + '0.4)';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx + 11, legendY + 4);
        lx += ctx.measureText(label).width + 22;
      }
    },
    [cells, prns, times, nBins, nPrns, hasObs, system],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const stateLabel = (state: number): string => {
    switch (state) {
      case CellState.EphHealthy:
        return 'Healthy';
      case CellState.EphUnhealthy:
        return 'Unhealthy';
      case CellState.ObsEphHealthy:
        return 'Observed + healthy';
      case CellState.ObsEphUnhealthy:
        return 'Observed + unhealthy';
      case CellState.ObsNoEph:
        return 'Observed, no ephemeris';
      case CellState.NotObsHasEph:
        return 'Has eph, not observed';
      default:
        return 'No data';
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const tip = tooltipRef.current;
      if (!canvas || !tip) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const plotW = rect.width - LABEL_W;
      const cellW = plotW / nBins;
      const cellH = Math.min((rect.height - LEGEND_H - 16) / nPrns, 14);
      const col = Math.floor((x - LABEL_W) / cellW);
      const row = Math.floor(y / cellH);
      if (col < 0 || col >= nBins || row < 0 || row >= nPrns) {
        tip.style.display = 'none';
        return;
      }
      const prn = prns[row]!;
      const state = cells[col * nPrns + row]!;
      const timeStr = formatUTCTime(new Date(times[col]!));
      tip.style.display = 'block';
      tip.style.left = `${e.clientX - rect.left + 12}px`;
      tip.style.top = `${e.clientY - rect.top - 8}px`;
      tip.textContent = `${prn} @ ${timeStr}: ${stateLabel(state)}`;
    },
    [prns, cells, times, nBins, nPrns],
  );

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  const chartH = Math.min(Math.max(nPrns * 14 + 70, 120), 600);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        {systemName(system)} — Availability &amp; Health
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${systemName(system)} satellite availability and health`}
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
          style={{
            display: 'none',
            backgroundColor: theme.tooltipBg,
            border: theme.tooltipBorder,
            color: theme.tooltipFg,
            whiteSpace: 'nowrap',
          }}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main component                                                     */
/* ================================================================== */

export default function SatAvailabilityChart({
  ephemerides,
  grid,
}: {
  ephemerides: Ephemeris[];
  grid: EpochGrid | null;
}) {
  const grids = useMemo(
    () => buildAvailabilityGrids(ephemerides, grid),
    [ephemerides, grid],
  );

  if (grids.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {grids.map((ag) => (
        <ConstellationGrid key={ag.system} ag={ag} />
      ))}
    </div>
  );
}
