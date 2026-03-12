import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import type { MultipathResult } from '../util/multipath';
import { systemColor } from '../util/gnss-constants';
import { useChartTheme } from '../hooks/useChartTheme';
import ChartCard from './ChartCard';

export default function MultipathSatScatter({ result, selectedSignal }: { result: MultipathResult; selectedSignal: string | null }) {
  const theme = useChartTheme();
  const data = useMemo(() => {
    const items: { prn: string; rms: number; system: string; label: string }[] = [];
    for (const s of result.series) {
      if (selectedSignal) {
        const [sys, band, refBand] = selectedSignal.split('-');
        if (s.system !== sys || s.band !== band || s.refBand !== refBand) continue;
      }
      items.push({ prn: s.prn, rms: Math.round(s.rms * 1000) / 1000, system: s.system, label: s.label });
    }
    const seen = new Set<string>();
    return items.filter(i => { if (seen.has(i.prn)) return false; seen.add(i.prn); return true; })
      .sort((a, b) => a.prn.localeCompare(b.prn));
  }, [result, selectedSignal]);

  if (data.length === 0) return null;

  return (
    <ChartCard title="Per-satellite multipath RMS" height={Math.max(180, data.length * 10 + 40)}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis
            type="number"
            dataKey="rms"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            unit=" m"
            domain={[0, 'auto']}
            name="RMS"
          />
          <YAxis
            type="category"
            dataKey="prn"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            width={35}
            name="PRN"
          />
          <Tooltip
            {...theme.tooltipStyle}
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
