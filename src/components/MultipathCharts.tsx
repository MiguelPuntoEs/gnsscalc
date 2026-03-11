import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import type { MultipathResult, MultipathSignalStat } from '../util/multipath';
import type { AllPositionsData } from '../util/orbit';
import { SYSTEM_COLORS, GRID_STROKE, AXIS_STYLE, TOOLTIP_STYLE, systemColor } from '../util/gnss-constants';
import { systemName } from '../util/rinex';
import ChartCard from './ChartCard';

/* ================================================================== */
/*  MP RMS bar chart                                                   */
/* ================================================================== */

function RmsBarChart({ stats }: { stats: MultipathSignalStat[] }) {
  const data = useMemo(() =>
    stats.map(s => ({
      label: s.label,
      rms: Math.round(s.rms * 1000) / 1000,
      system: s.system,
      count: s.count,
      satellites: s.satellites,
    })),
  [stats]);

  return (
    <ChartCard title="Code multipath RMS per signal" height={Math.max(180, stats.length * 36 + 40)}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            unit=" m"
            domain={[0, 'auto']}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown, _name: unknown, props: unknown) => {
              const v = Number(value);
              const p = (props as { payload?: { satellites?: number; count?: number } })?.payload;
              return [`${v.toFixed(3)} m  (${p?.satellites ?? 0} SVs, ${(p?.count ?? 0).toLocaleString()} obs)`, 'RMS'];
            }}
          />
          <Bar dataKey="rms" name="RMS" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((d, i) => (
              <Cell key={i} fill={systemColor(d.system)} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ================================================================== */
/*  MP time series heatmap (canvas-based for performance)              */
/* ================================================================== */

const MP_COLOR_SCALE_M = 1.0; // ±1m range for color mapping

function mpColor(value: number): string {
  const abs = Math.min(Math.abs(value), MP_COLOR_SCALE_M);
  const t = abs / MP_COLOR_SCALE_M;
  // Blue → white → red
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

function MultipathHeatmap({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Filter series by selected signal
  const filtered = useMemo(() => {
    if (!selectedSignal) return result.series;
    const [sys, band, refBand] = selectedSignal.split('-');
    return result.series.filter(s => s.system === sys && s.band === band && s.refBand === refBand);
  }, [result.series, selectedSignal]);

  // Sort by system + PRN
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      if (a.system !== b.system) {
        const order = 'GRECIJS';
        return order.indexOf(a.system) - order.indexOf(b.system);
      }
      return a.prn.localeCompare(b.prn);
    }),
  [filtered]);

  // Deduplicate: one row per PRN (take the first series for each PRN)
  const prnRows = useMemo(() => {
    const seen = new Map<string, typeof sorted[0]>();
    for (const s of sorted) {
      if (!seen.has(s.prn)) seen.set(s.prn, s);
    }
    return [...seen.values()];
  }, [sorted]);

  // Global time range
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

    // Build grid
    for (let r = 0; r < numRows; r++) {
      const s = prnRows[r]!;
      // Bin points into columns
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

    // PRN labels
    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const s = prnRows[r]!;
      ctx.fillStyle = SYSTEM_COLORS[s.system] ?? 'rgba(208,208,211,0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = 'rgba(208,208,211,0.5)';
      ctx.fillText(s.prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    // Time labels
    const actualH = cellH * numRows;
    const timeY = actualH + 12;
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const t = tMin + (c / numCols) * duration;
      const d = new Date(t);
      const lbl = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      ctx.fillText(lbl, LABEL_W + c * cellW + cellW / 2, timeY);
    }

    // Color scale legend
    const legendY = actualH + 24;
    const legendW = Math.min(160, plotW * 0.5);
    const legendX = LABEL_W + (plotW - legendW) / 2;
    for (let i = 0; i < legendW; i++) {
      const v = ((i / legendW) * 2 - 1) * MP_COLOR_SCALE_M;
      ctx.fillStyle = mpColor(v);
      ctx.fillRect(legendX + i, legendY, 1.5, 8);
    }
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
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
    // Find closest point
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

/* ================================================================== */
/*  MP distribution histogram (scatter: MP vs elevation bin)           */
/* ================================================================== */

const MP_HIST_BINS = 40;

function MpDistribution({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const data = useMemo(() => {
    const allMp: number[] = [];
    for (const s of result.series) {
      if (selectedSignal) {
        const [sys, band, refBand] = selectedSignal.split('-');
        if (s.system !== sys || s.band !== band || s.refBand !== refBand) continue;
      }
      for (const p of s.points) allMp.push(p.mp);
    }
    if (allMp.length === 0) return [];

    // Determine range (clip outliers at 99.5th percentile)
    const sorted = [...allMp].sort((a, b) => a - b);
    const p995 = sorted[Math.floor(sorted.length * 0.995)]!;
    const p005 = sorted[Math.floor(sorted.length * 0.005)]!;
    const range = Math.max(Math.abs(p995), Math.abs(p005), 0.1);
    const binWidth = (2 * range) / MP_HIST_BINS;

    const bins = new Array(MP_HIST_BINS).fill(0) as number[];
    for (const v of allMp) {
      const idx = Math.min(MP_HIST_BINS - 1, Math.max(0, Math.floor((v + range) / binWidth)));
      bins[idx]!++;
    }

    return bins.map((count, i) => ({
      mp: Math.round((-range + (i + 0.5) * binWidth) * 1000) / 1000,
      count,
    }));
  }, [result, selectedSignal]);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Multipath distribution" height={180}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            dataKey="mp"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            type="number"
            domain={['auto', 'auto']}
            unit=" m"
            tickCount={7}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => [`${Number(value).toLocaleString()} observations`, 'Count']}
            labelFormatter={(v: unknown) => `MP: ${Number(v).toFixed(3)} m`}
          />
          <Bar dataKey="count" fill="#7c8aff" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ================================================================== */
/*  Per-satellite RMS scatter                                          */
/* ================================================================== */

function SatRmsScatter({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const data = useMemo(() => {
    const items: { prn: string; rms: number; system: string; label: string }[] = [];
    for (const s of result.series) {
      if (selectedSignal) {
        const [sys, band, refBand] = selectedSignal.split('-');
        if (s.system !== sys || s.band !== band || s.refBand !== refBand) continue;
      }
      items.push({ prn: s.prn, rms: Math.round(s.rms * 1000) / 1000, system: s.system, label: s.label });
    }
    // Deduplicate by taking first per PRN
    const seen = new Set<string>();
    return items.filter(i => { if (seen.has(i.prn)) return false; seen.add(i.prn); return true; })
      .sort((a, b) => a.prn.localeCompare(b.prn));
  }, [result, selectedSignal]);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Per-satellite multipath RMS" height={Math.max(180, data.length * 10 + 40)}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis
            type="number"
            dataKey="rms"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            unit=" m"
            domain={[0, 'auto']}
            name="RMS"
          />
          <YAxis
            type="category"
            dataKey="prn"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            width={35}
            name="PRN"
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => [`${Number(value).toFixed(3)} m`, 'RMS']}
          />
          <Scatter data={data} name="Satellites">
            {data.map((d, i) => (
              <Cell key={i} fill={systemColor(d.system)} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ================================================================== */
/*  Signal selector tabs                                               */
/* ================================================================== */

function SignalTabs({
  stats,
  selected,
  onSelect,
}: {
  stats: MultipathSignalStat[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
          selected === null
            ? 'bg-white/10 text-white/80'
            : 'bg-white/[0.03] text-fg/40 hover:text-fg/60'
        }`}
      >
        All signals
      </button>
      {stats.map(s => {
        const key = `${s.system}-${s.band}-${s.refBand}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              selected === key
                ? 'bg-white/10 text-white/80'
                : 'bg-white/[0.03] text-fg/40 hover:text-fg/60'
            }`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: systemColor(s.system) }} />
            {s.label}
            <span className="ml-1.5 text-fg/25">{s.rms.toFixed(3)}m</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Elevation lookup helper                                            */
/* ================================================================== */

type ElevLookup = (prn: string, time: number) => number | null;

/** Build a fast PRN+time → elevation (degrees) lookup from orbit data. */
function buildElevLookup(allPositions: AllPositionsData): ElevLookup {
  // For each PRN, build a sorted time→elevation map
  const maps = new Map<string, { times: number[]; els: Float64Array }>();
  for (const prn of allPositions.prns) {
    const posArr = allPositions.positions[prn];
    if (!posArr) continue;
    const times: number[] = [];
    const els: number[] = [];
    for (let i = 0; i < allPositions.times.length; i++) {
      const pt = posArr[i];
      if (pt && pt.el !== 0) {
        times.push(allPositions.times[i]!);
        els.push(pt.el * (180 / Math.PI)); // radians → degrees
      }
    }
    if (times.length > 0) {
      maps.set(prn, { times, els: Float64Array.from(els) });
    }
  }

  return (prn: string, time: number): number | null => {
    const m = maps.get(prn);
    if (!m) return null;
    // Binary search for closest time
    const { times, els } = m;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! < time) lo = mid + 1; else hi = mid;
    }
    // Check neighbors for closest
    const best = lo;
    const prev = best > 0 ? best - 1 : best;
    const idx = Math.abs(times[prev]! - time) < Math.abs(times[best]! - time) ? prev : best;
    // Only match if within 60s
    if (Math.abs(times[idx]! - time) > 60000) return null;
    return els[idx]!;
  };
}

/* ================================================================== */
/*  MP vs elevation (scatter + binned RMS)                             */
/* ================================================================== */

const ELEV_BIN_SIZE = 5; // degrees

function MpVsElevation({
  result,
  selectedSignal,
  allPositions,
}: {
  result: MultipathResult;
  selectedSignal: string | null;
  allPositions: AllPositionsData;
}) {
  const { scatterData, binnedData, systems } = useMemo(() => {
    const elevLookup = buildElevLookup(allPositions);

    // Collect all MP points with elevation
    const scatter: { el: number; mp: number; system: string }[] = [];
    for (const s of result.series) {
      if (selectedSignal) {
        const [sys, band, refBand] = selectedSignal.split('-');
        if (s.system !== sys || s.band !== band || s.refBand !== refBand) continue;
      }
      for (const p of s.points) {
        const el = elevLookup(s.prn, p.time);
        if (el !== null && el > 0) {
          scatter.push({ el, mp: p.mp, system: s.system });
        }
      }
    }

    // Bin by elevation: compute RMS per bin per system
    const numBins = Math.ceil(90 / ELEV_BIN_SIZE);
    const sysSet = new Set<string>();
    // bins[sys][binIdx] = { sumSq, count }
    const bins = new Map<string, { sumSq: number; count: number }[]>();
    for (const pt of scatter) {
      sysSet.add(pt.system);
      if (!bins.has(pt.system)) {
        bins.set(pt.system, Array.from({ length: numBins }, () => ({ sumSq: 0, count: 0 })));
      }
      const idx = Math.min(numBins - 1, Math.floor(pt.el / ELEV_BIN_SIZE));
      const b = bins.get(pt.system)![idx]!;
      b.sumSq += pt.mp * pt.mp;
      b.count++;
    }

    const sysList = [...sysSet].sort((a, b) => {
      const order = 'GRECIJS';
      return order.indexOf(a) - order.indexOf(b);
    });

    // Build binned chart data
    const binnedRows: Record<string, number | string | null>[] = [];
    for (let i = 0; i < numBins; i++) {
      const center = i * ELEV_BIN_SIZE + ELEV_BIN_SIZE / 2;
      const row: Record<string, number | string | null> = { el: `${i * ELEV_BIN_SIZE}-${(i + 1) * ELEV_BIN_SIZE}`, elCenter: center };
      for (const sys of sysList) {
        const b = bins.get(sys)?.[i];
        row[`rms_${sys}`] = b && b.count >= 5 ? Math.sqrt(b.sumSq / b.count) : null;
      }
      binnedRows.push(row);
    }

    // Downsample scatter for rendering (max ~3000 points)
    const maxScatter = 3000;
    const step = Math.max(1, Math.ceil(scatter.length / maxScatter));
    const dsScatter = step === 1 ? scatter : scatter.filter((_, i) => i % step === 0);

    return { scatterData: dsScatter, binnedData: binnedRows, systems: sysList };
  }, [result, selectedSignal, allPositions]);

  if (scatterData.length === 0) return null;

  return (
    <>
      {/* Binned RMS vs elevation */}
      <ChartCard title="Multipath RMS vs elevation" height={220}>
        <ResponsiveContainer>
          <LineChart data={binnedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              dataKey="el"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Elevation (deg)', position: 'insideBottom', offset: -2, style: { fontSize: 9, fill: 'rgba(208,208,211,0.35)' } }}
            />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={45}
              label={{ value: 'RMS (m)', angle: -90, position: 'insideLeft', offset: 5, style: { fontSize: 9, fill: 'rgba(208,208,211,0.35)' } }}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: unknown) => [`${Number(value).toFixed(3)} m`, 'RMS']}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'rgba(208,208,211,0.6)' }} />
            {systems.map(sys => (
              <Line
                key={sys}
                type="monotone"
                dataKey={`rms_${sys}`}
                stroke={systemColor(sys)}
                strokeWidth={2}
                dot={{ r: 3, fill: systemColor(sys) }}
                connectNulls
                name={systemName(sys)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Scatter: MP vs elevation */}
      <ChartCard title="Multipath vs elevation (scatter)" height={220}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis
              type="number"
              dataKey="el"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              domain={[0, 90]}
              unit="°"
              name="Elevation"
            />
            <YAxis
              type="number"
              dataKey="mp"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              width={45}
              unit=" m"
              name="MP"
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(3)}${name === 'Elevation' ? '°' : ' m'}`,
                name as string,
              ]}
            />
            <Scatter data={scatterData} fill="#7c8aff" fillOpacity={0.15} r={1.5}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={systemColor(d.system)} fillOpacity={0.2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}

/* ================================================================== */
/*  Main export                                                        */
/* ================================================================== */

export default function MultipathCharts({
  result,
  allPositions,
}: {
  result: MultipathResult;
  allPositions?: AllPositionsData | null;
}) {
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

  if (result.signalStats.length === 0) {
    return (
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4 text-center text-fg/40 text-sm">
        No dual-frequency code/phase observations found for multipath analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
          Multipath analysis
        </span>
        <SignalTabs stats={result.signalStats} selected={selectedSignal} onSelect={setSelectedSignal} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {(selectedSignal ? result.signalStats.filter(s => `${s.system}-${s.band}-${s.refBand}` === selectedSignal) : result.signalStats).map(s => (
            <div key={`${s.system}-${s.band}-${s.refBand}`} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] text-fg/40 mb-0.5">{s.label}</div>
              <div className="text-lg font-semibold" style={{ color: systemColor(s.system) }}>
                {s.rms.toFixed(3)}<span className="text-xs font-normal text-fg/30 ml-0.5">m</span>
              </div>
              <div className="text-[9px] text-fg/25">{s.satellites} SVs &middot; {s.count.toLocaleString()} obs</div>
            </div>
          ))}
        </div>
      </div>

      <RmsBarChart stats={result.signalStats} />
      {allPositions && (
        <MpVsElevation result={result} selectedSignal={selectedSignal} allPositions={allPositions} />
      )}
      <MultipathHeatmap result={result} selectedSignal={selectedSignal} />
      <MpDistribution result={result} selectedSignal={selectedSignal} />
      <SatRmsScatter result={result} selectedSignal={selectedSignal} />
    </div>
  );
}
