import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { SYSTEM_COLORS } from '../../util/gnss-constants';
import { useChartTheme, getChartTheme } from '../../hooks/useChartTheme';
import { ecefToGeodetic } from 'gnss-js/coordinates';
import type { SatAzEl } from 'gnss-js/orbit';

export default function LiveSkyPlot({
  satellites,
  stationPosition,
}: {
  satellites: SatAzEl[];
  stationPosition: [number, number, number];
}) {
  useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<{
    sat: SatAzEl;
    x: number;
    y: number;
  } | null>(null);

  // Keep satellite positions for hit testing (CSS coords, not DPR-scaled)
  const satPositions = useRef<
    { prn: string; x: number; y: number; sat: SatAzEl }[]
  >([]);

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

      // Elevation mask shading (5°)
      const maskDeg = 5;
      const rMask = R * (1 - (maskDeg * Math.PI) / 180 / (Math.PI / 2));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 2 * Math.PI);
      ctx.arc(cx, cy, rMask, 0, 2 * Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 60, 60, 0.07)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, rMask, 0, 2 * Math.PI);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Draw satellites
      const positions: { prn: string; x: number; y: number; sat: SatAzEl }[] =
        [];
      for (const sat of satellites) {
        if (sat.el < 0) continue;
        const color = SYSTEM_COLORS[sat.prn.charAt(0)] ?? '#7c8aff';
        const [x, y] = toXY(sat.az, sat.el);
        const observed = sat.cn0 !== undefined && sat.cn0 > 0;
        positions.push({ prn: sat.prn, x, y, sat });

        if (observed) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
        }
        ctx.fillStyle = observed ? color : t.unobservedDot;
        ctx.beginPath();
        ctx.arc(x, y, observed ? 5 : 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = observed
          ? t.canvasText + '0.8)'
          : t.canvasText + '0.2)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(sat.prn, x + 7, y - 3);
      }
      satPositions.current = positions;
    },
    [satellites],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas);
  }, [draw]);

  // Station coordinates for display
  const geo = useMemo(() => {
    const [lat, lon, alt] = ecefToGeodetic(...stationPosition);
    return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI, alt };
  }, [stationPosition]);

  const aboveMask = satellites.filter(
    (s) => s.el >= (5 * Math.PI) / 180,
  ).length;

  return (
    <div className="rounded-lg border border-border/40 bg-bg-raised/30 p-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-medium text-fg/60">Sky Plot</span>
        <span className="text-[10px] text-fg/30 font-mono">
          {geo.lat.toFixed(4)}° {geo.lat >= 0 ? 'N' : 'S'}, {geo.lon.toFixed(4)}
          ° {geo.lon >= 0 ? 'E' : 'W'}, {geo.alt.toFixed(1)}m
        </span>
        <span className="text-[10px] text-fg/40 ml-auto">
          {aboveMask} sats &gt;5°
        </span>
      </div>
      <div className="relative max-w-[400px] mx-auto">
        <canvas
          ref={canvasRef}
          className="w-full aspect-square"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const HIT = 14;
            let closest: (typeof satPositions.current)[0] | null = null;
            let closestDist = HIT * HIT;
            for (const sp of satPositions.current) {
              const dx = sp.x - mx,
                dy = sp.y - my;
              const d2 = dx * dx + dy * dy;
              if (d2 < closestDist) {
                closest = sp;
                closestDist = d2;
              }
            }
            if (closest) {
              setHovered({
                sat: closest.sat,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            } else {
              setHovered(null);
            }
          }}
          onMouseLeave={() => setHovered(null)}
        />
        {hovered && (
          <div
            className="absolute pointer-events-none z-10 rounded-md bg-bg-raised border border-border/40 px-2.5 py-1.5 text-[10px] font-mono shadow-lg"
            style={{
              left: Math.min(
                hovered.x + 12,
                (canvasRef.current?.getBoundingClientRect().width ?? 400) - 120,
              ),
              top: hovered.y < 60 ? hovered.y + 12 : hovered.y - 60,
            }}
          >
            <div
              className="font-semibold text-xs mb-0.5"
              style={{
                color: SYSTEM_COLORS[hovered.sat.prn.charAt(0)] ?? '#7c8aff',
              }}
            >
              {hovered.sat.prn}
            </div>
            <div className="text-fg/60">
              Az {((hovered.sat.az * 180) / Math.PI).toFixed(1)}° &nbsp; El{' '}
              {((hovered.sat.el * 180) / Math.PI).toFixed(1)}°
            </div>
            {hovered.sat.cn0 !== undefined && hovered.sat.cn0 > 0 && (
              <div className="text-fg/60">
                C/N₀ {hovered.sat.cn0.toFixed(1)} dB-Hz
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
