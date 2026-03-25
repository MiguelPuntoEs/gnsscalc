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
import type { CompletenessResult } from 'gnss-js/analysis';
import { SYSTEM_COLORS, systemColor } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';
import { systemName } from 'gnss-js/rinex';
import ChartCard from './ChartCard';

/* ================================================================== */
/*  System filter tabs                                                 */
/* ================================================================== */

function SystemTabs({
  systems,
  selected,
  onSelect,
}: {
  systems: string[];
  selected: string | null;
  onSelect: (sys: string | null) => void;
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
        All
      </button>
      {systems.map((sys) => (
        <button
          key={sys}
          type="button"
          onClick={() => onSelect(sys)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            selected === sys
              ? 'bg-fg/10 text-fg/80'
              : 'bg-fg/[0.03] text-fg/40 hover:text-fg/60'
          }`}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
            style={{ backgroundColor: systemColor(sys) }}
          />
          {systemName(sys)}
        </button>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Per-signal completeness bar chart                                  */
/* ================================================================== */

function SignalCompletenessBar({
  result,
  selectedSys,
}: {
  result: CompletenessResult;
  selectedSys: string | null;
}) {
  const theme = useChartTheme();
  const data = useMemo(
    () =>
      result.signalStats
        .filter((s) => !selectedSys || s.system === selectedSys)
        .map((s) => ({
          label: s.label,
          percent: Math.round(s.percent * 10) / 10,
          system: s.system,
          satellites: s.satellites,
          present: s.present,
          expected: s.expected,
        })),
    [result.signalStats, selectedSys],
  );

  if (data.length === 0) return null;

  return (
    <ChartCard
      title="Data completeness per signal (%)"
      height={Math.max(160, data.length * 24 + 40)}
    >
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={theme.gridStroke}
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            unit="%"
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            {...theme.tooltipStyle}
            formatter={(_value, _name, item) => {
              const d = item.payload as {
                percent: number;
                present: number;
                expected: number;
                satellites: number;
              };
              return [
                `${d.percent.toFixed(1)}%  (${d.present.toLocaleString()} / ${d.expected.toLocaleString()}, ${d.satellites} SVs)`,
                'Completeness',
              ];
            }}
          />
          <Bar
            dataKey="percent"
            name="Completeness"
            radius={[0, 4, 4, 0]}
            barSize={16}
          >
            {data.map((d, i) => {
              const alpha = d.percent > 95 ? 0.8 : d.percent > 80 ? 0.6 : 0.4;
              return (
                <Cell
                  key={i}
                  fill={systemColor(d.system)}
                  fillOpacity={alpha}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ================================================================== */
/*  Completeness heatmap (canvas): satellite × obs code                */
/* ================================================================== */

function completeColor(pct: number): string {
  if (pct >= 99) return 'rgb(70, 200, 80)';
  if (pct >= 90) return 'rgb(140, 200, 60)';
  if (pct >= 75) return 'rgb(200, 180, 50)';
  if (pct >= 50) return 'rgb(220, 130, 40)';
  if (pct > 0) return 'rgb(220, 60, 40)';
  return 'rgba(255,255,255,0.03)';
}

function CompletenessHeatmap({
  result,
  selectedSys,
}: {
  result: CompletenessResult;
  selectedSys: string | null;
}) {
  useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { prns, codes, grid } = useMemo(() => {
    const filtered = result.cells.filter(
      (c) => !selectedSys || c.system === selectedSys,
    );
    const prnSet = new Set<string>();
    const codeSet = new Set<string>();
    for (const c of filtered) {
      prnSet.add(c.prn);
      codeSet.add(c.code);
    }
    const prns = [...prnSet].sort();
    // Sort codes by band then type
    const codes = [...codeSet].sort((a, b) => {
      if (a[1] !== b[1]) return (a[1] ?? '').localeCompare(b[1] ?? '');
      return a.localeCompare(b);
    });

    // Build lookup
    const lookup = new Map<string, number>();
    for (const c of filtered) lookup.set(`${c.prn}:${c.code}`, c.percent);

    const grid: (number | undefined)[][] = prns.map((prn) =>
      codes.map((code) => lookup.get(`${prn}:${code}`)),
    );

    return { prns, codes, grid };
  }, [result.cells, selectedSys]);

  const LABEL_W = 36;
  const HEADER_H = 50;
  const LEGEND_H = 30;

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

      const numRows = prns.length;
      const numCols = codes.length;
      if (numRows === 0 || numCols === 0) return;

      const plotW = rect.width - LABEL_W;
      const plotH = rect.height - HEADER_H - LEGEND_H;
      const cellW = Math.min(plotW / numCols, 28);
      const cellH = Math.min(plotH / numRows, 14);

      // Column headers (obs codes)
      ctx.fillStyle = t.canvasText + '0.4)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let c = 0; c < numCols; c++) {
        ctx.save();
        ctx.translate(LABEL_W + c * cellW + cellW / 2, HEADER_H - 4);
        ctx.rotate(-Math.PI / 3);
        ctx.fillText(codes[c]!, 0, 0);
        ctx.restore();
      }

      // Cells
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          const pct = grid[r]![c];
          ctx.fillStyle =
            pct !== undefined ? completeColor(pct) : 'rgba(255,255,255,0.03)';
          ctx.fillRect(
            LABEL_W + c * cellW,
            HEADER_H + r * cellH,
            cellW - 0.5,
            cellH - 0.5,
          );
        }
      }

      // PRN labels
      ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < numRows; r++) {
        const prn = prns[r]!;
        ctx.fillStyle = SYSTEM_COLORS[prn[0]!] ?? t.canvasText + '0.5)';
        ctx.fillRect(0, HEADER_H + r * cellH, 3, cellH - 0.5);
        ctx.fillStyle = t.canvasText + '0.5)';
        ctx.fillText(prn, LABEL_W - 4, HEADER_H + r * cellH + cellH / 2);
      }

      // Legend
      const actualH = HEADER_H + cellH * numRows;
      const steps = [0, 25, 50, 75, 90, 99, 100];
      const legendY = actualH + 12;
      const legendW = Math.min(200, plotW * 0.6);
      const legendX = LABEL_W + (plotW - legendW) / 2;
      const stepW = legendW / (steps.length - 1);
      for (let i = 0; i < steps.length - 1; i++) {
        ctx.fillStyle = completeColor((steps[i]! + steps[i + 1]!) / 2);
        ctx.fillRect(legendX + i * stepW, legendY, stepW + 0.5, 8);
      }
      ctx.fillStyle = t.canvasText + '0.4)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (const pct of [0, 50, 75, 90, 100]) {
        const x = legendX + (pct / 100) * legendW;
        ctx.fillText(`${pct}%`, x, legendY + 18);
      }
    },
    [prns, codes, grid],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const tip = tooltipRef.current;
      if (!canvas || !tip || prns.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const plotW = rect.width - LABEL_W;
      const plotH = rect.height - HEADER_H - LEGEND_H;
      const cellW = Math.min(plotW / codes.length, 28);
      const cellH = Math.min(plotH / prns.length, 14);
      const col = Math.floor((x - LABEL_W) / cellW);
      const row = Math.floor((y - HEADER_H) / cellH);
      if (col < 0 || col >= codes.length || row < 0 || row >= prns.length) {
        tip.style.display = 'none';
        return;
      }
      const pct = grid[row]![col];
      tip.style.display = 'block';
      tip.style.left = `${e.clientX - rect.left + 12}px`;
      tip.style.top = `${e.clientY - rect.top - 8}px`;
      tip.textContent =
        pct !== undefined
          ? `${prns[row]} ${codes[col]}: ${pct.toFixed(1)}%`
          : `${prns[row]} ${codes[col]}: —`;
    },
    [prns, codes, grid],
  );

  if (prns.length === 0) return null;
  const chartH = Math.min(
    Math.max(prns.length * 14 + HEADER_H + LEGEND_H + 10, 160),
    800,
  );

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Observation completeness matrix
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Observation completeness heatmap"
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            if (tooltipRef.current) tooltipRef.current.style.display = 'none';
          }}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
          style={{
            display: 'none',
            backgroundColor: getChartTheme().tooltipBg,
            border: getChartTheme().tooltipBorder,
            color: getChartTheme().tooltipFg,
            whiteSpace: 'nowrap',
          }}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main export                                                        */
/* ================================================================== */

export default function CompletenessCharts({
  result,
}: {
  result: CompletenessResult;
}) {
  const [selectedSys, setSelectedSys] = useState<string | null>(null);

  // Compute overall completeness
  const overall = useMemo(() => {
    let exp = 0,
      pres = 0;
    for (const s of result.signalStats) {
      if (selectedSys && s.system !== selectedSys) continue;
      exp += s.expected;
      pres += s.present;
    }
    return exp > 0 ? (pres / exp) * 100 : 0;
  }, [result.signalStats, selectedSys]);

  if (result.signalStats.length === 0) {
    return (
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4 text-center text-fg/40 text-sm">
        No observation data for completeness analysis.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
          Data completeness
        </span>
        <SystemTabs
          systems={result.systems}
          selected={selectedSys}
          onSelect={setSelectedSys}
        />

        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          <div className="rounded-lg bg-fg/[0.03] px-3 py-2">
            <div className="text-[10px] text-fg/40 mb-0.5">Overall</div>
            <div
              className="text-lg font-semibold"
              style={{
                color:
                  overall > 95
                    ? '#46c850'
                    : overall > 80
                      ? '#c8b432'
                      : '#dc3c28',
              }}
            >
              {overall.toFixed(1)}
              <span className="text-xs font-normal text-fg/30 ml-0.5">%</span>
            </div>
          </div>
          {result.systems
            .filter((sys) => !selectedSys || sys === selectedSys)
            .map((sys) => {
              const stats = result.signalStats.filter((s) => s.system === sys);
              const exp = stats.reduce((a, s) => a + s.expected, 0);
              const pres = stats.reduce((a, s) => a + s.present, 0);
              const pct = exp > 0 ? (pres / exp) * 100 : 0;
              return (
                <div key={sys} className="rounded-lg bg-fg/[0.03] px-3 py-2">
                  <div className="text-[10px] text-fg/40 mb-0.5">
                    {systemName(sys)}
                  </div>
                  <div
                    className="text-lg font-semibold"
                    style={{ color: systemColor(sys) }}
                  >
                    {pct.toFixed(1)}
                    <span className="text-xs font-normal text-fg/30 ml-0.5">
                      %
                    </span>
                  </div>
                  <div className="text-[9px] text-fg/25">
                    {stats.reduce((a, s) => a + s.satellites, 0)} SVs
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <CompletenessHeatmap result={result} selectedSys={selectedSys} />
      <SignalCompletenessBar result={result} selectedSys={selectedSys} />
    </div>
  );
}
