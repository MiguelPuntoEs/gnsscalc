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
import type { EpochSkyData } from '../util/orbit';
import { useChartTheme } from '../hooks/useChartTheme';
import ChartCard from './ChartCard';

interface DopRow {
  label: string;
  gdop: number | null;
  pdop: number | null;
  hdop: number | null;
  vdop: number | null;
}

export default function DopTimeline({ skyData }: { skyData: EpochSkyData[] }) {
  const theme = useChartTheme();
  const data = useMemo<DopRow[]>(() => {
    const maxPts = 500;
    const step = Math.max(1, Math.ceil(skyData.length / maxPts));
    const result: DopRow[] = [];
    for (let i = 0; i < skyData.length; i += step) {
      const e = skyData[i]!;
      const d = new Date(e.time);
      const label = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      result.push({
        label,
        gdop: e.dop?.gdop ?? null,
        pdop: e.dop?.pdop ?? null,
        hdop: e.dop?.hdop ?? null,
        vdop: e.dop?.vdop ?? null,
      });
    }
    return result;
  }, [skyData]);

  const tickInterval = Math.max(1, Math.floor(data.length / 6));
  const hasDop = data.some(d => d.pdop !== null);
  if (!hasDop) return null;

  return (
    <ChartCard title="Dilution of precision (DOP)">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
          <XAxis dataKey="label" tick={theme.axisStyle} interval={tickInterval} tickLine={false} axisLine={false} />
          <YAxis tick={theme.axisStyle} tickLine={false} axisLine={false} width={30} domain={[0, 'auto']} />
          <Tooltip {...theme.tooltipStyle} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: theme.legendColor }} />
          <Line type="monotone" dataKey="gdop" stroke="#f87171" strokeWidth={1.5} dot={false} connectNulls name="GDOP" />
          <Line type="monotone" dataKey="pdop" stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls name="PDOP" />
          <Line type="monotone" dataKey="hdop" stroke="#4ade80" strokeWidth={1.5} dot={false} connectNulls name="HDOP" />
          <Line type="monotone" dataKey="vdop" stroke="#fbbf24" strokeWidth={1.5} dot={false} connectNulls name="VDOP" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
