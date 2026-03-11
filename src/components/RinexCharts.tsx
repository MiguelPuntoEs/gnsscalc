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
import { downsampleEpochs, systemName } from '../util/rinex';
import type { EpochSummary } from '../util/rinex';

const GRID_STROKE = 'rgba(255,255,255,0.06)';
const AXIS_STYLE = { fontSize: 10, fill: 'rgba(208,208,211,0.5)' };
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#32323f',
    border: '1px solid rgba(74,74,90,0.6)',
    borderRadius: 8,
    fontSize: 12,
    color: '#d0d0d3',
  },
  labelStyle: { color: 'rgba(208,208,211,0.6)', fontSize: 11 },
  itemStyle: { color: '#d0d0d3' },
};

const SYSTEM_COLORS: Record<string, string> = {
  G: '#4ade80', // GPS — green
  R: '#f87171', // GLONASS — red
  E: '#60a5fa', // Galileo — blue
  C: '#fbbf24', // BeiDou — amber
  J: '#c084fc', // QZSS — purple
  I: '#fb923c', // NavIC — orange
  S: '#94a3b8', // SBAS — slate
};

function systemColor(sys: string): string {
  return SYSTEM_COLORS[sys] ?? '#7c8aff';
}

function formatTimeLabel(epoch: EpochSummary): string {
  const d = new Date(epoch.time);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">{title}</span>
      <div style={{ width: '100%', height: 180 }}>
        {children}
      </div>
    </div>
  );
}

/** Map C/N0 value (0–60 dB-Hz) to a color from dark red → yellow → green. */
function cn0Color(value: number | undefined): string {
  if (value == null) return 'rgba(255,255,255,0.03)';
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

interface ChartRow {
  label: string;
  total: number;
  snr: number | null;
  [key: string]: string | number | null;
}

const HEATMAP_MAX_COLS = 600;

function SatelliteHeatmap({
  epochs,
  systems,
  prnsPerSystem,
}: {
  epochs: EpochSummary[];
  systems: string[];
  prnsPerSystem: Record<string, string[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const ds = useMemo(() => downsampleEpochs(epochs), [epochs]);

  const allPrns = useMemo(() => {
    const result: string[] = [];
    for (const sys of systems) {
      const prns = prnsPerSystem[sys];
      if (prns) result.push(...prns);
    }
    return result;
  }, [systems, prnsPerSystem]);

  const numRows = allPrns.length;
  const numCols = Math.min(ds.length, HEATMAP_MAX_COLS);
  const colStep = ds.length > HEATMAP_MAX_COLS ? Math.ceil(ds.length / HEATMAP_MAX_COLS) : 1;

  const grid = useMemo(() => {
    const g: (number | undefined)[][] = [];
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      const row: (number | undefined)[] = [];
      for (let c = 0; c < numCols; c++) {
        const ei = c * colStep;
        row.push(ds[ei]?.snrPerSat[prn]);
      }
      g.push(row);
    }
    return g;
  }, [ds, allPrns, numRows, numCols, colStep]);

  const LABEL_W = 36;
  const LEGEND_H = 18;

  const draw = useCallback((canvas: HTMLCanvasElement) => {
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

    // Draw cells
    for (let r = 0; r < numRows; r++) {
      const gridRow = grid[r]!;
      for (let c = 0; c < numCols; c++) {
        ctx.fillStyle = cn0Color(gridRow[c]);
        ctx.fillRect(LABEL_W + c * cellW, r * cellH, cellW + 0.5, cellH - 0.5);
      }
    }

    // PRN labels
    ctx.fillStyle = 'rgba(208,208,211,0.5)';
    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      ctx.fillStyle = SYSTEM_COLORS[prn.charAt(0)] ?? 'rgba(208,208,211,0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = 'rgba(208,208,211,0.5)';
      ctx.fillText(prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    // Time labels along bottom
    const timeY = actualH + 12;
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const e = ds[c * colStep];
      if (!e) continue;
      const d = new Date(e.time);
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
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0', legendX, legendY + 16);
    ctx.textAlign = 'center';
    ctx.fillText('dB-Hz', legendX + legendW / 2, legendY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('55', legendX + legendW, legendY + 16);
  }, [grid, ds, allPrns, numRows, numCols, colStep]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas);
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
    const val = grid[row]![col];
    const prn = allPrns[row]!;
    const epoch = ds[col * colStep];
    const timeStr = epoch ? formatTimeLabel(epoch) : '';
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = val != null ? `${prn} @ ${timeStr}: ${val.toFixed(1)} dB-Hz` : `${prn} @ ${timeStr}: —`;
  }, [grid, allPrns, ds, numCols, numRows, colStep]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numRows === 0) return null;

  const chartH = Math.min(Math.max(numRows * 12 + 50, 120), 500);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Satellite availability &amp; C/N0
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
          style={{
            display: 'none',
            backgroundColor: '#32323f',
            border: '1px solid rgba(74,74,90,0.6)',
            color: '#d0d0d3',
            whiteSpace: 'nowrap',
          }}
        />
      </div>
    </div>
  );
}

const CN0_BINS = Array.from({ length: 12 }, (_, i) => i * 5);

function Cn0Histogram({ epochs, systems }: { epochs: EpochSummary[]; systems: string[] }) {
  const histData = useMemo(() => {
    const counts: Record<string, number[]> = {};
    for (const sys of systems) counts[sys] = new Array(CN0_BINS.length).fill(0);

    for (const e of epochs) {
      for (const [prn, val] of Object.entries(e.snrPerSat)) {
        const sys = prn[0];
        if (!counts[sys]) counts[sys] = new Array(CN0_BINS.length).fill(0);
        const bin = Math.min(Math.floor(val / 5), CN0_BINS.length - 1);
        counts[sys]![bin]!++;
      }
    }

    return CN0_BINS.map((low, i) => {
      const row: Record<string, string | number> = { bin: `${low}–${low + 5}` };
      for (const sys of systems) {
        row[sys] = counts[sys]?.[i] ?? 0;
      }
      return row;
    });
  }, [epochs, systems]);

  return (
    <ChartCard title="C/N0 distribution (dB-Hz)">
      <ResponsiveContainer>
        <BarChart data={histData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="bin"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend
            iconSize={10}
            wrapperStyle={{ fontSize: 11, color: 'rgba(208,208,211,0.6)' }}
          />
          {systems.map(sys => (
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
  epochs,
  systems,
}: {
  epochs: EpochSummary[];
  systems: string[];
}) {
  const prnsPerSystem = useMemo(() => {
    const map: Record<string, string[]> = {};
    const sets: Record<string, Set<string>> = {};
    for (const e of epochs) {
      for (const prn of Object.keys(e.snrPerSat)) {
        const sys = prn[0];
        if (!sets[sys]) sets[sys] = new Set();
        sets[sys]!.add(prn);
      }
    }
    for (const [sys, s] of Object.entries(sets)) {
      map[sys] = [...s].sort();
    }
    return map;
  }, [epochs]);

  const data = useMemo<ChartRow[]>(() => {
    const ds = downsampleEpochs(epochs);
    return ds.map(e => {
      const row: ChartRow = {
        label: formatTimeLabel(e),
        total: e.totalSats,
        snr: e.meanSnr !== null ? Math.round(e.meanSnr * 10) / 10 : null,
      };
      for (const sys of systems) {
        row[`sat_${sys}`] = e.satsPerSystem[sys] ?? 0;
        row[`snr_${sys}`] = e.snrPerSystem[sys] != null
          ? Math.round(e.snrPerSystem[sys] * 10) / 10
          : null;
      }
      return row;
    });
  }, [epochs, systems]);

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
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_STYLE}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11, color: 'rgba(208,208,211,0.6)' }}
              />
              <defs>
                {systems.map(sys => (
                  <linearGradient key={sys} id={`satGrad_${sys}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={systemColor(sys)} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={systemColor(sys)} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              {systems.map(sys => (
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
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_STYLE}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip {...TOOLTIP_STYLE} />
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
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_STYLE}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={35}
                domain={[0, 'auto']}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value: unknown) => [`${Number(value).toFixed(1)} dB-Hz`]}
              />
              <Legend
                iconSize={10}
                wrapperStyle={{ fontSize: 11, color: 'rgba(208,208,211,0.6)' }}
              />
              {systems.map(sys => (
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
        <SatelliteHeatmap epochs={epochs} systems={systems} prnsPerSystem={prnsPerSystem} />
      )}

      {/* C/N0 distribution histogram */}
      {hasSnr && nextChart(<Cn0Histogram epochs={epochs} systems={systems} />)}

      {/* Overall mean C/N0 */}
      {hasSnr && nextChart(
        <ChartCard title="Mean C/N0 — all constellations (dB-Hz)">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_STYLE}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_STYLE}
                tickLine={false}
                axisLine={false}
                width={35}
                domain={[0, 'auto']}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
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
