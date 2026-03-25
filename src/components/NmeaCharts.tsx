import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  ScatterChart,
  Scatter,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { NmeaFix } from 'gnss-js/nmea';
import { geodeticToEcef, getEnuDifference, deg2rad } from 'gnss-js/coordinates';
import { useChartTheme } from '../hooks/useChartTheme';

interface ChartData {
  label: string;
  time: number;
  alt: number | null;
  satellites: number | null;
  speed: number | null;
}

interface EnuPoint {
  label: string;
  dE: number;
  dN: number;
  dU: number;
  satellites: number | null;
}

// Color ramp: red (few sats) → yellow → green (many sats)
function satColor(sats: number | null): string {
  if (sats === null) return '#7c8aff';
  const t = Math.min(1, Math.max(0, (sats - 4) / 8));
  if (t < 0.5) {
    const r = 255;
    const g = Math.round(255 * (t * 2));
    return `rgb(${r},${g},60)`;
  }
  const r = Math.round(255 * (1 - (t - 0.5) * 2));
  const g = 220;
  return `rgb(${r},${g},60)`;
}

function computeEnuData(fixes: NmeaFix[]): EnuPoint[] {
  // Convert all fixes to ECEF
  const ecef = fixes.map((f) =>
    geodeticToEcef(deg2rad(f.lat), deg2rad(f.lon), f.alt ?? 0),
  );

  // Compute mean ECEF as reference
  const n = ecef.length;
  const meanX = ecef.reduce((s, p) => s + p[0], 0) / n;
  const meanY = ecef.reduce((s, p) => s + p[1], 0) / n;
  const meanZ = ecef.reduce((s, p) => s + p[2], 0) / n;

  return fixes.map((f, i) => {
    const [dE, dN, dU] = getEnuDifference(
      ecef[i]![0],
      ecef[i]![1],
      ecef[i]![2],
      meanX,
      meanY,
      meanZ,
    );
    return {
      label: formatTimeLabel(f, i),
      dE: Math.round(dE * 1000) / 1000,
      dN: Math.round(dN * 1000) / 1000,
      dU: Math.round(dU * 1000) / 1000,
      satellites: f.satellites,
    };
  });
}

function formatTimeLabel(fix: NmeaFix, index: number): string {
  if (fix.time) {
    const d = fix.time;
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
  }
  return String(index);
}

function knotsToKmh(knots: number): number {
  return knots * 1.852;
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        {title}
      </span>
      <div style={{ width: '100%', height: 180 }}>{children}</div>
    </div>
  );
}

export default function NmeaCharts({ fixes }: { fixes: NmeaFix[] }) {
  const theme = useChartTheme();
  const data = useMemo<ChartData[]>(
    () =>
      fixes.map((f, i) => ({
        label: formatTimeLabel(f, i),
        time: i,
        alt: f.alt,
        satellites: f.satellites,
        speed: f.speed !== null ? knotsToKmh(f.speed) : null,
      })),
    [fixes],
  );

  const enuData = useMemo(
    () => (fixes.length >= 2 ? computeEnuData(fixes) : []),
    [fixes],
  );

  const hasAlt = data.some((d) => d.alt !== null);
  const hasSat = data.some((d) => d.satellites !== null);
  const hasSpeed = data.some((d) => d.speed !== null);
  const hasEnu = enuData.length >= 2;

  // Compute symmetric domain for the scatter plot so E/N axes have the same scale
  const scatterDomain = useMemo(() => {
    if (!hasEnu) return 1;
    const maxAbs = enuData.reduce(
      (m, p) => Math.max(m, Math.abs(p.dE), Math.abs(p.dN)),
      0,
    );
    // Add 10% padding
    return Math.ceil(maxAbs * 1.1 * 1000) / 1000 || 1;
  }, [enuData, hasEnu]);

  if (!hasAlt && !hasSat && !hasSpeed && !hasEnu) return null;

  // Downsample tick labels for the X axis to avoid clutter
  const tickInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="flex flex-col gap-4">
      {hasAlt && (
        <ChartCard title="Altitude (m)">
          <ResponsiveContainer>
            <AreaChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={45}
                domain={['auto', 'auto']}
              />
              <Tooltip {...theme.tooltipStyle} />
              <defs>
                <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c8aff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c8aff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="alt"
                stroke="#7c8aff"
                strokeWidth={1.5}
                fill="url(#altGrad)"
                dot={false}
                connectNulls
                name="Altitude"
                unit=" m"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasSat && (
        <ChartCard title="Satellites">
          <ResponsiveContainer>
            <LineChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={30}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <Tooltip {...theme.tooltipStyle} />
              <Line
                type="stepAfter"
                dataKey="satellites"
                stroke="#4ade80"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name="Satellites"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasSpeed && (
        <ChartCard title="Speed (km/h)">
          <ResponsiveContainer>
            <AreaChart
              data={data}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={theme.gridStroke} />
              <XAxis
                dataKey="label"
                tick={theme.axisStyle}
                interval={tickInterval}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={theme.axisStyle}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={[0, 'auto']}
              />
              <Tooltip {...theme.tooltipStyle} />
              <defs>
                <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="speed"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#speedGrad)"
                dot={false}
                connectNulls
                name="Speed"
                unit=" km/h"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {hasEnu && (
        <>
          {/* E/N scatter plot — square aspect ratio */}
          <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
              Position scatter — East vs North (m)
            </span>
            <div className="flex justify-center">
              <ResponsiveContainer width="100%" aspect={1} maxHeight={400}>
                <ScatterChart
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={theme.gridStroke}
                  />
                  <XAxis
                    dataKey="dE"
                    type="number"
                    name="East"
                    tick={theme.axisStyle}
                    tickLine={false}
                    axisLine={false}
                    domain={[-scatterDomain, scatterDomain]}
                    label={{
                      value: 'East (m)',
                      position: 'insideBottom',
                      offset: -2,
                      fill: theme.axisStyle.fill,
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    dataKey="dN"
                    type="number"
                    name="North"
                    tick={theme.axisStyle}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                    domain={[-scatterDomain, scatterDomain]}
                    label={{
                      value: 'North (m)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      fill: theme.axisStyle.fill,
                      fontSize: 10,
                    }}
                  />
                  <ZAxis range={[8, 8]} />
                  <Tooltip
                    {...theme.tooltipStyle}
                    formatter={(value) => [
                      `${Number(value ?? 0).toFixed(3)} m`,
                    ]}
                  />
                  <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  <Scatter data={enuData} fillOpacity={0.6}>
                    {enuData.map((pt, i) => (
                      <Cell key={i} fill={satColor(pt.satellites)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ENU time series */}
          <ChartCard title="ENU deviation from mean (m)">
            <ResponsiveContainer>
              <LineChart
                data={enuData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={theme.gridStroke}
                />
                <XAxis
                  dataKey="label"
                  tick={theme.axisStyle}
                  interval={tickInterval}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={theme.axisStyle}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  domain={['auto', 'auto']}
                  unit=" m"
                />
                <Tooltip
                  {...theme.tooltipStyle}
                  formatter={(value) => [`${Number(value ?? 0).toFixed(3)} m`]}
                />
                <Legend
                  iconSize={10}
                  wrapperStyle={{ fontSize: 11, color: theme.legendColor }}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                <Line
                  type="monotone"
                  dataKey="dE"
                  stroke="#7c8aff"
                  strokeWidth={1.5}
                  dot={false}
                  name="East"
                />
                <Line
                  type="monotone"
                  dataKey="dN"
                  stroke="#4ade80"
                  strokeWidth={1.5}
                  dot={false}
                  name="North"
                />
                <Line
                  type="monotone"
                  dataKey="dU"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  dot={false}
                  name="Up"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}
    </div>
  );
}
