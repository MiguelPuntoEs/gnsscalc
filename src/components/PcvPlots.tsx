import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { FrequencyData } from 'gnss-js/antex';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

/* ─── Shared helpers ───────────────────────────────────────────── */

/** Pick a "nice" step value (1, 2, 5 × 10^n) for ~targetTicks in a range. */
function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const exp = Math.floor(Math.log10(rough));
  const frac = rough / Math.pow(10, exp);
  let nice: number;
  if (frac <= 1.5) nice = 1;
  else if (frac <= 3.5) nice = 2;
  else if (frac <= 7.5) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

/** Diverging blue–white–red color as [r,g,b] for a normalized value t in -1..+1. */
function pcvColorRGB(t: number): [number, number, number] {
  if (t <= 0) {
    const u = Math.min(1, -t);
    return [
      Math.round(60 + (1 - u) * 195),
      Math.round(100 + (1 - u) * 155),
      Math.round(220 + (1 - u) * 35),
    ];
  }
  const u = Math.min(1, t);
  return [255, Math.round(255 - u * 155), Math.round(255 - u * 195)];
}

/* ─── PCV Polar Plot (canvas) ──────────────────────────────────── */

interface PcvPlotProps {
  freq: FrequencyData;
  zen1: number;
  zen2: number;
  dzen: number;
  dazi: number;
}

export function PcvPolarPlot({ freq, zen1, zen2, dzen, dazi }: PcvPlotProps) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const hasAzimuth = dazi > 0 && freq.pcv.length > 0;
  const numZen = dzen > 0 ? Math.round((zen2 - zen1) / dzen) + 1 : 0;

  // Find min/max PCV values for color mapping
  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    if (hasAzimuth) {
      for (const row of freq.pcv) {
        for (const v of row) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    } else {
      for (const v of freq.pcvNoazi) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min)) {
      min = 0;
      max = 0;
    }
    return { minVal: min, maxVal: max };
  }, [freq, hasAzimuth]);

  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;
  const pcvColor = useCallback(
    (val: number): string => {
      const t = val / absMax;
      const [r, g, b] = pcvColorRGB(t);
      return `rgb(${r},${g},${b})`;
    },
    [absMax],
  );

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ct = getChartTheme();
      const ctx = canvas.getContext('2d');
      if (!ctx || numZen === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const barSpace = 40; // reserve space below polar circle for color bar
      const size = Math.min(rect.width, rect.height - barSpace);
      const cx = rect.width / 2;
      const cy = size / 2;
      const R = (size - 60) / 2;

      const zenToR = (zenDeg: number) => (R * (zenDeg - zen1)) / (zen2 - zen1);

      if (hasAzimuth) {
        // Draw filled sectors
        const numAzi = freq.pcv.length;
        const aziStep = (dazi * Math.PI) / 180;
        for (let ai = 0; ai < numAzi; ai++) {
          const az0 = ai * aziStep - aziStep / 2;
          const az1 = ai * aziStep + aziStep / 2;
          for (let zi = 0; zi < numZen - 1; zi++) {
            const zenDeg0 = zen1 + zi * dzen;
            const zenDeg1 = zenDeg0 + dzen;
            const r0 = zenToR(zenDeg0);
            const r1 = zenToR(zenDeg1);
            const val = freq.pcv[ai]?.[zi] ?? 0;
            ctx.fillStyle = pcvColor(val);
            ctx.beginPath();
            // Polar sector: North is up, clockwise
            ctx.arc(cx, cy, r1, az0 - Math.PI / 2, az1 - Math.PI / 2);
            ctx.arc(cx, cy, r0, az1 - Math.PI / 2, az0 - Math.PI / 2, true);
            ctx.closePath();
            ctx.fill();
          }
        }
      } else {
        // No azimuth dependence — draw concentric rings
        for (let zi = 0; zi < numZen - 1; zi++) {
          const zenDeg0 = zen1 + zi * dzen;
          const zenDeg1 = zenDeg0 + dzen;
          const r0 = zenToR(zenDeg0);
          const r1 = zenToR(zenDeg1);
          const val = freq.pcvNoazi[zi] ?? 0;
          ctx.fillStyle = pcvColor(val);
          ctx.beginPath();
          ctx.arc(cx, cy, r1, 0, 2 * Math.PI);
          ctx.arc(cx, cy, r0, 0, 2 * Math.PI, true);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Grid rings at key zenith angles
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      const ringStep = zen2 <= 20 ? 5 : zen2 <= 45 ? 15 : 30;
      for (let z = zen1; z <= zen2; z += ringStep) {
        const r = zenToR(z);
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

      // Labels — direction
      ctx.fillStyle = ct.canvasText + '0.5)';
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

      // Zenith angle labels
      ctx.fillStyle = ct.canvasText + '0.3)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'left';
      for (let z = zen1 + ringStep; z < zen2; z += ringStep) {
        const r = zenToR(z);
        ctx.fillText(`${z}°`, cx + 3, cy - r + 3);
      }

      // Color bar legend with tick marks
      const barW = Math.min(200, rect.width * 0.45);
      const barH = 10;
      const barX = (rect.width - barW) / 2;
      const barY = size + 4;
      for (let i = 0; i < barW; i++) {
        const v = -absMax + (2 * absMax * i) / barW;
        ctx.fillStyle = pcvColor(v);
        ctx.fillRect(barX + i, barY, 1.5, barH);
      }
      // Border around color bar
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barW, barH);
      // Tick marks — aim for ~5 ticks
      ctx.fillStyle = ct.canvasText + '0.5)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tickStep = niceStep(2 * absMax, 5);
      const tickStart = Math.ceil(-absMax / tickStep) * tickStep;
      for (let tv = tickStart; tv <= absMax + tickStep * 0.01; tv += tickStep) {
        const tx = barX + ((tv + absMax) / (2 * absMax)) * barW;
        // Tick line
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(tx, barY + barH);
        ctx.lineTo(tx, barY + barH + 3);
        ctx.stroke();
        // Label
        ctx.fillStyle = ct.canvasText + '0.5)';
        ctx.fillText(tv.toFixed(1), tx, barY + barH + 4);
      }
      // Unit label below ticks
      ctx.fillStyle = ct.canvasText + '0.35)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText('PCV [mm]', barX + barW / 2, barY + barH + 16);
    },
    [freq, numZen, hasAzimuth, zen1, zen2, dzen, dazi, pcvColor, absMax],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  // Tooltip
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const tip = tooltipRef.current;
      if (!canvas || !tip || numZen === 0) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const size = Math.min(rect.width, rect.height - 40);
      const cxP = rect.width / 2;
      const cyP = size / 2;
      const R = (size - 60) / 2;

      const dx = mx - cxP;
      const dy = -(my - cyP);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R + 5) {
        tip.style.display = 'none';
        return;
      }

      const zenDeg = zen1 + (dist / R) * (zen2 - zen1);
      if (zenDeg < zen1 || zenDeg > zen2) {
        tip.style.display = 'none';
        return;
      }

      let azDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const zi = Math.round((zenDeg - zen1) / dzen);
      let val: number;

      if (hasAzimuth && dazi > 0) {
        const ai = Math.round(azDeg / dazi) % Math.round(360 / dazi + 1);
        val = freq.pcv[ai]?.[zi] ?? 0;
        azDeg = ai * dazi;
      } else {
        val = freq.pcvNoazi[zi] ?? 0;
      }

      tip.style.display = 'block';
      tip.style.left = `${mx + 12}px`;
      tip.style.top = `${my - 8}px`;
      const zenDisplay = (zen1 + zi * dzen).toFixed(0);
      tip.textContent = hasAzimuth
        ? `Az ${azDeg.toFixed(0)}° Zen ${zenDisplay}°: ${val.toFixed(2)} mm`
        : `Zen ${zenDisplay}°: ${val.toFixed(2)} mm`;
    },
    [freq, numZen, zen1, zen2, dzen, dazi, hasAzimuth],
  );

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numZen === 0)
    return <p className="text-sm text-fg/40">No PCV data available.</p>;

  return (
    <div
      className="relative"
      style={{ width: '100%', aspectRatio: '10/11', maxHeight: 520 }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Phase center variation polar plot for ${freq.frequency}`}
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

/* ─── PCV 3D Surface Plot (canvas) ─────────────────────────────── */

export function PcvSurfacePlot({ freq, zen1, zen2, dzen, dazi }: PcvPlotProps) {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAzimuth = dazi > 0 && freq.pcv.length > 0;
  const numZen = dzen > 0 ? Math.round((zen2 - zen1) / dzen) + 1 : 0;

  // Camera angles — drag to rotate
  const [rotX, setRotX] = useState(75);
  const [rotZ, setRotZ] = useState(-10);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRotX: number;
    startRotZ: number;
  } | null>(null);

  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    if (hasAzimuth) {
      for (const row of freq.pcv)
        for (const v of row) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
    } else {
      for (const v of freq.pcvNoazi) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min)) {
      min = 0;
      max = 0;
    }
    return { minVal: min, maxVal: max };
  }, [freq, hasAzimuth]);

  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;

  // Build 3D rectangular mesh: X=elevation/zenith, Y=azimuth, Z=PCV
  // Matches matplotlib's np.meshgrid(elevs, azs) approach
  const mesh = useMemo(() => {
    const rows: { x: number; y: number; z: number; val: number }[][] = [];
    if (!hasAzimuth) {
      // Synthesize azimuth rows from NOAZI data
      const synthAziStep = 10;
      for (let azDeg = 0; azDeg <= 360; azDeg += synthAziStep) {
        const row: { x: number; y: number; z: number; val: number }[] = [];
        for (let zi = 0; zi < numZen; zi++) {
          const zenDeg = zen1 + zi * dzen;
          const val = freq.pcvNoazi[zi] ?? 0;
          row.push({ x: zenDeg, y: azDeg, z: val, val });
        }
        rows.push(row);
      }
    } else {
      const numAzi = freq.pcv.length;
      for (let ai = 0; ai <= numAzi; ai++) {
        const azi = ai % numAzi;
        const azDeg = ai * dazi;
        const row: { x: number; y: number; z: number; val: number }[] = [];
        for (let zi = 0; zi < numZen; zi++) {
          const zenDeg = zen1 + zi * dzen;
          const val = freq.pcv[azi]?.[zi] ?? 0;
          row.push({ x: zenDeg, y: azDeg, z: val, val });
        }
        rows.push(row);
      }
    }
    return rows;
  }, [freq, numZen, hasAzimuth, zen1, dzen, dazi]);

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ct = getChartTheme();
      const ctx = canvas.getContext('2d');
      if (!ctx || mesh.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const W = rect.width;
      const H = rect.height;

      // ── Normalize to [-1, 1] cube ──
      // X = elevation, Y = azimuth, Z = PCV
      const zenMid = (zen1 + zen2) / 2;
      const zenHalf = Math.max((zen2 - zen1) / 2, 1);
      const aziMid = 180;
      const aziHalf = 180;
      // Keep aspect ratio: azimuth range is typically much wider than zenith
      const aspect = aziHalf / zenHalf;
      // Normalized coords: nx in [-1,1], ny in [-aspect, aspect], nz scaled to look good
      const zHeight = 0.5; // Z axis height relative to unit

      // ── Rotation (matplotlib-style: azim rotates around Z, elev tilts) ──
      const elev = (rotX * Math.PI) / 180;
      const azim = (rotZ * Math.PI) / 180;
      const ce = Math.cos(elev),
        se = Math.sin(elev);
      const ca = Math.cos(azim),
        sa = Math.sin(azim);

      // Scale to fit canvas with padding
      const fitScale = Math.min(W, H) * 0.28;
      const cxScreen = W / 2;
      const cyScreen = H * 0.48;

      const project = (
        xRaw: number,
        yRaw: number,
        zRaw: number,
      ): [number, number, number] => {
        // Normalize to centered unit coordinates
        const nx = (xRaw - zenMid) / zenHalf;
        const ny = ((yRaw - aziMid) / aziHalf) * aspect;
        const nz = (zRaw / absMax) * zHeight;

        // Rotate around Z by azim
        const x1 = nx * ca - ny * sa;
        const y1 = nx * sa + ny * ca;
        const z1 = nz;

        // Rotate around X by elev (tilt camera up)
        const y2 = y1 * ce - z1 * se;
        const z2 = y1 * se + z1 * ce;

        // Orthographic projection → screen
        return [
          cxScreen + x1 * fitScale,
          cyScreen - y2 * fitScale,
          z2, // depth for sorting
        ];
      };

      // ── Project all vertices ──
      const projected: [number, number, number][][] = mesh.map((row) =>
        row.map((p) => project(p.x, p.y, p.z)),
      );

      // ── Build & depth-sort quads ──
      type Quad = { pts: [number, number][]; depth: number; val: number };
      const quads: Quad[] = [];

      for (let ai = 0; ai < mesh.length - 1; ai++) {
        const pr0 = projected[ai]!;
        const pr1 = projected[ai + 1]!;
        const mr0 = mesh[ai]!;
        const mr1 = mesh[ai + 1]!;
        for (let zi = 0; zi < pr0.length - 1; zi++) {
          const avgVal =
            (mr0[zi]!.val +
              mr0[zi + 1]!.val +
              mr1[zi]!.val +
              mr1[zi + 1]!.val) /
            4;
          quads.push({
            pts: [
              [pr0[zi]![0], pr0[zi]![1]],
              [pr0[zi + 1]![0], pr0[zi + 1]![1]],
              [pr1[zi + 1]![0], pr1[zi + 1]![1]],
              [pr1[zi]![0], pr1[zi]![1]],
            ],
            depth:
              (pr0[zi]![2] + pr0[zi + 1]![2] + pr1[zi]![2] + pr1[zi + 1]![2]) /
              4,
            val: avgVal,
          });
        }
      }

      quads.sort((a, b) => a.depth - b.depth);

      // ── Draw filled surface ──
      for (const q of quads) {
        const t = q.val / absMax;
        const [r, g, b] = pcvColorRGB(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.moveTo(q.pts[0]![0], q.pts[0]![1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(q.pts[k]![0], q.pts[k]![1]);
        ctx.closePath();
        ctx.fill();
      }

      // ── Wireframe mesh ──
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.4;

      // Lines along elevation (constant azimuth)
      for (let ai = 0; ai < projected.length; ai++) {
        const row = projected[ai]!;
        ctx.beginPath();
        ctx.moveTo(row[0]![0], row[0]![1]);
        for (let zi = 1; zi < row.length; zi++)
          ctx.lineTo(row[zi]![0], row[zi]![1]);
        ctx.stroke();
      }
      // Lines along azimuth (constant elevation)
      const nCols = projected[0]?.length ?? 0;
      for (let zi = 0; zi < nCols; zi++) {
        ctx.beginPath();
        ctx.moveTo(projected[0]![zi]![0], projected[0]![zi]![1]);
        for (let ai = 1; ai < projected.length; ai++)
          ctx.lineTo(projected[ai]![zi]![0], projected[ai]![zi]![1]);
        ctx.stroke();
      }

      // ── Axes from corner ──
      const [ox, oy] = project(zen1, 0, 0);
      ctx.lineWidth = 1.2;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textBaseline = 'middle';

      // Elevation axis
      const [eax, eay] = project(zen2 + zenHalf * 0.15, 0, 0);
      ctx.strokeStyle = 'rgba(96,165,250,0.6)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(eax, eay);
      ctx.stroke();
      ctx.fillStyle = 'rgba(96,165,250,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(`Elev [°]`, eax, eay + 14);

      // Azimuth axis
      const [aax, aay] = project(zen1, 360 + aziHalf * 0.08, 0);
      ctx.strokeStyle = 'rgba(74,222,128,0.6)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(aax, aay);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74,222,128,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(`Az [°]`, aax, aay + 14);

      // PCV axis (vertical)
      const [pax, pay] = project(zen1, 0, absMax * 1.5);
      ctx.strokeStyle = ct.canvasText + '0.5)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(pax, pay);
      ctx.stroke();
      ctx.fillStyle = ct.canvasText + '0.6)';
      ctx.textAlign = 'left';
      ctx.fillText('PCV [mm]', pax + 5, pay);

      // Z-axis tick marks
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = ct.canvasText + '0.4)';
      ctx.strokeStyle = ct.canvasText + '0.2)';
      ctx.lineWidth = 0.5;
      const zTickStep = niceStep(2 * absMax, 4);
      const zTickStart = Math.ceil(-absMax / zTickStep) * zTickStep;
      for (
        let tv = zTickStart;
        tv <= absMax + zTickStep * 0.01;
        tv += zTickStep
      ) {
        const [tx, ty] = project(zen1, 0, tv);
        const [tx2] = project(zen1 - zenHalf * 0.06, 0, tv);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx2, ty);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(tv.toFixed(1), tx2 - 3, ty);
      }

      // ── Color bar ──
      const barW = Math.min(180, W * 0.4);
      const barH = 8;
      const barX = (W - barW) / 2;
      const barY = H - 30;
      for (let i = 0; i < barW; i++) {
        const v = -1 + (2 * i) / barW;
        const [cr, cg, cb] = pcvColorRGB(v);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(barX + i, barY, 1.5, barH);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.fillStyle = ct.canvasText + '0.5)';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tickStep = niceStep(2 * absMax, 5);
      const tickStart = Math.ceil(-absMax / tickStep) * tickStep;
      for (let tv = tickStart; tv <= absMax + tickStep * 0.01; tv += tickStep) {
        const tx = barX + ((tv / absMax + 1) / 2) * barW;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(tx, barY + barH);
        ctx.lineTo(tx, barY + barH + 3);
        ctx.stroke();
        ctx.fillStyle = ct.canvasText + '0.5)';
        ctx.fillText(tv.toFixed(1), tx, barY + barH + 4);
      }
      ctx.fillStyle = ct.canvasText + '0.3)';
      ctx.fillText('PCV [mm]', barX + barW / 2, barY + barH + 15);
    },
    [mesh, rotX, rotZ, absMax, zen1, zen2],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  // Mouse drag rotation
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startRotX: rotX,
        startRotZ: rotZ,
      };
    },
    [rotX, rotZ],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) {
      // Tooltip logic for hover
      const canvas = canvasRef.current;
      const tip = tooltipRef.current;
      if (canvas && tip) {
        tip.style.display = 'none';
      }
      return;
    }
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setRotZ(dragRef.current.startRotZ + dx * 0.5);
    setRotX(Math.max(5, Math.min(85, dragRef.current.startRotX - dy * 0.5)));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Touch drag rotation
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      dragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        startRotX: rotX,
        startRotZ: rotZ,
      };
    },
    [rotX, rotZ],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0]!;
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    setRotZ(dragRef.current.startRotZ + dx * 0.5);
    setRotX(Math.max(5, Math.min(85, dragRef.current.startRotX - dy * 0.5)));
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (numZen === 0)
    return <p className="text-sm text-fg/40">No PCV data available.</p>;

  return (
    <div
      className="relative"
      style={{ width: '100%', aspectRatio: '4/3', maxHeight: 480 }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`3D PCV surface plot for ${freq.frequency}`}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
      <div className="absolute bottom-1 right-2 text-[9px] text-fg/20">
        Drag to rotate
      </div>
    </div>
  );
}
