import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  BarChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { systemName } from '../util/rinex';
import type { EpochGrid } from '../util/epoch-grid';
import {
  gridToChartRows,
  gridPrnsPerSystem,
  gridSnrPerSatDownsampled,
  gridCn0Histogram,
} from '../util/epoch-grid';
import { SYSTEM_COLORS, systemColor, formatUTCTime } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';
import ChartCard from './ChartCard';

/** Map C/N0 value (0–60 dB-Hz) to a color from dark red → yellow → green. */
function cn0Color(value: number | undefined): string {
  if (value == null || isNaN(value)) return 'rgba(255,255,255,0.03)';
  const t = Math.max(0, Math.min(1, value / 55));
  if (t < 0.5) {
    const u = t * 2;
    const r = Math.round(180 + 75 * u);
    const g = Math.round(40 + 160 * u);
    return `rgb(${r}, ${g}, 30)`;
  }
  const u = (t - 0.5) * 2;
  const r = Math.round(255 - 185 * u);
  const g = Math.round(200 + 55 * u);
  return `rgb(${r}, ${g}, ${Math.round(30 + 50 * u)})`;
}

const HEATMAP_MAX_COLS = 600;

function SatelliteHeatmap({
  grid,
  systems,
  prnsPerSystem,
}: {
  grid: EpochGrid;
  systems: string[];
  prnsPerSystem: Record<string, string[]>;
}) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const allPrns = useMemo(() => {
    const result: string[] = [];
    for (const sys of systems) {
      const prns = prnsPerSystem[sys];
      if (prns) result.push(...prns);
    }
    return result;
  }, [systems, prnsPerSystem]);

  // Downsample and build per-PRN index map
  const ds = useMemo(() => gridSnrPerSatDownsampled(grid), [grid]);

  // Map from allPrns order → grid.prns index
  const prnToGridIdx = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < grid.prns.length; i++) map.set(grid.prns[i]!, i);
    return map;
  }, [grid.prns]);

  const numRows = allPrns.length;
  const colStep = Math.max(1, Math.ceil(ds.nCols / HEATMAP_MAX_COLS));
  const numCols = Math.ceil(ds.nCols / colStep);
  const nPrn = grid.prns.length;

  const LABEL_W = 36;
  const LEGEND_H = 50;

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

    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - LEGEND_H - 16;
    if (numRows === 0 || numCols === 0) return;

    const cellW = plotW / numCols;
    const cellH = Math.min(plotH / numRows, 14);
    const actualH = cellH * numRows;

    // Draw cells — direct columnar access
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      const pIdx = prnToGridIdx.get(prn);
      if (pIdx == null) continue;
      for (let c = 0; c < numCols; c++) {
        const srcCol = c * colStep;
        const val = ds.snr[srcCol * nPrn + pIdx]!;
        ctx.fillStyle = cn0Color(isNaN(val) ? undefined : val);
        ctx.fillRect(LABEL_W + c * cellW, r * cellH, cellW + 0.5, cellH - 0.5);
      }
    }

    // PRN labels
    ctx.fillStyle = t.canvasText + '0.5)';
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

    // Time labels along bottom
    const timeY = actualH + 12;
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const srcCol = c * colStep;
      const time = ds.times[srcCol];
      if (time == null) continue;
      const d = new Date(time);
      const lbl = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      ctx.fillText(lbl, LABEL_W + c * cellW + cellW / 2, timeY);
    }

    // Color scale legend
    const legendY = actualH + 24;
    const legendW = Math.min(160, plotW * 0.5);
    const legendX = LABEL_W + (plotW - legendW) / 2;
    for (let i = 0; i < legendW; i++) {
      ctx.fillStyle = cn0Color((i / legendW) * 55);
      ctx.fillRect(legendX + i, legendY, 1.5, 8);
    }
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', legendX, legendY + 16);
    ctx.textAlign = 'center';
    ctx.fillText('dB-Hz', legendX + legendW / 2, legendY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('55', legendX + legendW, legendY + 16);
  }, [ds, allPrns, prnToGridIdx, numRows, numCols, colStep, nPrn]);

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
    const cellH = Math.min((rect.height - LEGEND_H - 16) / numRows, 14);
    const col = Math.floor((x - LABEL_W) / cellW);
    const row = Math.floor(y / cellH);
    if (col < 0 || col >= numCols || row < 0 || row >= numRows) {
      tip.style.display = 'none';
      return;
    }
    const prn = allPrns[row]!;
    const pIdx = prnToGridIdx.get(prn);
    const srcCol = col * colStep;
    const val = pIdx != null ? ds.snr[srcCol * nPrn + pIdx] : undefined;
    const time = ds.times[srcCol];
    const timeStr = time != null ? formatUTCTime(new Date(time)) : '';
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = val != null && !isNaN(val) ? `${prn} @ ${timeStr}: ${val.toFixed(1)} dB-Hz` : `${prn} @ ${timeStr}: —`;
  }, [allPrns, prnToGridIdx, ds, numCols, numRows, colStep, nPrn]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numRows === 0) return null;

  const chartH = Math.min(Math.max(numRows * 14 + 80, 160), 900);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Satellite availability &amp; C/N0
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Satellite availability and C/N0 heatmap"
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

function Cn0Histogram({ grid, systems }: { grid: EpochGrid; systems: string[] }) {
  const theme = useChartTheme();
  const histData = useMemo(() => gridCn0Histogram(grid, systems), [grid, systems]);

  return (
    <ChartCard title="C/N0 distribution (dB-Hz)">
      <ResponsiveContainer>
        <BarChart data={histData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis
            dataKey="bin"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip {...theme.tooltipStyle} />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: 11, color: theme.legendColor }}
          />
          {[...systems].reverse().map(sys => (
            <Bar
              key={sys}
              dataKey={sys}
              stackId="cn0"
              fill={systemColor(sys)}
              fillOpacity={0.8}
              name={systemName(sys)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export default function RinexCharts({
  grid,
  systems,
}: {
  grid: EpochGrid;
  systems: string[];
}) {
  const theme = useChartTheme();
  const prnsPerSystem = useMemo(() => gridPrnsPerSystem(grid), [grid]);

  const formatTime = useCallback((time: number) => formatUTCTime(new Date(time)), []);

  const data = useMemo(() => gridToChartRows(grid, formatTime), [grid, formatTime]);

  const hasSnr = data.some(d => d.snr !== null);
  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  // Stagger chart rendering so the browser stays responsive
  const [visibleCharts, setVisibleCharts] = useState(0);
  useEffect(() => {
    setVisibleCharts(0);
    // Total charts: satPerConstellation(1) + total(1) + snrPerConstellation(hasSnr) + heatmap(1) + histogram(hasSnr) + overallSnr(hasSnr)
    const totalCharts = 3 + (hasSnr ? 3 : 0);
    let i = 0;
    const show = () => {
      i++;
      setVisibleCharts(i);
      if (i < totalCharts) requestAnimationFrame(() => setTimeout(show, 0));
    };
    const id = requestAnimationFrame(() => setTimeout(show, 0));
    return () => cancelAnimationFrame(id);
  }, [hasSnr]);

  if (data.length === 0) return null;

  const chartPlaceholder = (
    <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
      <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
      <div className="flex items-center justify-center" style={{ height: 180 }}>
        <svg className="size-5 animate-spin text-fg/20" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    </div>
  );

  let chartIndex = 0;
  const nextChart = (node: React.ReactNode) => {
    const i = chartIndex++;
    return visibleCharts > i ? node : chartPlaceholder;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Satellite count per constellation — stacked area */}
      {nextChart(
        <ChartCard title="Satellites per constellation">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip {...theme.tooltipStyle} />
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11, color: theme.legendColor }}
              />
              <defs>
                {systems.map(sys => (
                  <linearGradient key={sys} id={`satGrad_${sys}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={systemColor(sys)} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={systemColor(sys)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              {[...systems].reverse().map(sys => (
                <Area
                  key={sys}
                  type="stepAfter"
                  dataKey={`sat_${sys}`}
                  stackId="sats"
                  stroke={systemColor(sys)}
                  strokeWidth={1}
                  fill={`url(#satGrad_${sys})`}
                  dot={false}
                  name={systemName(sys)}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Total satellite count */}
      {nextChart(
        <ChartCard title="Total satellites">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip {...theme.tooltipStyle} />
              <Line
                type="stepAfter"
                dataKey="total"
                stroke="#7c8aff"
                strokeWidth={1.5}
                dot={false}
                name="Total"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Mean C/N0 per constellation */}
      {hasSnr && nextChart(
        <ChartCard title="Mean C/N0 per constellation (dB-Hz)">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={35}
                domain={[0, 'auto']}
              />
              <Tooltip
                {...theme.tooltipStyle}
                formatter={(value: unknown) => [`${Number(value).toFixed(1)} dB-Hz`]}
              />
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11, color: theme.legendColor }}
              />
              {[...systems].reverse().map(sys => (
                <Line
                  key={sys}
                  type="monotone"
                  dataKey={`snr_${sys}`}
                  stroke={systemColor(sys)}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  name={systemName(sys)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Satellite availability heatmap — sat × time, color = C/N0 */}
      {nextChart(
        <SatelliteHeatmap grid={grid} systems={systems} prnsPerSystem={prnsPerSystem} />
      )}

      {/* C/N0 distribution histogram */}
      {hasSnr && nextChart(<Cn0Histogram grid={grid} systems={systems} />)}

      {/* Overall mean C/N0 */}
      {hasSnr && nextChart(
        <ChartCard title="Mean C/N0 — all constellations (dB-Hz)">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={35}
                domain={[0, 'auto']}
              />
              <Tooltip
                {...theme.tooltipStyle}
                formatter={(value: unknown) => [`${Number(value).toFixed(1)} dB-Hz`]}
              />
              <defs>
                <linearGradient id="snrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="snr"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#snrGrad)"
                dot={false}
                connectNulls
                name="Mean C/N0"
                unit=" dB-Hz"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}
