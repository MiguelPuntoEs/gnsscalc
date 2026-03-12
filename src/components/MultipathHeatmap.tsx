import { useMemo, useRef, useEffect, useCallback } from 'react';
import type { MultipathResult } from '../util/multipath';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

const MP_COLOR_SCALE_M = 1.0;

function mpColor(value: number): string {
  const abs = Math.min(Math.abs(value), MP_COLOR_SCALE_M);
  const t = abs / MP_COLOR_SCALE_M;
  if (value >= 0) {
    const r = 60 + 195 * t;
    const g = 60 + 100 * (1 - t);
    const b = 180 * (1 - t);
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
  const r = 180 * (1 - t);
  const g = 60 + 100 * (1 - t);
  const b = 60 + 195 * t;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export default function MultipathHeatmap({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!selectedSignal) return result.series;
    const [sys, band, refBand] = selectedSignal.split('-');
    return result.series.filter(s => s.system === sys && s.band === band && s.refBand === refBand);
  }, [result.series, selectedSignal]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      if (a.system !== b.system) {
        const order = 'GRECIJS';
        return order.indexOf(a.system) - order.indexOf(b.system);
      }
      return a.prn.localeCompare(b.prn);
    }),
  [filtered]);

  const prnRows = useMemo(() => {
    const seen = new Map<string, typeof sorted[0]>();
    for (const s of sorted) {
      if (!seen.has(s.prn)) seen.set(s.prn, s);
    }
    return [...seen.values()];
  }, [sorted]);

  const { tMin, tMax } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const s of prnRows) {
      for (const p of s.points) {
        if (p.time < min) min = p.time;
        if (p.time > max) max = p.time;
      }
    }
    return { tMin: min, tMax: max };
  }, [prnRows]);

  const LABEL_W = 40;
  const LEGEND_H = 40;
  const MAX_COLS = 600;

  const draw = useCallback((canvas: HTMLCanvasElement) => {
    const t = getChartTheme();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const numRows = prnRows.length;
    if (numRows === 0 || !isFinite(tMin)) return;

    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - LEGEND_H - 10;
    const cellH = Math.min(plotH / numRows, 14);
    const duration = tMax - tMin || 1;
    const numCols = Math.min(MAX_COLS, Math.ceil(plotW / 2));
    const cellW = plotW / numCols;

    for (let r = 0; r < numRows; r++) {
      const s = prnRows[r]!;
      const bins = new Float64Array(numCols);
      const counts = new Uint16Array(numCols);
      for (const p of s.points) {
        const col = Math.min(numCols - 1, Math.floor(((p.time - tMin) / duration) * numCols));
        bins[col]! += p.mp;
        counts[col]!++;
      }
      for (let c = 0; c < numCols; c++) {
        if (counts[c] === 0) continue;
        const avg = bins[c]! / counts[c]!;
        ctx.fillStyle = mpColor(avg);
        ctx.fillRect(LABEL_W + c * cellW, r * cellH, cellW + 0.5, cellH - 0.5);
      }
    }

    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const s = prnRows[r]!;
      ctx.fillStyle = SYSTEM_COLORS[s.system] ?? t.canvasText + '0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = t.canvasText + '0.5)';
      ctx.fillText(s.prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    const actualH = cellH * numRows;
    const timeY = actualH + 12;
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const t = tMin + (c / numCols) * duration;
      const d = new Date(t);
      const lbl = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      ctx.fillText(lbl, LABEL_W + c * cellW + cellW / 2, timeY);
    }

    const legendY = actualH + 24;
    const legendW = Math.min(160, plotW * 0.5);
    const legendX = LABEL_W + (plotW - legendW) / 2;
    for (let i = 0; i < legendW; i++) {
      const v = ((i / legendW) * 2 - 1) * MP_COLOR_SCALE_M;
      ctx.fillStyle = mpColor(v);
      ctx.fillRect(legendX + i, legendY, 1.5, 8);
    }
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`-${MP_COLOR_SCALE_M}m`, legendX, legendY + 16);
    ctx.textAlign = 'center';
    ctx.fillText('MP', legendX + legendW / 2, legendY + 16);
    ctx.textAlign = 'right';
    ctx.fillText(`+${MP_COLOR_SCALE_M}m`, legendX + legendW, legendY + 16);
  }, [prnRows, tMin, tMax]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tip = tooltipRef.current;
    if (!canvas || !tip || prnRows.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - LEGEND_H - 10;
    const cellH = Math.min(plotH / prnRows.length, 14);
    const row = Math.floor(y / cellH);
    if (row < 0 || row >= prnRows.length || x < LABEL_W) { tip.style.display = 'none'; return; }
    const s = prnRows[row]!;
    const duration = tMax - tMin || 1;
    const tFrac = (x - LABEL_W) / plotW;
    const t = tMin + tFrac * duration;
    let closest: { time: number; mp: number } | null = null;
    let minDist = Infinity;
    for (const p of s.points) {
      const dist = Math.abs(p.time - t);
      if (dist < minDist) { minDist = dist; closest = p; }
    }
    if (!closest || minDist > duration * 0.02) { tip.style.display = 'none'; return; }
    const d = new Date(closest.time);
    const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = `${s.prn} @ ${timeStr}: ${closest.mp >= 0 ? '+' : ''}${closest.mp.toFixed(3)} m`;
  }, [prnRows, tMin, tMax]);

  if (prnRows.length === 0) return null;
  const chartH = Math.min(Math.max(prnRows.length * 14 + 70, 140), 700);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Multipath time series
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Multipath time series heatmap"
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }}
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
