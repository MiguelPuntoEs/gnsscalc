import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { MultipathResult } from '../util/multipath';
import { useChartTheme } from '../hooks/useChartTheme';
import ChartCard from './ChartCard';

const MP_HIST_BINS = 40;

export default function MultipathDistribution({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const theme = useChartTheme();
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
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis
            dataKey="mp"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            type="number"
            domain={['auto', 'auto']}
            unit=" m"
            tickCount={7}
          />
          <YAxis
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            {...theme.tooltipStyle}
            formatter={(value: unknown) => [`${Number(value).toLocaleString()} observations`, 'Count']}
            labelFormatter={(v: unknown) => `MP: ${Number(v).toFixed(3)} m`}
          />
          <Bar dataKey="count" fill="#7c8aff" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
