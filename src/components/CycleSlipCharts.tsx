import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { CycleSlipResult } from '../util/cycle-slip';
import { SYSTEM_COLORS, systemColor } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';
import { systemName } from '../util/rinex';
import ChartCard from './ChartCard';

/* ================================================================== */
/*  Signal filter tabs                                                 */
/* ================================================================== */

function SignalTabs({
  stats,
  selected,
  onSelect,
}: {
  stats: CycleSlipResult['signalStats'];
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
            ? 'bg-fg/10 text-fg/80'
            : 'bg-fg/[0.03] text-fg/40 hover:text-fg/60'
        }`}
      >
        All signals
      </button>
      {stats.map(s => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.label)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            selected === s.label
              ? 'bg-fg/10 text-fg/80'
              : 'bg-fg/[0.03] text-fg/40 hover:text-fg/60'
          }`}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: systemColor(s.system) }} />
          {s.label}
          <span className="ml-1.5 text-fg/25">{s.totalSlips}</span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Per-signal summary bar chart                                       */
/* ================================================================== */

function SlipRateBar({ stats }: { stats: CycleSlipResult['signalStats'] }) {
  const theme = useChartTheme();
  const data = useMemo(() =>
    stats.filter(s => s.totalEpochs > 0).map(s => ({
      label: s.label,
      slipRate: Math.round(s.slipRate * 100) / 100,
      totalSlips: s.totalSlips,
      system: s.system,
      satellites: s.satellites,
      totalEpochs: s.totalEpochs,
    })),
  [stats]);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Cycle slip rate per signal (slips / 1000 epochs)" height={Math.max(160, data.length * 36 + 40)}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} horizontal={false} />
          <XAxis type="number" tick={theme.axisStyle} tickLine={false} axisLine={false} domain={[0, 'auto']} />
          <YAxis type="category" dataKey="label" tick={theme.axisStyle} tickLine={false} axisLine={false} width={140} />
          <Tooltip
            {...theme.tooltipStyle}
            formatter={(value: any, _name: any, props: any) => [
              `${Number(value).toFixed(2)} / 1000 ep  (${props.payload.totalSlips} slips, ${props.payload.satellites} SVs)`,
              'Rate',
            ]}
          />
          <Bar dataKey="slipRate" name="Slip rate" radius={[0, 4, 4, 0]} barSize={20}>
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
/*  Per-satellite bar chart                                            */
/* ================================================================== */

function SatSlipBar({ result, selected }: { result: CycleSlipResult; selected: string | null }) {
  const theme = useChartTheme();
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of result.events) {
      if (selected && !ev.signal.includes(selected.split(' (')[0]!)) continue;
      counts.set(ev.prn, (counts.get(ev.prn) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([prn, slips]) => ({ prn, slips, system: prn[0]! }))
      .sort((a, b) => a.prn.localeCompare(b.prn));
  }, [result.events, selected]);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Cycle slips per satellite" height={Math.max(160, data.length * 14 + 40)}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} horizontal={false} />
          <XAxis type="number" tick={theme.axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="prn" tick={theme.axisStyle} tickLine={false} axisLine={false} width={35} />
          <Tooltip
            {...theme.tooltipStyle}
            formatter={(value: any) => [`${value} slips`, 'Count']}
          />
          <Bar dataKey="slips" name="Slips" radius={[0, 4, 4, 0]} barSize={10}>
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
/*  Slip timeline heatmap (canvas)                                     */
/* ================================================================== */

function SlipTimeline({ result, selected }: { result: CycleSlipResult; selected: string | null }) {
  useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!selected) return result.events;
    const sig = selected.split(' (')[0]!;
    return result.events.filter(ev => ev.signal.includes(sig));
  }, [result.events, selected]);

  const allPrns = useMemo(() => {
    const set = new Set<string>();
    for (const ev of filtered) set.add(ev.prn);
    return [...set].sort();
  }, [filtered]);

  const { tMin, tMax } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const ev of filtered) {
      if (ev.time < min) min = ev.time;
      if (ev.time > max) max = ev.time;
    }
    return { tMin: min, tMax: max };
  }, [filtered]);

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

    const numRows = allPrns.length;
    if (numRows === 0 || !isFinite(tMin)) return;

    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - 20;
    const cellH = Math.min(plotH / numRows, 14);
    const duration = tMax - tMin || 1;

    const prnIdx = new Map<string, number>();
    allPrns.forEach((prn, i) => prnIdx.set(prn, i));

    // Draw slip markers
    for (const ev of filtered) {
      const row = prnIdx.get(ev.prn);
      if (row === undefined) continue;
      const x = LABEL_W + ((ev.time - tMin) / duration) * plotW;
      ctx.fillStyle = SYSTEM_COLORS[ev.prn[0]!] ?? '#ff4444';
      ctx.fillRect(x - 1, row * cellH, 2, cellH - 0.5);
    }

    // PRN labels
    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      ctx.fillStyle = SYSTEM_COLORS[prn[0]!] ?? t.canvasText + '0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = t.canvasText + '0.5)';
      ctx.fillText(prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    // Time labels
    const actualH = cellH * numRows;
    ctx.fillStyle = t.canvasText + '0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
      const tt = tMin + (i / 6) * duration;
      const d = new Date(tt);
      ctx.fillText(
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        LABEL_W + (i / 6) * plotW,
        actualH + 12,
      );
    }
  }, [filtered, allPrns, tMin, tMax]);

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
    if (!canvas || !tip || allPrns.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - 20;
    const cellH = Math.min(plotH / allPrns.length, 14);
    const row = Math.floor(y / cellH);
    if (row < 0 || row >= allPrns.length || x < LABEL_W) { tip.style.display = 'none'; return; }
    const prn = allPrns[row]!;
    const duration = tMax - tMin || 1;
    const t = tMin + ((x - LABEL_W) / plotW) * duration;
    // Find closest event for this PRN
    let closest: typeof filtered[0] | null = null;
    let minDist = Infinity;
    for (const ev of filtered) {
      if (ev.prn !== prn) continue;
      const dist = Math.abs(ev.time - t);
      if (dist < minDist) { minDist = dist; closest = ev; }
    }
    if (!closest || minDist > duration * 0.02) { tip.style.display = 'none'; return; }
    const d = new Date(closest.time);
    const ts = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = `${prn} @ ${ts}: ${closest.signal} (${closest.magnitude.toFixed(3)} m)`;
  }, [filtered, allPrns, tMin, tMax]);

  if (allPrns.length === 0) return null;
  const chartH = Math.min(Math.max(allPrns.length * 14 + 30, 100), 500);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Cycle slip timeline
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Cycle slip timeline"
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = 'none'; }}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
          style={{ display: 'none', backgroundColor: getChartTheme().tooltipBg, border: getChartTheme().tooltipBorder, color: getChartTheme().tooltipFg, whiteSpace: 'nowrap' }}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main export                                                        */
/* ================================================================== */

export default function CycleSlipCharts({ result }: { result: CycleSlipResult }) {
  const [selected, setSelected] = useState<string | null>(null);

  const totalSlips = result.events.length;

  if (result.signalStats.length === 0 && totalSlips === 0) {
    return (
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4 text-center text-fg/40 text-sm">
        No carrier phase observations found for cycle slip analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
          Cycle slip analysis
        </span>
        <SignalTabs stats={result.signalStats} selected={selected} onSelect={setSelected} />

        {/* Summary cards */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          <div className="rounded-lg bg-fg/[0.03] px-3 py-2">
            <div className="text-[10px] text-fg/40 mb-0.5">Total slips</div>
            <div className="text-lg font-semibold text-fg/80">{totalSlips.toLocaleString()}</div>
          </div>
          {(selected
            ? result.signalStats.filter(s => s.label === selected)
            : result.signalStats
          ).map(s => (
            <div key={s.label} className="rounded-lg bg-fg/[0.03] px-3 py-2">
              <div className="text-[10px] text-fg/40 mb-0.5">{s.label}</div>
              <div className="text-lg font-semibold" style={{ color: systemColor(s.system) }}>
                {s.totalSlips}
                <span className="text-xs font-normal text-fg/30 ml-1">{s.slipRate.toFixed(1)}/k</span>
              </div>
              <div className="text-[9px] text-fg/25">{s.satellites} SVs &middot; {s.totalEpochs.toLocaleString()} ep</div>
            </div>
          ))}
        </div>
      </div>

      <SlipRateBar stats={result.signalStats} />
      <SlipTimeline result={result} selected={selected} />
      <SatSlipBar result={result} selected={selected} />
    </div>
  );
}
