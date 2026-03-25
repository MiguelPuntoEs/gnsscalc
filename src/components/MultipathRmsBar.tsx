import { useMemo } from 'react';
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
import type { MultipathSignalStat } from 'gnss-js/analysis';
import { systemColor } from '../util/gnss-constants';
import { useChartTheme } from '../hooks/useChartTheme';
import ChartCard from './ChartCard';

export default function MultipathRmsBar({
  stats,
}: {
  stats: MultipathSignalStat[];
}) {
  const theme = useChartTheme();
  const data = useMemo(
    () =>
      stats.map((s) => ({
        label: s.label,
        rms: Math.round(s.rms * 1000) / 1000,
        system: s.system,
        count: s.count,
        satellites: s.satellites,
      })),
    [stats],
  );

  return (
    <ChartCard
      title="Code multipath RMS per signal"
      height={Math.max(180, stats.length * 36 + 40)}
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
            unit=" m"
            domain={[0, 'auto']}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={theme.axisStyle}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            {...theme.tooltipStyle}
            formatter={(value: unknown, _name: unknown, props: unknown) => {
              const v = Number(value);
              const p = (
                props as { payload?: { satellites?: number; count?: number } }
              )?.payload;
              return [
                `${v.toFixed(3)} m  (${p?.satellites ?? 0} SVs, ${(p?.count ?? 0).toLocaleString()} obs)`,
                'RMS',
              ];
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
