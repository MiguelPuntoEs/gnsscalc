import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { parseAntex, frequencyLabel } from '../util/antex';
import type { AntexFile, AntennaEntry, FrequencyData } from '../util/antex';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import CopyableInput from './CopyableInput';

/* ─── Icons ────────────────────────────────────────────────────── */

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function AntennaIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}

function SatelliteIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M13 7L9 3 5 7l4 4" />
      <path d="M11 13l4 4 4-4-4-4" />
      <path d="m8 16 2.586-2.586a2 2 0 0 0 0-2.828L8 8" />
      <path d="M3 21c0-4.4 3.6-8 8-8" />
    </svg>
  );
}

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
    return [Math.round(60 + (1 - u) * 195), Math.round(100 + (1 - u) * 155), Math.round(220 + (1 - u) * 35)];
  }
  const u = Math.min(1, t);
  return [255, Math.round(255 - u * 155), Math.round(255 - u * 195)];
}

/* ─── PCV Polar Plot (canvas) ──────────────────────────────────── */

function PcvPolarPlot({
  freq,
  zen1,
  zen2,
  dzen,
  dazi,
}: {
  freq: FrequencyData;
  zen1: number;
  zen2: number;
  dzen: number;
  dazi: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const hasAzimuth = dazi > 0 && freq.pcv.length > 0;
  const numZen = dzen > 0 ? Math.round((zen2 - zen1) / dzen) + 1 : 0;

  // Find min/max PCV values for color mapping
  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity, max = -Infinity;
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
    if (!isFinite(min)) { min = 0; max = 0; }
    return { minVal: min, maxVal: max };
  }, [freq, hasAzimuth]);

  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;
  const pcvColor = useCallback((val: number): string => {
    const t = val / absMax;
    const [r, g, b] = pcvColorRGB(t);
    return `rgb(${r},${g},${b})`;
  }, [absMax]);

  const draw = useCallback((canvas: HTMLCanvasElement) => {
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

    const zenToR = (zenDeg: number) => R * (zenDeg - zen1) / (zen2 - zen1);

    if (hasAzimuth) {
      // Draw filled sectors
      const numAzi = freq.pcv.length;
      const aziStep = dazi * Math.PI / 180;
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
    const ringStep = zen2 <= 20 ? 5 : (zen2 <= 45 ? 15 : 30);
    for (let z = zen1; z <= zen2; z += ringStep) {
      const r = zenToR(z);
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

    // Labels — direction
    ctx.fillStyle = 'rgba(208,208,211,0.5)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dirs = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
    for (let i = 0; i < 12; i++) {
      const az = i * 30 * Math.PI / 180;
      ctx.fillText(dirs[i]!, cx + (R + 18) * Math.sin(az), cy - (R + 18) * Math.cos(az));
    }

    // Zenith angle labels
    ctx.fillStyle = 'rgba(208,208,211,0.3)';
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
    ctx.fillStyle = 'rgba(208,208,211,0.5)';
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
      ctx.fillStyle = 'rgba(208,208,211,0.5)';
      ctx.fillText(tv.toFixed(1), tx, barY + barH + 4);
    }
    // Unit label below ticks
    ctx.fillStyle = 'rgba(208,208,211,0.35)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText('PCV [mm]', barX + barW / 2, barY + barH + 16);
  }, [freq, numZen, hasAzimuth, zen1, zen2, dzen, pcvColor, absMax]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  // Tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
    if (dist > R + 5) { tip.style.display = 'none'; return; }

    const zenDeg = zen1 + (dist / R) * (zen2 - zen1);
    if (zenDeg < zen1 || zenDeg > zen2) { tip.style.display = 'none'; return; }

    let azDeg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
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
  }, [freq, numZen, zen1, zen2, dzen, dazi, hasAzimuth]);

  const handleMouseLeave = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  }, []);

  if (numZen === 0) return <p className="text-sm text-fg/40">No PCV data available.</p>;

  return (
    <div className="relative" style={{ width: '100%', aspectRatio: '10/11', maxHeight: 520 }}>
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
          backgroundColor: '#32323f',
          border: '1px solid rgba(74,74,90,0.6)',
          color: '#d0d0d3',
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  );
}

/* ─── PCV 3D Surface Plot (canvas) ─────────────────────────────── */

function PcvSurfacePlot({
  freq,
  zen1,
  zen2,
  dzen,
  dazi,
}: {
  freq: FrequencyData;
  zen1: number;
  zen2: number;
  dzen: number;
  dazi: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasAzimuth = dazi > 0 && freq.pcv.length > 0;
  const numZen = dzen > 0 ? Math.round((zen2 - zen1) / dzen) + 1 : 0;

  // Camera angles — drag to rotate
  const [rotX, setRotX] = useState(75);
  const [rotZ, setRotZ] = useState(-10);
  const dragRef = useRef<{ startX: number; startY: number; startRotX: number; startRotZ: number } | null>(null);

  const { minVal, maxVal } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    if (hasAzimuth) {
      for (const row of freq.pcv) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
    } else {
      for (const v of freq.pcvNoazi) { if (v < min) min = v; if (v > max) max = v; }
    }
    if (!isFinite(min)) { min = 0; max = 0; }
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

  const draw = useCallback((canvas: HTMLCanvasElement) => {
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
    const elev = rotX * Math.PI / 180;
    const azim = rotZ * Math.PI / 180;
    const ce = Math.cos(elev), se = Math.sin(elev);
    const ca = Math.cos(azim), sa = Math.sin(azim);

    // Scale to fit canvas with padding
    const fitScale = Math.min(W, H) * 0.28;
    const cxScreen = W / 2;
    const cyScreen = H * 0.48;

    const project = (xRaw: number, yRaw: number, zRaw: number): [number, number, number] => {
      // Normalize to centered unit coordinates
      const nx = (xRaw - zenMid) / zenHalf;
      const ny = (yRaw - aziMid) / aziHalf * aspect;
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
        z2,  // depth for sorting
      ];
    };

    // ── Project all vertices ──
    const projected: [number, number, number][][] = mesh.map(row =>
      row.map(p => project(p.x, p.y, p.z))
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
        const avgVal = (mr0[zi]!.val + mr0[zi + 1]!.val + mr1[zi]!.val + mr1[zi + 1]!.val) / 4;
        quads.push({
          pts: [
            [pr0[zi]![0], pr0[zi]![1]],
            [pr0[zi + 1]![0], pr0[zi + 1]![1]],
            [pr1[zi + 1]![0], pr1[zi + 1]![1]],
            [pr1[zi]![0], pr1[zi]![1]],
          ],
          depth: (pr0[zi]![2] + pr0[zi + 1]![2] + pr1[zi]![2] + pr1[zi + 1]![2]) / 4,
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
      for (let zi = 1; zi < row.length; zi++) ctx.lineTo(row[zi]![0], row[zi]![1]);
      ctx.stroke();
    }
    // Lines along azimuth (constant elevation)
    const nCols = projected[0]?.length ?? 0;
    for (let zi = 0; zi < nCols; zi++) {
      ctx.beginPath();
      ctx.moveTo(projected[0]![zi]![0], projected[0]![zi]![1]);
      for (let ai = 1; ai < projected.length; ai++) ctx.lineTo(projected[ai]![zi]![0], projected[ai]![zi]![1]);
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
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(eax, eay); ctx.stroke();
    ctx.fillStyle = 'rgba(96,165,250,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(`Elev [°]`, eax, eay + 14);

    // Azimuth axis
    const [aax, aay] = project(zen1, 360 + aziHalf * 0.08, 0);
    ctx.strokeStyle = 'rgba(74,222,128,0.6)';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(aax, aay); ctx.stroke();
    ctx.fillStyle = 'rgba(74,222,128,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(`Az [°]`, aax, aay + 14);

    // PCV axis (vertical)
    const [pax, pay] = project(zen1, 0, absMax * 1.5);
    ctx.strokeStyle = 'rgba(208,208,211,0.5)';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(pax, pay); ctx.stroke();
    ctx.fillStyle = 'rgba(208,208,211,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('PCV [mm]', pax + 5, pay);

    // Z-axis tick marks
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(208,208,211,0.4)';
    ctx.strokeStyle = 'rgba(208,208,211,0.2)';
    ctx.lineWidth = 0.5;
    const zTickStep = niceStep(2 * absMax, 4);
    const zTickStart = Math.ceil(-absMax / zTickStep) * zTickStep;
    for (let tv = zTickStart; tv <= absMax + zTickStep * 0.01; tv += zTickStep) {
      const [tx, ty] = project(zen1, 0, tv);
      const [tx2] = project(zen1 - zenHalf * 0.06, 0, tv);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx2, ty); ctx.stroke();
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
    ctx.fillStyle = 'rgba(208,208,211,0.5)';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tickStep = niceStep(2 * absMax, 5);
    const tickStart = Math.ceil(-absMax / tickStep) * tickStep;
    for (let tv = tickStart; tv <= absMax + tickStep * 0.01; tv += tickStep) {
      const tx = barX + ((tv / absMax + 1) / 2) * barW;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(tx, barY + barH); ctx.lineTo(tx, barY + barH + 3); ctx.stroke();
      ctx.fillStyle = 'rgba(208,208,211,0.5)';
      ctx.fillText(tv.toFixed(1), tx, barY + barH + 4);
    }
    ctx.fillStyle = 'rgba(208,208,211,0.3)';
    ctx.fillText('PCV [mm]', barX + barW / 2, barY + barH + 15);

  }, [mesh, rotX, rotZ, absMax, zen1, zen2]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas);
    const ro = new ResizeObserver(() => draw(canvas));
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  // Mouse drag rotation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRotX: rotX, startRotZ: rotZ };
  }, [rotX, rotZ]);

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
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    dragRef.current = { startX: t.clientX, startY: t.clientY, startRotX: rotX, startRotZ: rotZ };
  }, [rotX, rotZ]);

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

  if (numZen === 0) return <p className="text-sm text-fg/40">No PCV data available.</p>;

  return (
    <div className="relative" style={{ width: '100%', aspectRatio: '4/3', maxHeight: 480 }}>
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
          backgroundColor: '#32323f',
          border: '1px solid rgba(74,74,90,0.6)',
          color: '#d0d0d3',
          whiteSpace: 'nowrap',
        }}
      />
      <div className="absolute bottom-1 right-2 text-[9px] text-fg/20">Drag to rotate</div>
    </div>
  );
}

/* ─── Antenna detail panel ─────────────────────────────────────── */

function AntennaDetail({ antenna }: { antenna: AntennaEntry }) {
  const [freqIdx, setFreqIdx] = useState(0);
  const [view3d, setView3d] = useState(false);

  // Reset frequency index when antenna changes
  const antKey = `${antenna.type}|${antenna.serialNo}`;
  const prevKey = useRef(antKey);
  if (prevKey.current !== antKey) {
    prevKey.current = antKey;
    setFreqIdx(0);
  }

  const freq = antenna.frequencies[freqIdx];

  return (
    <div className="flex flex-col gap-4">
      {/* Metadata + PCO side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Metadata */}
        <div className="card-output">
          <div className="flex items-center gap-2 mb-3">
            {antenna.isSatellite
              ? <SatelliteIcon className="size-3.5 text-fg/40" />
              : <AntennaIcon className="size-3.5 text-fg/40" />
            }
            <span className="text-sm font-semibold text-white/90">
              {antenna.type}
            </span>
          </div>
          <div className="card-fields">
            {antenna.serialNo && (
              <>
                <label>{antenna.isSatellite ? 'PRN' : 'Serial No'}</label>
                <CopyableInput value={antenna.serialNo} />
              </>
            )}

            {antenna.svnCode && (
              <>
                <label>SVN</label>
                <CopyableInput value={antenna.svnCode} />
              </>
            )}

            {antenna.cosparId && (
              <>
                <label>COSPAR ID</label>
                <CopyableInput value={antenna.cosparId} />
              </>
            )}

            {antenna.method && (
              <>
                <label>Calibration</label>
                <CopyableInput value={`${antenna.method}${antenna.agency ? ` — ${antenna.agency}` : ''}`} />
              </>
            )}

            {antenna.numCalibrated > 0 && (
              <>
                <label># calibrated</label>
                <CopyableInput value={String(antenna.numCalibrated)} />
              </>
            )}

            {antenna.date && (
              <>
                <label>Date</label>
                <CopyableInput value={antenna.date} />
              </>
            )}

            {antenna.sinexCode && (
              <>
                <label>SINEX code</label>
                <CopyableInput value={antenna.sinexCode} />
              </>
            )}

            {antenna.validFrom && (
              <>
                <label>Valid from</label>
                <CopyableInput value={antenna.validFrom} />
              </>
            )}

            {antenna.validUntil && (
              <>
                <label>Valid until</label>
                <CopyableInput value={antenna.validUntil} />
              </>
            )}

            <label>Zenith grid</label>
            <CopyableInput value={`${antenna.zen1}° – ${antenna.zen2}° (Δ${antenna.dzen}°)`} />

            <label>Azimuth</label>
            <CopyableInput value={antenna.dazi > 0 ? `0° – 360° (Δ${antenna.dazi}°)` : 'None (azimuth-independent)'} />
          </div>
        </div>

        {/* PCO table */}
        <div className="card-output">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-3 block">
            Phase Center Offsets (mm)
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-fg/40 border-b border-border/30">
                  <th className="text-left py-1.5 pr-3 font-medium">Freq</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Label</th>
                  <th className="text-right py-1.5 px-2 font-medium">{antenna.isSatellite ? 'X' : 'North'}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{antenna.isSatellite ? 'Y' : 'East'}</th>
                  <th className="text-right py-1.5 px-2 font-medium">{antenna.isSatellite ? 'Z' : 'Up'}</th>
                </tr>
              </thead>
              <tbody>
                {antenna.frequencies.map((f, i) => {
                  const sysChar = f.frequency.charAt(0);
                  const color = SYSTEM_COLORS[sysChar] ?? '#7c8aff';
                  return (
                    <tr
                      key={f.frequency}
                      className={`border-b border-border/10 cursor-pointer transition-colors ${i === freqIdx ? 'bg-accent/10' : 'hover:bg-fg/5'}`}
                      onClick={() => setFreqIdx(i)}
                    >
                      <td className="py-1.5 pr-3" style={{ color }}>{f.frequency}</td>
                      <td className="py-1.5 pr-3 text-fg/50">{frequencyLabel(f.frequency)}</td>
                      <td className="py-1.5 px-2 text-right text-fg/70">{f.pcoN.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-fg/70">{f.pcoE.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right text-fg/70">{f.pcoU.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PCV visualization — full width */}
      {freq && (
        <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg/50">
              Phase Center Variations — {freq.frequency} ({frequencyLabel(freq.frequency)})
            </span>
            <div className="flex rounded-md border border-border/40 overflow-hidden text-[10px] font-medium">
              <button
                type="button"
                className={`px-2.5 py-1 transition-colors ${!view3d ? 'bg-accent/15 text-accent' : 'text-fg/40 hover:text-fg/60'}`}
                onClick={() => setView3d(false)}
              >
                Polar
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 transition-colors ${view3d ? 'bg-accent/15 text-accent' : 'text-fg/40 hover:text-fg/60'}`}
                onClick={() => setView3d(true)}
              >
                3D
              </button>
            </div>
          </div>
          {view3d ? (
            <PcvSurfacePlot
              freq={freq}
              zen1={antenna.zen1}
              zen2={antenna.zen2}
              dzen={antenna.dzen}
              dazi={antenna.dazi}
            />
          ) : (
            <PcvPolarPlot
              freq={freq}
              zen1={antenna.zen1}
              zen2={antenna.zen2}
              dzen={antenna.dzen}
              dazi={antenna.dazi}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Antenna list ─────────────────────────────────────────────── */

function AntennaList({
  antennas,
  selectedIdx,
  onSelect,
  filter,
}: {
  antennas: AntennaEntry[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  filter: string;
}) {
  const filtered = useMemo(() => {
    if (!filter) return antennas.map((a, i) => ({ antenna: a, idx: i }));
    const q = filter.toLowerCase();
    return antennas
      .map((a, i) => ({ antenna: a, idx: i }))
      .filter(({ antenna }) =>
        antenna.type.toLowerCase().includes(q) ||
        antenna.serialNo.toLowerCase().includes(q) ||
        antenna.svnCode.toLowerCase().includes(q)
      );
  }, [antennas, filter]);

  return (
    <>
      {filtered.length === 0 && (
        <div className="p-4 text-sm text-fg/30 text-center">No antennas match the filter.</div>
      )}
      {filtered.map(({ antenna, idx }) => {
        const sysChar = antenna.isSatellite ? antenna.serialNo.charAt(0) : '';
        const color = sysChar ? (SYSTEM_COLORS[sysChar] ?? '#7c8aff') : undefined;
        return (
          <button
            key={idx}
            type="button"
            data-idx={idx}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-border/10 transition-colors ${
              idx === selectedIdx ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-fg/5'
            }`}
            onClick={() => onSelect(idx)}
          >
            {antenna.isSatellite
              ? <SatelliteIcon className="size-3.5 text-fg/30 shrink-0" />
              : <AntennaIcon className="size-3.5 text-fg/30 shrink-0" />
            }
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-fg/80 truncate font-medium">{antenna.type}</span>
              <span className="text-[10px] text-fg/40 truncate">
                {antenna.serialNo && (
                  <span style={{ color }}>{antenna.serialNo}</span>
                )}
                {antenna.serialNo && antenna.method ? ' · ' : ''}
                {antenna.method && <span>{antenna.method}</span>}
                {' · '}
                {antenna.frequencies.length} freq
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}

/* ─── Main component ───────────────────────────────────────────── */

export default function AntexReaderPage() {
  const [antexFile, setAntexFile] = useState<AntexFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading…');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const processText = useCallback((text: string, name: string) => {
    setError(null);
    setFileName(name);
    setSelectedIdx(0);
    setFilter('');
    try {
      const result = parseAntex(text);
      if (result.antennas.length === 0) {
        setError('No antenna entries found in the file.');
        setAntexFile(null);
      } else {
        setAntexFile(result);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse ANTEX file.');
      setAntexFile(null);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setLoadingText('Parsing…');
    setAntexFile(null);
    try {
      const text = await file.text();
      processText(text, file.name);
    } catch {
      setError('Failed to read file.');
    } finally {
      setLoading(false);
    }
  }, [processText]);

  const loadSample = useCallback(async (file: string, label: string) => {
    setLoading(true);
    setLoadingText('Downloading…');
    setAntexFile(null);
    try {
      const resp = await fetch(`/samples/${file}`);
      if (!resp.ok) throw new Error('Failed to fetch sample');
      setLoadingText('Parsing…');
      const text = await resp.text();
      processText(text, label);
    } catch {
      setError('Failed to load sample file.');
    } finally {
      setLoading(false);
    }
  }, [processText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleReset = useCallback(() => {
    setAntexFile(null);
    setError(null);
    setFileName(null);
    setSelectedIdx(0);
    setFilter('');
  }, []);

  // Summary stats
  const stats = useMemo(() => {
    if (!antexFile) return null;
    const rcv = antexFile.antennas.filter(a => !a.isSatellite);
    const sat = antexFile.antennas.filter(a => a.isSatellite);
    const systems = new Set<string>();
    for (const a of sat) {
      const s = a.serialNo.charAt(0);
      if (s) systems.add(s);
    }
    return {
      total: antexFile.antennas.length,
      receivers: rcv.length,
      satellites: sat.length,
      systems: [...systems].sort(),
    };
  }, [antexFile]);

  /* ─── No file loaded ─────────────────────────────────────────── */
  if (!antexFile && !loading) {
    return (
      <section className="flex flex-col gap-4">
        <div
          className={`card flex flex-col items-center justify-center gap-4 py-10 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/10' : ''
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadIcon className="size-8 text-fg/30" />
          <div className="text-center">
            <p className="text-sm text-fg/60 mb-1">Drop your ANTEX file here</p>
            <p className="text-xs text-fg/30 mb-0">.atx antenna calibration file</p>
          </div>
          <input ref={inputRef} type="file" accept=".atx,.ATX" onChange={handleChange} className="hidden" />
          <p className="text-[10px] text-fg/20 mb-0">Supports ANTEX 1.4 — receiver and satellite antennas</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-fg/40">
          <span>or try a sample from igs20.atx:</span>
          {[
            ['igs20_trm.atx', 'Trimble (76)'],
            ['igs20_lei.atx', 'Leica (60)'],
            ['igs20_ash.atx', 'Ashtech (81)'],
            ['igs20_jav.atx', 'Javad (35)'],
            ['igs20_sep.atx', 'Septentrio (8)'],
            ['igs20_nov.atx', 'NovAtel (18)'],
          ].map(([file, label]) => (
            <button
              key={file}
              type="button"
              className="hover:text-accent transition-colors underline underline-offset-2"
              onClick={() => loadSample(file!, `igs20.atx — ${label!.split(' (')[0]}`)}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}
      </section>
    );
  }

  /* ─── Loading ────────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="card flex items-center justify-center gap-3 py-8">
          <svg className="size-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-fg/50">{loadingText} {fileName}</span>
        </div>
      </section>
    );
  }

  const selected = antexFile!.antennas[selectedIdx];

  /* ─── File loaded ────────────────────────────────────────────── */
  return (
    <section className="flex flex-col gap-4">
      {/* Header bar with inline summary */}
      <div className="card flex items-center gap-3 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 text-green-400 shrink-0">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
          <span className="text-xs text-fg/60 truncate" title={fileName ?? ''}>{fileName}</span>
          <span className="text-[10px] text-fg/30">
            ANTEX {antexFile!.version.toFixed(1)} · {antexFile!.pcvType === 'A' ? 'Absolute' : 'Relative'}
          </span>
          {stats && (
            <span className="text-[10px] text-fg/30">
              · {stats.total} antennas ({stats.receivers} rcv, {stats.satellites} sat)
              {stats.systems.length > 0 && ` · ${stats.systems.join(' ')}`}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5 shrink-0 text-xs"
          onClick={handleReset}
          title="Load a different file"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
          Reset
        </button>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {/* Antenna selector */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter antennas…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const filtered = antexFile!.antennas
                .map((a, i) => ({ a, i }))
                .filter(({ a }) => {
                  if (!filter) return true;
                  const q = filter.toLowerCase();
                  return a.type.toLowerCase().includes(q) || a.serialNo.toLowerCase().includes(q) || a.svnCode.toLowerCase().includes(q);
                });
              if (filtered.length === 0) return;
              const curPos = filtered.findIndex(f => f.i === selectedIdx);
              const next = e.key === 'ArrowDown'
                ? (curPos + 1) % filtered.length
                : (curPos - 1 + filtered.length) % filtered.length;
              const newIdx = filtered[next]!.i;
              setSelectedIdx(newIdx);
              listRef.current?.querySelector(`[data-idx="${newIdx}"]`)?.scrollIntoView({ block: 'nearest' });
            }
          }}
          className="flex-1 rounded-lg border border-border/40 bg-bg-raised/30 px-3 py-1.5 text-xs text-fg/80 placeholder:text-fg/25 focus:outline-none focus:border-accent/50"
        />
        <span className="text-[10px] text-fg/30 shrink-0">
          {selectedIdx + 1} / {antexFile!.antennas.length}
        </span>
      </div>

      <div ref={listRef} className="overflow-y-auto max-h-[200px] border border-border/30 rounded-lg">
        <AntennaList
          antennas={antexFile!.antennas}
          selectedIdx={selectedIdx}
          onSelect={setSelectedIdx}
          filter={filter}
        />
      </div>

      {/* Detail */}
      {selected ? (
        <AntennaDetail antenna={selected} />
      ) : (
        <div className="card flex items-center justify-center py-12 text-sm text-fg/30">
          Select an antenna from the list
        </div>
      )}
    </section>
  );
}
