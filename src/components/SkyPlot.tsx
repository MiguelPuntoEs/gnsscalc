import { useMemo, useRef, useEffect, useCallback, useState } from 'react';
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
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EpochSkyData, SatAzEl, AllPositionsData } from '../util/orbit';
import { computeDop } from '../util/orbit';
import { systemName, systemCmp } from '../util/rinex';
import { SYSTEM_COLORS, GRID_STROKE, AXIS_STYLE, TOOLTIP_STYLE, DEFAULT_ELEV_MASK_DEG } from '../util/gnss-constants';
import ChartCard from './ChartCard';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const TOOLTIP_DIV_STYLE: React.CSSProperties = {
  display: 'none',
  backgroundColor: '#32323f',
  border: '1px solid rgba(74,74,90,0.6)',
  color: '#d0d0d3',
  whiteSpace: 'nowrap',
};

/* ================================================================== */
/*  Shared types for lifted state                                      */
/* ================================================================== */

type TrackPoint = { az: number; el: number; lat: number; lon: number; epoch: number };
type TrackSegments = Record<string, TrackPoint[][]>;

/* ================================================================== */
/*  Sky Plot (polar chart on canvas)                                   */
/* ================================================================== */

function PolarSkyPlot({
  tracks,
  currentPositions,
  observedPrns,
  elevMaskDeg,
}: {
  tracks: TrackSegments;
  currentPositions: Record<string, SatAzEl>;
  observedPrns?: Set<string>;
  elevMaskDeg: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const size = Math.min(rect.width, rect.height);
    const cx = rect.width / 2;
    const cy = size / 2;
    const R = (size - 50) / 2;

    const toXY = (az: number, el: number): [number, number] => {
      const r = R * (1 - el / (Math.PI / 2));
      return [cx + r * Math.sin(az), cy - r * Math.cos(az)];
    };

    // Elevation rings
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    for (const elDeg of [0, 15, 30, 45, 60, 75]) {
      const r = R * (1 - (elDeg * Math.PI / 180) / (Math.PI / 2));
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Azimuth lines
    for (let azDeg = 0; azDeg < 360; azDeg += 30) {
      const az = azDeg * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(az), cy - R * Math.cos(az));
      ctx.stroke();
    }

    // Direction labels
    ctx.fillStyle = 'rgba(208,208,211,0.5)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dirs = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    for (let i = 0; i < 12; i++) {
      const az = i * 30 * Math.PI / 180;
      ctx.fillText(dirs[i]!, cx + (R + 18) * Math.sin(az), cy - (R + 18) * Math.cos(az));
    }

    // Elevation labels
    ctx.fillStyle = 'rgba(208,208,211,0.25)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    for (const elDeg of [30, 60]) {
      const r = R * (1 - (elDeg * Math.PI / 180) / (Math.PI / 2));
      ctx.fillText(`${elDeg}°`, cx + 3, cy - r + 3);
    }

    // Elevation mask shading — ring from horizon (0°) to mask elevation
    if (elevMaskDeg > 0) {
      const rMask = R * (1 - (elevMaskDeg * Math.PI / 180) / (Math.PI / 2));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 2 * Math.PI);       // outer (horizon)
      ctx.arc(cx, cy, rMask, 0, 2 * Math.PI, true); // inner (mask cutoff)
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 60, 60, 0.07)';
      ctx.fill();
      // Dashed ring at mask boundary
      ctx.beginPath();
      ctx.arc(cx, cy, rMask, 0, 2 * Math.PI);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Whether we have observation info to distinguish observed/unobserved
    const hasObsInfo = observedPrns && observedPrns.size > 0;

    // Satellite tracks
    for (const [prn, segments] of Object.entries(tracks)) {
      const isObserved = !hasObsInfo || observedPrns!.has(prn);
      const color = SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff';
      ctx.strokeStyle = isObserved ? color : 'rgba(208,208,211,0.15)';
      ctx.globalAlpha = isObserved ? 0.2 : 0.1;
      ctx.lineWidth = 1.2;
      for (const seg of segments) {
        ctx.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const [x, y] = toXY(seg[i]!.az, seg[i]!.el);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Current positions — draw unobserved first (behind), then observed
    const entries = Object.entries(currentPositions);
    const drawSat = (prn: string, sat: SatAzEl, isObserved: boolean) => {
      const color = isObserved ? (SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff') : 'rgba(208,208,211,0.25)';
      const [x, y] = toXY(sat.az, sat.el);
      if (isObserved) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, isObserved ? 5 : 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = isObserved ? 'rgba(208,208,211,0.8)' : 'rgba(208,208,211,0.2)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(prn, x + 7, y - 3);
    };
    // Unobserved first
    for (const [prn, sat] of entries) {
      if (hasObsInfo && !observedPrns!.has(prn)) drawSat(prn, sat, false);
    }
    // Observed on top
    for (const [prn, sat] of entries) {
      if (!hasObsInfo || observedPrns!.has(prn)) drawSat(prn, sat, true);
    }
  }, [tracks, currentPositions, observedPrns, elevMaskDeg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const tip = tooltipRef.current;
    if (!canvas || !tip) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const size = Math.min(rect.width, rect.height);
    const cx = rect.width / 2;
    const cy = size / 2;
    const R = (size - 50) / 2;

    let closest: { prn: string; dist: number; az: number; el: number } | null = null;
    for (const [prn, sat] of Object.entries(currentPositions)) {
      const r = R * (1 - sat.el / (Math.PI / 2));
      const sx = cx + r * Math.sin(sat.az);
      const sy = cy - r * Math.cos(sat.az);
      const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
      if (dist < 15 && (!closest || dist < closest.dist)) {
        closest = { prn, dist, az: sat.az, el: sat.el };
      }
    }

    if (!closest) { tip.style.display = 'none'; return; }
    tip.style.display = 'block';
    tip.style.left = `${mx + 12}px`;
    tip.style.top = `${my - 8}px`;
    const azDeg = ((closest.az * 180 / Math.PI) + 360) % 360;
    const elDeg = closest.el * 180 / Math.PI;
    tip.textContent = `${closest.prn}: Az ${azDeg.toFixed(1)}° El ${elDeg.toFixed(1)}°`;
  }, [currentPositions]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  return (
    <div className="relative" style={{ width: '100%', aspectRatio: '1', maxHeight: 520 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Polar sky plot showing satellite positions by azimuth and elevation"
        style={{ width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
        style={TOOLTIP_DIV_STYLE}
      />
    </div>
  );
}

/* ================================================================== */
/*  Ground Track Map (Leaflet)                                         */
/* ================================================================== */

const rxIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x.src ?? markerIcon2x,
  iconUrl: markerIcon.src ?? markerIcon,
  shadowUrl: markerShadow.src ?? markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const RAD2DEG = 180 / Math.PI;

/** Split a segment into sub-segments that don't cross the antimeridian. */
function splitAtAntimeridian(seg: { lat: number; lon: number }[]): [number, number][][] {
  const result: [number, number][][] = [[]];
  for (let i = 0; i < seg.length; i++) {
    const lat = seg[i]!.lat * RAD2DEG;
    const lon = seg[i]!.lon * RAD2DEG;
    if (i > 0) {
      const prevLon = seg[i - 1]!.lon * RAD2DEG;
      if (Math.abs(lon - prevLon) > 180) {
        result.push([]);
      }
    }
    result.at(-1)!.push([lat, lon]);
  }
  return result;
}

function GroundTrackMap({
  tracks,
  currentPositions,
  rxLat,
  rxLon,
}: {
  tracks: TrackSegments;
  currentPositions: Record<string, SatAzEl>;
  rxLat?: number;
  rxLon?: number;
}) {
  const polylines = useMemo(() => {
    const lines: { positions: [number, number][][]; color: string; prn: string }[] = [];
    for (const [prn, segments] of Object.entries(tracks)) {
      const color = SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff';
      const splitSegs: [number, number][][] = [];
      for (const seg of segments) {
        splitSegs.push(...splitAtAntimeridian(seg));
      }
      lines.push({ positions: splitSegs, color, prn });
    }
    return lines;
  }, [tracks]);

  const markers = useMemo(() => {
    return Object.entries(currentPositions).map(([prn, sat]) => ({
      prn,
      lat: sat.lat * RAD2DEG,
      lon: sat.lon * RAD2DEG,
      color: SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff',
    }));
  }, [currentPositions]);

  return (
    <div
      className="relative rounded-xl border border-border/60 overflow-hidden"
      role="region"
      aria-label="Satellite ground track map"
      style={{ height: 380 }}
    >
      <MapContainer
        center={[rxLat != null ? rxLat * RAD2DEG : 20, rxLon != null ? rxLon * RAD2DEG : 0]}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        worldCopyJump
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {polylines.map((line) =>
          line.positions.map((seg, j) => (
            <Polyline
              key={`${line.prn}-${j}`}
              positions={seg}
              pathOptions={{ color: line.color, weight: 1.5, opacity: 0.35 }}
            />
          ))
        )}
        {markers.map((m) => (
          <CircleMarker
            key={m.prn}
            center={[m.lat, m.lon]}
            radius={4}
            pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <span className="text-xs font-mono">{m.prn}: {m.lat.toFixed(2)}°, {m.lon.toFixed(2)}°</span>
            </Popup>
          </CircleMarker>
        ))}
        {rxLat != null && rxLon != null && (
          <Marker position={[rxLat * RAD2DEG, rxLon * RAD2DEG]} icon={rxIcon}>
            <Popup>Receiver</Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-col gap-1 rounded-lg bg-bg-raised/90 backdrop-blur-sm border border-border/60 px-2.5 py-1.5 text-[10px] font-medium text-fg/70">
        {Object.entries(
          Object.keys(currentPositions).reduce<Record<string, number>>((acc, prn) => {
            const sys = prn.charAt(0);
            acc[sys] = (acc[sys] ?? 0) + 1;
            return acc;
          }, {})
        ).sort(([a], [b]) => systemCmp(a, b)).map(([sys, count]) => (
          <div key={sys} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: SYSTEM_COLORS[sys] ?? '#7c8aff' }}
            />
            {systemName(sys)} ({count})
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DOP Timeline                                                       */
/* ================================================================== */

interface DopRow {
  label: string;
  gdop: number | null;
  pdop: number | null;
  hdop: number | null;
  vdop: number | null;
}

function DopTimeline({ skyData }: { skyData: EpochSkyData[] }) {
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
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_STYLE} interval={tickInterval} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} width={30} domain={[0, 'auto']} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'rgba(208,208,211,0.6)' }} />
          <Line type="monotone" dataKey="gdop" stroke="#f87171" strokeWidth={1.5} dot={false} connectNulls name="GDOP" />
          <Line type="monotone" dataKey="pdop" stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls name="PDOP" />
          <Line type="monotone" dataKey="hdop" stroke="#4ade80" strokeWidth={1.5} dot={false} connectNulls name="HDOP" />
          <Line type="monotone" dataKey="vdop" stroke="#fbbf24" strokeWidth={1.5} dot={false} connectNulls name="VDOP" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ================================================================== */
/*  Elevation timeline                                                 */
/* ================================================================== */

function ElevationHeatmap({ skyData }: { skyData: EpochSkyData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const allPrns = useMemo(() => {
    const set = new Set<string>();
    for (const e of skyData) {
      for (const s of e.satellites) set.add(s.prn);
    }
    return [...set].sort(systemCmp);
  }, [skyData]);

  const MAX_COLS = 600;
  const numRows = allPrns.length;
  const colStep = Math.max(1, Math.ceil(skyData.length / MAX_COLS));
  const numCols = Math.ceil(skyData.length / colStep);

  const grid = useMemo(() => {
    const g: (number | undefined)[][] = [];
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      const row: (number | undefined)[] = [];
      for (let c = 0; c < numCols; c++) {
        const epoch = skyData[c * colStep];
        if (!epoch) { row.push(undefined); continue; }
        const sat = epoch.satellites.find(s => s.prn === prn);
        row.push(sat ? sat.el * 180 / Math.PI : undefined);
      }
      g.push(row);
    }
    return g;
  }, [skyData, allPrns, numRows, numCols, colStep]);

  function elColor(deg: number | undefined): string {
    if (deg == null) return 'rgba(255,255,255,0.03)';
    const t = Math.max(0, Math.min(1, deg / 90));
    if (t < 0.33) {
      const u = t / 0.33;
      return `rgb(${Math.round(180 + 75 * u)}, ${Math.round(50 + 130 * u)}, 40)`;
    }
    const u = (t - 0.33) / 0.67;
    return `rgb(${Math.round(255 - 185 * u)}, ${Math.round(180 + 75 * u)}, ${Math.round(40 + 40 * u)})`;
  }

  const LABEL_W = 36;

  const draw = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (numRows === 0 || numCols === 0) return;

    const plotW = rect.width - LABEL_W;
    const plotH = rect.height - 30;
    const cellW = plotW / numCols;
    const cellH = Math.min(plotH / numRows, 14);

    for (let r = 0; r < numRows; r++) {
      const gridRow = grid[r]!;
      for (let c = 0; c < numCols; c++) {
        ctx.fillStyle = elColor(gridRow[c]);
        ctx.fillRect(LABEL_W + c * cellW, r * cellH, cellW + 0.5, cellH - 0.5);
      }
    }

    ctx.font = `${Math.min(cellH - 1, 9)}px ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let r = 0; r < numRows; r++) {
      const prn = allPrns[r]!;
      ctx.fillStyle = SYSTEM_COLORS[prn.charAt(0)] ?? 'rgba(208,208,211,0.5)';
      ctx.fillRect(0, r * cellH, 3, cellH - 0.5);
      ctx.fillStyle = 'rgba(208,208,211,0.5)';
      ctx.fillText(prn, LABEL_W - 4, r * cellH + cellH / 2);
    }

    const actualH = cellH * numRows;
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(numCols / 6));
    for (let c = 0; c < numCols; c += labelStep) {
      const e = skyData[c * colStep];
      if (!e) continue;
      const d = new Date(e.time);
      ctx.fillText(
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
        LABEL_W + c * cellW + cellW / 2,
        actualH + 12,
      );
    }

    const legendY = actualH + 22;
    const legendW = Math.min(140, plotW * 0.4);
    const legendX = LABEL_W + (plotW - legendW) / 2;
    for (let i = 0; i < legendW; i++) {
      ctx.fillStyle = elColor((i / legendW) * 90);
      ctx.fillRect(legendX + i, legendY, 1.5, 8);
    }
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('0°', legendX, legendY + 16);
    ctx.textAlign = 'center';
    ctx.fillText('Elevation', legendX + legendW / 2, legendY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('90°', legendX + legendW, legendY + 16);
  }, [grid, skyData, allPrns, numRows, numCols, colStep]);

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
    if (!canvas || !tip) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const plotW = rect.width - LABEL_W;
    const cellW = plotW / numCols;
    const plotH = rect.height - 30;
    const cellH = Math.min(plotH / numRows, 14);
    const col = Math.floor((x - LABEL_W) / cellW);
    const row = Math.floor(y / cellH);
    if (col < 0 || col >= numCols || row < 0 || row >= numRows) {
      tip.style.display = 'none';
      return;
    }
    const val = grid[row]![col];
    const prn = allPrns[row]!;
    const epoch = skyData[col * colStep];
    const d = epoch ? new Date(epoch.time) : null;
    const timeStr = d ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}` : '';
    tip.style.display = 'block';
    tip.style.left = `${e.clientX - rect.left + 12}px`;
    tip.style.top = `${e.clientY - rect.top - 8}px`;
    tip.textContent = val != null ? `${prn} @ ${timeStr}: ${val.toFixed(1)}° el` : `${prn} @ ${timeStr}: —`;
  }, [grid, allPrns, skyData, numCols, numRows, colStep]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numRows === 0) return null;

  const chartH = Math.min(Math.max(numRows * 14 + 50, 140), 800);

  return (
    <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
        Satellite elevation
      </span>
      <div className="relative" style={{ width: '100%', height: chartH }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Satellite elevation heatmap over time"
          style={{ width: '100%', height: '100%' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs"
          style={TOOLTIP_DIV_STYLE}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Main export — owns timeline, filters, and shared state             */
/* ================================================================== */

export default function SkyPlotCharts({
  allPositions,
  observedPrns,
  rxPos,
}: {
  allPositions: AllPositionsData;
  /** Per-epoch observed PRN sets (aligned with allPositions.times). Null when nav-only. */
  observedPrns?: Set<string>[] | null;
  rxPos?: [number, number, number];
}) {
  const { prns, times, positions } = allPositions;
  const numEpochs = times.length;
  if (numEpochs === 0) return null;

  const hasRxPos = !!rxPos && (rxPos[0] !== 0 || rxPos[1] !== 0 || rxPos[2] !== 0);
  const hasObs = !!observedPrns && observedPrns.length > 0;

  const [elevMaskDeg, setElevMaskDeg] = useState(DEFAULT_ELEV_MASK_DEG);
  const elevMaskRad = elevMaskDeg * Math.PI / 180;

  const [epochIdx, setEpochIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);

  // Discover all constellations
  const allSystems = useMemo(() => {
    const set = new Set<string>();
    for (const prn of prns) set.add(prn.charAt(0));
    return [...set].sort(systemCmp);
  }, [prns]);

  const [enabledSystems, setEnabledSystems] = useState<Set<string>>(() => new Set(allSystems));
  useEffect(() => { setEnabledSystems(new Set(allSystems)); }, [allSystems]);

  const toggleSystem = useCallback((sys: string) => {
    setEnabledSystems(prev => {
      const next = new Set(prev);
      if (next.has(sys)) next.delete(sys);
      else next.add(sys);
      return next;
    });
  }, []);

  // Animation
  useEffect(() => {
    if (!playing) {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (ts - lastFrameRef.current > 50) {
        lastFrameRef.current = ts;
        setEpochIdx(prev => (prev + 1) % numEpochs);
      }
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current != null) cancelAnimationFrame(animRef.current); };
  }, [playing, numEpochs]);

  // Precompute full sky tracks (independent of epochIdx) — O(epochs × prns) once
  // Each point stores its epoch index so slicing can filter by time correctly.
  const fullSkyTracks = useMemo(() => {
    if (!hasRxPos) return {} as TrackSegments;
    const segs: TrackSegments = {};
    const wasAboveMask: Record<string, boolean> = {};
    for (let i = 0; i < numEpochs; i++) {
      const aboveNow = new Set<string>();
      for (const prn of prns) {
        if (!enabledSystems.has(prn.charAt(0))) continue;
        const pt = positions[prn]![i];
        if (!pt || pt.el < elevMaskRad) continue;
        aboveNow.add(prn);
        if (!segs[prn]) segs[prn] = [];
        if (!wasAboveMask[prn]) segs[prn]!.push([]);
        segs[prn]!.at(-1)!.push({ az: pt.az, el: pt.el, lat: pt.lat, lon: pt.lon, epoch: i });
      }
      for (const prn of Object.keys(segs)) {
        wasAboveMask[prn] = aboveNow.has(prn);
      }
    }
    return segs;
  }, [prns, positions, enabledSystems, hasRxPos, numEpochs, elevMaskRad]);

  // Precompute full ground tracks (independent of epochIdx)
  const fullGroundTracks = useMemo(() => {
    const segs: TrackSegments = {};
    for (const prn of prns) {
      if (!enabledSystems.has(prn.charAt(0))) continue;
      const pts = positions[prn]!;
      segs[prn] = [];
      let currentSeg: TrackPoint[] | null = null;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        if (!pt) { currentSeg = null; continue; }
        if (!currentSeg) { currentSeg = []; segs[prn]!.push(currentSeg); }
        currentSeg.push({ az: 0, el: 0, lat: pt.lat, lon: pt.lon, epoch: i });
      }
    }
    return segs;
  }, [prns, positions, enabledSystems]);

  // Slice precomputed tracks up to epochIdx — filter by epoch tag
  const { skyTracks, skyCurrentPositions, skyCurrentObserved } = useMemo(() => {
    if (!hasRxPos) return { skyTracks: {} as TrackSegments, skyCurrentPositions: {} as Record<string, SatAzEl>, skyCurrentObserved: new Set<string>() };
    const sliced: TrackSegments = {};
    for (const [prn, segments] of Object.entries(fullSkyTracks)) {
      const prnSegs: TrackPoint[][] = [];
      for (const seg of segments) {
        // All points in a segment are contiguous, so once we hit epoch > epochIdx we stop
        if (seg[0]!.epoch > epochIdx) break;
        if (seg.at(-1)!.epoch <= epochIdx) {
          prnSegs.push(seg); // entire segment is within range
        } else {
          // Partial segment — find cutoff via binary-ish scan (points are epoch-sorted)
          let end = seg.length;
          for (let j = 0; j < seg.length; j++) {
            if (seg[j]!.epoch > epochIdx) { end = j; break; }
          }
          if (end > 0) prnSegs.push(seg.slice(0, end));
          break; // no later segments can be in range
        }
      }
      if (prnSegs.length > 0) sliced[prn] = prnSegs;
    }

    const cur: Record<string, SatAzEl> = {};
    const obs = new Set<string>();
    if (epochIdx >= 0 && epochIdx < numEpochs) {
      const epochObs = observedPrns?.[epochIdx];
      for (const prn of prns) {
        if (!enabledSystems.has(prn.charAt(0))) continue;
        const pt = positions[prn]![epochIdx];
        if (!pt || pt.el < elevMaskRad) continue;
        cur[prn] = { prn, az: pt.az, el: pt.el, lat: pt.lat, lon: pt.lon };
        if (epochObs?.has(prn)) obs.add(prn);
      }
    }
    return { skyTracks: sliced, skyCurrentPositions: cur, skyCurrentObserved: obs };
  }, [fullSkyTracks, epochIdx, prns, positions, enabledSystems, hasRxPos, observedPrns, numEpochs, elevMaskRad]);

  // Slice ground tracks up to epochIdx — filter by epoch tag
  const { groundTracks, groundCurrentPositions } = useMemo(() => {
    const sliced: TrackSegments = {};
    for (const [prn, segments] of Object.entries(fullGroundTracks)) {
      const prnSegs: TrackPoint[][] = [];
      for (const seg of segments) {
        if (seg[0]!.epoch > epochIdx) break;
        if (seg.at(-1)!.epoch <= epochIdx) {
          prnSegs.push(seg);
        } else {
          let end = seg.length;
          for (let j = 0; j < seg.length; j++) {
            if (seg[j]!.epoch > epochIdx) { end = j; break; }
          }
          if (end > 0) prnSegs.push(seg.slice(0, end));
          break;
        }
      }
      if (prnSegs.length > 0) sliced[prn] = prnSegs;
    }

    const cur: Record<string, SatAzEl> = {};
    for (const prn of prns) {
      if (!enabledSystems.has(prn.charAt(0))) continue;
      const pt = positions[prn]?.[epochIdx];
      if (pt) cur[prn] = { prn, az: 0, el: 0, lat: pt.lat, lon: pt.lon };
    }
    return { groundTracks: sliced, groundCurrentPositions: cur };
  }, [fullGroundTracks, epochIdx, prns, positions, enabledSystems]);

  // Derive EpochSkyData for DOP timeline & elevation heatmap (only observed sats)
  const epochSkyData = useMemo<EpochSkyData[] | null>(() => {
    if (!hasRxPos || !hasObs) return null;
    const result: EpochSkyData[] = [];
    for (let i = 0; i < numEpochs; i++) {
      const sats: SatAzEl[] = [];
      const epochObs = observedPrns![i];
      if (epochObs) {
        for (const prn of epochObs) {
          const pt = positions[prn]?.[i];
          if (!pt || pt.el < elevMaskRad) continue;
          sats.push({ prn, az: pt.az, el: pt.el, lat: pt.lat, lon: pt.lon });
        }
      }
      const dop = computeDop(sats);
      result.push({ time: times[i]!, satellites: sats, dop });
    }
    return result;
  }, [positions, times, observedPrns, hasRxPos, hasObs, numEpochs, elevMaskRad]);

  const currentTime = useMemo(() => {
    if (epochIdx < 0 || epochIdx >= numEpochs) return '';
    const d = new Date(times[epochIdx]!);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} UTC`;
  }, [times, epochIdx, numEpochs]);

  // Receiver geodetic (for ground track map)
  const rxGeo = useMemo(() => {
    if (!rxPos) return null;
    const [x, y, z] = rxPos;
    if (x === 0 && y === 0 && z === 0) return null;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    return { lat, lon };
  }, [rxPos]);

  const satCount = Object.keys(skyCurrentPositions).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Sky plot card (or timeline-only card when nav-only) */}
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg/50">
            {hasRxPos ? 'Sky plot' : 'Satellite orbits'}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-fg/40 font-mono">
            {hasRxPos && <><span>{satCount} SVs</span><span className="text-fg/20">|</span></>}
            <span>{currentTime}</span>
          </div>
        </div>

        {/* Constellation filters */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {allSystems.map(sys => {
            const color = SYSTEM_COLORS[sys] ?? '#7c8aff';
            const enabled = enabledSystems.has(sys);
            return (
              <label key={sys} className="flex items-center gap-1.5 cursor-pointer select-none">
                <span
                  className="size-3 rounded-sm border flex items-center justify-center transition-colors"
                  style={{
                    borderColor: enabled ? color : 'rgba(255,255,255,0.12)',
                    backgroundColor: enabled ? color : 'transparent',
                  }}
                >
                  {enabled && (
                    <svg viewBox="0 0 12 12" fill="none" className="size-2.5">
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#1a1a24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <input type="checkbox" checked={enabled} onChange={() => toggleSystem(sys)} className="sr-only" />
                <span className="text-[11px] text-fg/50" style={{ color: enabled ? color : undefined }}>
                  {systemName(sys)}
                </span>
              </label>
            );
          })}
        </div>

        {hasRxPos && <PolarSkyPlot tracks={skyTracks} currentPositions={skyCurrentPositions} observedPrns={skyCurrentObserved} elevMaskDeg={elevMaskDeg} />}

        {/* Elevation mask slider */}
        {hasRxPos && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-fg/40 whitespace-nowrap">Elev. mask</span>
            <div className="flex-1 relative h-5 flex items-center group cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setElevMaskDeg(Math.round(pct * 45));
              }}
            >
              <div className="absolute inset-x-0 h-[3px] rounded-full bg-border/40" />
              <div
                className="absolute left-0 h-[3px] rounded-full"
                style={{
                  width: `${(elevMaskDeg / 45) * 100}%`,
                  backgroundColor: 'rgba(255, 80, 80, 0.5)',
                }}
              />
              <div
                className="absolute size-3 rounded-full border-2 -translate-x-1/2 transition-transform group-hover:scale-125"
                style={{
                  left: `${(elevMaskDeg / 45) * 100}%`,
                  backgroundColor: 'rgba(255, 80, 80, 0.7)',
                  borderColor: 'var(--color-bg-raised)',
                }}
              />
              <input
                type="range"
                min={0}
                max={45}
                step={1}
                value={elevMaskDeg}
                onChange={(e) => setElevMaskDeg(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[10px] text-fg/50 font-mono w-6 text-right">{elevMaskDeg}°</span>
          </div>
        )}

        {/* Shared timeline controls */}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            className="flex items-center justify-center size-7 rounded-md bg-fg/5 hover:bg-fg/10 text-fg/50 hover:text-fg/70 transition-colors"
            onClick={() => setPlaying(p => !p)}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            )}
          </button>
          <div className="flex-1 relative h-5 flex items-center group cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setEpochIdx(Math.round(pct * (numEpochs - 1)));
              setPlaying(false);
            }}
          >
            <div className="absolute inset-x-0 h-[3px] rounded-full bg-border/40" />
            <div
              className="absolute left-0 h-[3px] rounded-full"
              style={{
                width: `${(epochIdx / Math.max(1, numEpochs - 1)) * 100}%`,
                backgroundColor: 'var(--color-accent)',
                opacity: 0.7,
              }}
            />
            <div
              className="absolute size-3 rounded-full border-2 -translate-x-1/2 transition-transform group-hover:scale-125"
              style={{
                left: `${(epochIdx / Math.max(1, numEpochs - 1)) * 100}%`,
                backgroundColor: 'var(--color-accent)',
                borderColor: 'var(--color-bg-raised)',
              }}
            />
            <input
              type="range"
              min={0}
              max={numEpochs - 1}
              value={epochIdx}
              onChange={(e) => { setEpochIdx(Number(e.target.value)); setPlaying(false); }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Ground track map */}
      <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">Ground tracks</span>
        <GroundTrackMap
          tracks={groundTracks}
          currentPositions={groundCurrentPositions}
          rxLat={rxGeo?.lat}
          rxLon={rxGeo?.lon}
        />
      </div>

      {epochSkyData && <ElevationHeatmap skyData={epochSkyData} />}
      {epochSkyData && <DopTimeline skyData={epochSkyData} />}
    </div>
  );
}
