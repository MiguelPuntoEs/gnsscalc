import { useMemo, useRef, useEffect, useCallback } from 'react';
import type { EpochSkyData } from '../util/orbit';
import { systemCmp } from '../util/rinex';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

function elColor(deg: number | undefined): string {
  if (deg == null) return 'rgba(255,255,255,0.03)';
  const t = Math.max(0, Math.min(1, deg / 90));
  if (t < 0.33) {
    const u = t / 0.33;
    return `rgb(${Math.round(180 + 75 * u)}, ${Math.round(50 + 130 * u)}, 40)`;
  }
  const u = (t - 0.33) / 0.67;
  return `rgb(${Math.round(255 - 185 * u)}, ${Math.round(180 + 75 * u)}, ${Math.round(40 + 40 * u)})`;
}

export default function ElevationHeatmap({ skyData }: { skyData: EpochSkyData[] }) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const allPrns = useMemo(() => {
    const set = new Set<string>();
    for (const e of skyData) {
      for (const s of e.satellites) set.add(s.prn);
    }
    return [...set].sort(systemCmp);
  }, [skyData]);

  const MAX_COLS = 600;
  const numRows = allPrns.length;
  const colStep = Math.max(1, Math.ceil(skyData.length / MAX_COLS));
  const numCols = Math.ceil(skyData.length / colStep);

  const grid = useMemo(() => {
    const g: (number | undefined)[][] = [];
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      const row: (number | undefined)[] = [];
      for (let c = 0; c < numCols; c++) {
        const epoch = skyData[c * colStep];
        if (!epoch) { row.push(undefined); continue; }
        const sat = epoch.satellites.find(s => s.prn === prn);
        row.push(sat ? sat.el * 180 / Math.PI : undefined);
      }
      g.push(row);
    }
    return g;
  }, [skyData, allPrns, numRows, numCols, colStep]);

  const LABEL_W = 36;

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

    if (numRows === 0 || numCols === 0) return;

    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - 60;
    const cellW = plotW / numCols;
    const cellH = Math.min(plotH / numRows, 14);

    for (let r = 0; r < numRows; r++) {
      const gridRow = grid[r]!;
      for (let c = 0; c < numCols; c++) {
        ctx.fillStyle = elColor(gridRow[c]);
        ctx.fillRect(LABEL_W + c * cellW, r * cellH, cellW + 0.5, cellH - 0.5);
      }
    }

    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      ctx.fillStyle = SYSTEM_COLORS[prn.charAt(0)] ?? t.canvasText + '0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = t.canvasText + '0.5)';
      ctx.fillText(prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    const actualH = cellH * numRows;
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const e = skyData[c * colStep];
      if (!e) continue;
      const d = new Date(e.time);
      ctx.fillText(
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        LABEL_W + c * cellW + cellW / 2,
        actualH + 12,
      );
    }

    const legendY = actualH + 22;
    const legendW = Math.min(140, plotW * 0.4);
    const legendX = LABEL_W + (plotW - legendW) / 2;
    for (let i = 0; i < legendW; i++) {
      ctx.fillStyle = elColor((i / legendW) * 90);
      ctx.fillRect(legendX + i, legendY, 1.5, 8);
    }
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0°', legendX, legendY + 16);
    ctx.textAlign = 'center';
    ctx.fillText('Elevation', legendX + legendW / 2, legendY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('90°', legendX + legendW, legendY + 16);
  }, [grid, skyData, allPrns, numRows, numCols, colStep]);

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
    if (!canvas || !tip) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plotW = rect.width - LABEL_W;
    const cellW = plotW / numCols;
    const plotH = rect.height - 60;
    const cellH = Math.min(plotH / numRows, 14);
    const col = Math.floor((x - LABEL_W) / cellW);
    const row = Math.floor(y / cellH);
    if (col < 0 || col >= numCols || row < 0 || row >= numRows) {
      tip.style.display = 'none';
      return;
    }
    const val = grid[row]![col];
    const prn = allPrns[row]!;
    const epoch = skyData[col * colStep];
    const d = epoch ? new Date(epoch.time) : null;
    const timeStr = d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}` : '';
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = val != null ? `${prn} @ ${timeStr}: ${val.toFixed(1)}° el` : `${prn} @ ${timeStr}: —`;
  }, [grid, allPrns, skyData, numCols, numRows, colStep]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numRows === 0) return null;

  const chartH = Math.min(Math.max(numRows * 14 + 80, 160), 900);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Satellite elevation
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Satellite elevation heatmap over time"
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
