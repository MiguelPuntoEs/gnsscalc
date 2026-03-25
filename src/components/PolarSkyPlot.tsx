import { useRef, useEffect, useCallback } from 'react';
import type { SatAzEl } from 'gnss-js/orbit';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

export type TrackPoint = {
  az: number;
  el: number;
  lat: number;
  lon: number;
  epoch: number;
};
export type TrackSegments = Record<string, TrackPoint[][]>;

export default function PolarSkyPlot({
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
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
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
        const r = R * (1 - (elDeg * Math.PI) / 180 / (Math.PI / 2));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Azimuth lines
      for (let azDeg = 0; azDeg < 360; azDeg += 30) {
        const az = (azDeg * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + R * Math.sin(az), cy - R * Math.cos(az));
        ctx.stroke();
      }

      const t = getChartTheme();

      // Direction labels
      ctx.fillStyle = t.canvasText + '0.5)';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const dirs = [
        'N',
        '30',
        '60',
        'E',
        '120',
        '150',
        'S',
        '210',
        '240',
        'W',
        '300',
        '330',
      ];
      for (let i = 0; i < 12; i++) {
        const az = (i * 30 * Math.PI) / 180;
        ctx.fillText(
          dirs[i]!,
          cx + (R + 18) * Math.sin(az),
          cy - (R + 18) * Math.cos(az),
        );
      }

      // Elevation labels
      ctx.fillStyle = t.canvasText + '0.25)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'left';
      for (const elDeg of [30, 60]) {
        const r = R * (1 - (elDeg * Math.PI) / 180 / (Math.PI / 2));
        ctx.fillText(`${elDeg}°`, cx + 3, cy - r + 3);
      }

      // Elevation mask shading — ring from horizon (0°) to mask elevation
      if (elevMaskDeg > 0) {
        const rMask = R * (1 - (elevMaskDeg * Math.PI) / 180 / (Math.PI / 2));
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 2 * Math.PI); // outer (horizon)
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
        const isObserved = !hasObsInfo || observedPrns.has(prn);
        const color = SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff';
        ctx.strokeStyle = isObserved ? color : t.canvasText + '0.15)';
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
        const color = isObserved
          ? (SYSTEM_COLORS[prn.charAt(0)] ?? '#7c8aff')
          : t.unobservedDot;
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
        ctx.fillStyle = isObserved
          ? t.canvasText + '0.8)'
          : t.canvasText + '0.2)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(prn, x + 7, y - 3);
      };
      // Unobserved first
      for (const [prn, sat] of entries) {
        if (hasObsInfo && !observedPrns.has(prn)) drawSat(prn, sat, false);
      }
      // Observed on top
      for (const [prn, sat] of entries) {
        if (!hasObsInfo || observedPrns.has(prn)) drawSat(prn, sat, true);
      }
    },
    [tracks, currentPositions, observedPrns, elevMaskDeg],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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

      let closest: {
        prn: string;
        dist: number;
        az: number;
        el: number;
      } | null = null;
      for (const [prn, sat] of Object.entries(currentPositions)) {
        const r = R * (1 - sat.el / (Math.PI / 2));
        const sx = cx + r * Math.sin(sat.az);
        const sy = cy - r * Math.cos(sat.az);
        const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
        if (dist < 15 && (!closest || dist < closest.dist)) {
          closest = { prn, dist, az: sat.az, el: sat.el };
        }
      }

      if (!closest) {
        tip.style.display = 'none';
        return;
      }
      tip.style.display = 'block';
      tip.style.left = `${mx + 12}px`;
      tip.style.top = `${my - 8}px`;
      const azDeg = ((closest.az * 180) / Math.PI + 360) % 360;
      const elDeg = (closest.el * 180) / Math.PI;
      tip.textContent = `${closest.prn}: Az ${azDeg.toFixed(1)}° El ${elDeg.toFixed(1)}°`;
    },
    [currentPositions],
  );

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  return (
    <div
      className="relative"
      style={{ width: '100%', aspectRatio: '1', maxHeight: 520 }}
    >
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
        style={{
          display: 'none',
          backgroundColor: theme.tooltipBg,
          border: theme.tooltipBorder,
          color: theme.tooltipFg,
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  );
}
