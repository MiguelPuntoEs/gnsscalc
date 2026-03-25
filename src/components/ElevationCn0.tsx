import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { EpochSkyData } from 'gnss-js/orbit';
import { systemName, systemCmp } from 'gnss-js/rinex';
import type { EpochGrid } from '../util/epoch-grid';
import {
  gridTimeIndex,
  gridSnrPerSatBandAt,
  gridBands,
} from '../util/epoch-grid';
import { systemColor } from '../util/gnss-constants';
import { useChartTheme } from '../hooks/useChartTheme';

const BAND_LABELS: Record<string, Record<string, string>> = {
  G: { '1': 'L1', '2': 'L2', '5': 'L5' },
  R: { '1': 'G1', '2': 'G2', '3': 'G3', '4': 'G1a', '6': 'G2a' },
  E: { '1': 'E1', '5': 'E5a', '6': 'E6', '7': 'E5b', '8': 'E5' },
  C: { '1': 'B1', '2': 'B1-2', '5': 'B2a', '6': 'B3', '7': 'B2b', '8': 'B2' },
  J: { '1': 'L1', '2': 'L2', '5': 'L5', '6': 'L6' },
  I: { '5': 'L5', '9': 'S' },
  S: { '1': 'L1', '5': 'L5' },
};

const COMMON_BAND: Record<string, string> = {
  '1': 'L1/E1/B1',
  '2': 'L2/G2/B1-2',
  '5': 'L5/E5a/B2a',
  '6': 'E6/B3/L6',
  '7': 'E5b/B2b',
  '8': 'E5/B2',
};

export default function ElevationCn0({
  epochSkyData,
  grid,
}: {
  epochSkyData: EpochSkyData[];
  grid: EpochGrid;
}) {
  const theme = useChartTheme();
  const data = useMemo(() => {
    const timeIdx = gridTimeIndex(grid);
    const bands = gridBands(grid);
    if (bands.length === 0) return null;

    const pairs = new Map<
      string,
      { elSum: number; cn0Sum: number; n: number }[]
    >();

    for (const sky of epochSkyData) {
      const snrBand = gridSnrPerSatBandAt(grid, timeIdx, sky.time);
      if (!snrBand) continue;
      for (const sat of sky.satellites) {
        const sys = sat.prn[0]!;
        const elDeg = (sat.el * 180) / Math.PI;
        const bin = Math.min(Math.floor(elDeg), 89);
        for (const band of bands) {
          const cn0 = snrBand[`${sat.prn}:${band}`];
          if (cn0 === undefined) continue;
          const seriesKey = `${sys}:${band}`;
          let arr = pairs.get(seriesKey);
          if (!arr) {
            arr = Array.from({ length: 90 }, () => ({
              elSum: 0,
              cn0Sum: 0,
              n: 0,
            }));
            pairs.set(seriesKey, arr);
          }
          const b = arr[bin]!;
          b.elSum += elDeg;
          b.cn0Sum += cn0;
          b.n++;
        }
      }
    }

    if (pairs.size === 0) return null;

    const charts: {
      band: string;
      label: string;
      keys: { dataKey: string; name: string; color: string }[];
      rows: Record<string, number>[];
    }[] = [];

    for (const band of bands) {
      const keys: (typeof charts)[0]['keys'] = [];
      const seriesForBand: {
        sys: string;
        dataKey: string;
        name: string;
        bins: typeof pairs extends Map<string, infer V> ? V : never;
      }[] = [];
      for (const [seriesKey, bins] of pairs) {
        const [sys, b] = seriesKey.split(':');
        if (b !== band || !sys) continue;
        const sysLabel = BAND_LABELS[sys]?.[band] ?? `Band ${band}`;
        const dataKey = sys;
        const name = `${systemName(sys)} ${sysLabel}`;
        seriesForBand.push({ sys, dataKey, name, bins });
      }
      if (seriesForBand.length === 0) continue;
      seriesForBand.sort((a, b) => systemCmp(a.sys, b.sys));

      const rows: Record<string, number>[] = [];
      for (let i = 0; i < 90; i++) {
        const row: Record<string, number> = {};
        let hasAny = false;
        for (const s of seriesForBand) {
          const bin = s.bins[i]!;
          if (bin.n >= 2) {
            row[s.dataKey] = Math.round((bin.cn0Sum / bin.n) * 10) / 10;
            row.el = Math.round(bin.elSum / bin.n);
            hasAny = true;
          }
        }
        if (hasAny) rows.push(row);
      }
      if (rows.length === 0) continue;

      for (const s of seriesForBand) {
        keys.push({
          dataKey: s.dataKey,
          name: s.name,
          color: systemColor(s.sys),
        });
      }
      charts.push({
        band,
        label: COMMON_BAND[band] ?? `Band ${band}`,
        keys,
        rows,
      });
    }

    return charts.length > 0 ? charts : null;
  }, [epochSkyData, grid]);

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Elevation vs C/N0
      </span>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(data.length, 3)}, 1fr)`,
        }}
      >
        {data.map((chart) => (
          <div key={chart.band}>
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg/35 mb-1 block">
              {chart.label}
            </span>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={chart.rows}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={theme.gridStroke}
                />
                <XAxis
                  dataKey="el"
                  type="number"
                  domain={[0, 90]}
                  ticks={[0, 15, 30, 45, 60, 75, 90]}
                  tick={theme.axisStyle}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Elev (°)',
                    position: 'insideBottomRight',
                    offset: -5,
                    style: { fontSize: 9, fill: theme.labelFill },
                  }}
                />
                <YAxis
                  domain={[0, 60]}
                  ticks={[0, 10, 20, 30, 40, 50, 60]}
                  tick={theme.axisStyle}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                  label={{
                    value: 'dB-Hz',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    style: { fontSize: 9, fill: theme.labelFill },
                  }}
                />
                <Tooltip
                  {...theme.tooltipStyle}
                  formatter={(v) => `${Number(v).toFixed(1)} dB-Hz`}
                  labelFormatter={(l) => `${Number(l)}°`}
                />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, color: theme.legendColor }}
                />
                {chart.keys.map((k) => (
                  <Line
                    key={k.dataKey}
                    dataKey={k.dataKey}
                    name={k.name}
                    stroke={k.color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </div>
  );
}
