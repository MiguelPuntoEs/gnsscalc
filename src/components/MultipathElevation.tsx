import { useMemo } from 'react';
import {
  ResponsiveContainer,
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
import type { MultipathResult } from 'gnss-js/analysis';
import type { AllPositionsData } from 'gnss-js/orbit';
import { systemColor } from '../util/gnss-constants';
import { useChartTheme } from '../hooks/useChartTheme';
import { systemName } from 'gnss-js/rinex';
import ChartCard from './ChartCard';

type ElevLookup = (prn: string, time: number) => number | null;

function buildElevLookup(allPositions: AllPositionsData): ElevLookup {
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
        els.push(pt.el * (180 / Math.PI));
      }
    }
    if (times.length > 0) {
      maps.set(prn, { times, els: Float64Array.from(els) });
    }
  }

  return (prn: string, time: number): number | null => {
    const m = maps.get(prn);
    if (!m) return null;
    const { times, els } = m;
    let lo = 0,
      hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! < time) lo = mid + 1;
      else hi = mid;
    }
    const best = lo;
    const prev = best > 0 ? best - 1 : best;
    const idx =
      Math.abs(times[prev]! - time) < Math.abs(times[best]! - time)
        ? prev
        : best;
    if (Math.abs(times[idx]! - time) > 60000) return null;
    return els[idx]!;
  };
}

const ELEV_BIN_SIZE = 5;

export default function MultipathElevation({
  result,
  selectedSignal,
  allPositions,
}: {
  result: MultipathResult;
  selectedSignal: string | null;
  allPositions: AllPositionsData;
}) {
  const theme = useChartTheme();
  const { scatterData, binnedData, systems } = useMemo(() => {
    const elevLookup = buildElevLookup(allPositions);

    const scatter: { el: number; mp: number; system: string }[] = [];
    for (const s of result.series) {
      if (selectedSignal) {
        const [sys, band, refBand] = selectedSignal.split('-');
        if (s.system !== sys || s.band !== band || s.refBand !== refBand)
          continue;
      }
      for (const p of s.points) {
        const el = elevLookup(s.prn, p.time);
        if (el !== null && el > 0) {
          scatter.push({ el, mp: p.mp, system: s.system });
        }
      }
    }

    const numBins = Math.ceil(90 / ELEV_BIN_SIZE);
    const sysSet = new Set<string>();
    const bins = new Map<string, { sumSq: number; count: number }[]>();
    for (const pt of scatter) {
      sysSet.add(pt.system);
      if (!bins.has(pt.system)) {
        bins.set(
          pt.system,
          Array.from({ length: numBins }, () => ({ sumSq: 0, count: 0 })),
        );
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

    const binnedRows: Record<string, number | string | null>[] = [];
    for (let i = 0; i < numBins; i++) {
      const center = i * ELEV_BIN_SIZE + ELEV_BIN_SIZE / 2;
      const row: Record<string, number | string | null> = {
        el: `${i * ELEV_BIN_SIZE}-${(i + 1) * ELEV_BIN_SIZE}`,
        elCenter: center,
      };
      for (const sys of sysList) {
        const b = bins.get(sys)?.[i];
        row[`rms_${sys}`] =
          b && b.count >= 5 ? Math.sqrt(b.sumSq / b.count) : null;
      }
      binnedRows.push(row);
    }

    const maxScatter = 3000;
    const step = Math.max(1, Math.ceil(scatter.length / maxScatter));
    const dsScatter =
      step === 1 ? scatter : scatter.filter((_, i) => i % step === 0);

    return { scatterData: dsScatter, binnedData: binnedRows, systems: sysList };
  }, [result, selectedSignal, allPositions]);

  if (scatterData.length === 0) return null;

  return (
    <>
      <ChartCard title="Multipath RMS vs elevation" height={220}>
        <ResponsiveContainer>
          <LineChart
            data={binnedData}
            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
            <XAxis
              dataKey="el"
              tick={theme.axisStyle}
              tickLine={false}
              axisLine={false}
              label={{
                value: 'Elevation (deg)',
                position: 'insideBottom',
                offset: -2,
                style: { fontSize: 9, fill: theme.labelFill },
              }}
            />
            <YAxis
              tick={theme.axisStyle}
              tickLine={false}
              axisLine={false}
              width={45}
              label={{
                value: 'RMS (m)',
                angle: -90,
                position: 'insideLeft',
                offset: 5,
                style: { fontSize: 9, fill: theme.labelFill },
              }}
              domain={[0, 'auto']}
            />
            <Tooltip
              {...theme.tooltipStyle}
              formatter={(value: unknown) => [
                `${Number(value).toFixed(3)} m`,
                'RMS',
              ]}
            />
            <Legend
              iconSize={10}
              wrapperStyle={{ fontSize: 11, color: theme.legendColor }}
            />
            {systems.map((sys) => (
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

      <ChartCard title="Multipath vs elevation (scatter)" height={220}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
            <XAxis
              type="number"
              dataKey="el"
              tick={theme.axisStyle}
              tickLine={false}
              axisLine={false}
              domain={[0, 90]}
              unit="°"
              name="Elevation"
            />
            <YAxis
              type="number"
              dataKey="mp"
              tick={theme.axisStyle}
              tickLine={false}
              axisLine={false}
              width={45}
              unit=" m"
              name="MP"
            />
            <Tooltip
              {...theme.tooltipStyle}
              formatter={(value: unknown, name: unknown) => [
                `${Number(value).toFixed(3)}${name === 'Elevation' ? '°' : ' m'}`,
                name as string,
              ]}
            />
            <Scatter
              data={scatterData}
              fill="#7c8aff"
              fillOpacity={0.15}
              r={1.5}
            >
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
