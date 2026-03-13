/**
 * Static SVG chart renderers for PDF report generation.
 * Pure functions — no React, no DOM — just return SVG markup strings.
 * Supports dark (screen) and print (white background) themes.
 */

import type { AllPositionsData } from './orbit';
import type { MultipathResult } from './multipath';
import type { CycleSlipResult } from './cycle-slip';
import type { CompletenessResult } from './completeness';
import { SYSTEM_COLORS } from './gnss-constants';
import { systemCmp, systemName } from './rinex';
import type { EpochGrid } from './epoch-grid';
import { gridTimeIndex, gridBands } from './epoch-grid';

/* ================================================================== */
/*  Theme system                                                        */
/* ================================================================== */

const FONT = "'Helvetica', 'Arial', sans-serif";
const MONO = "'Courier', 'Courier New', monospace";

/** Render a horizontal legend anchored top-right inside the chart area */
function renderLegend(
  items: { label: string; color: string }[],
  rightX: number, topY: number,
  theme: ChartTheme,
): string {
  if (items.length === 0) return '';
  // Measure total width to right-align
  const itemWidths = items.map(it => it.label.length * 6 + 18);
  const totalW = itemWidths.reduce((a, b) => a + b, 0);
  let x = rightX - totalW;
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    out += `<rect x="${x}" y="${topY}" width="8" height="8" rx="1" fill="${it.color}"/>`;
    out += `<text x="${x + 11}" y="${topY + 7}" fill="${theme.text}" font-family="${FONT}" font-size="8">${it.label}</text>`;
    x += itemWidths[i]!;
  }
  return out;
}

/** Pick a time label interval that avoids overlapping for the given duration. */
function timeLabelIntervalMs(durationMs: number): number {
  const hours = durationMs / 3600_000;
  if (hours <= 3) return 3600_000;       // every hour
  if (hours <= 8) return 2 * 3600_000;   // every 2 hours
  if (hours <= 16) return 3 * 3600_000;  // every 3 hours
  return 4 * 3600_000;                   // every 4 hours
}

/** Format a UTC timestamp as HH:MM */
function fmtHM(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Generate time label positions — always includes start & end for short durations */
function timeLabels(t0: number, tN: number): number[] {
  const interval = timeLabelIntervalMs(tN - t0);
  const labels: number[] = [];
  const firstLabel = Math.ceil(t0 / interval) * interval;
  for (let t = firstLabel; t <= tN; t += interval) labels.push(t);
  // For short durations where we'd only get 0-1 labels, add start and end
  if (labels.length <= 1) {
    if (!labels.includes(t0)) labels.unshift(t0);
    if (!labels.includes(tN) && tN - t0 > 60_000) labels.push(tN);
  }
  return labels;
}

export interface ChartTheme {
  bg: string; grid: string; text: string; label: string;
  sysColor: (sys: string) => string;
  trackOpacity: number; trackOpacityDim: number;
  maskColor: string; areaFill: string; linePrimary: string;
  dimDot: string;
}

const PRINT_SYS: Record<string, string> = {
  G: '#16a34a', R: '#dc2626', E: '#2563eb', C: '#d97706',
  J: '#9333ea', I: '#ea580c', S: '#64748b',
};

export const DARK_THEME: ChartTheme = {
  bg: '#1a1a24', grid: 'rgba(255,255,255,0.08)',
  text: 'rgba(208,208,211,0.5)', label: 'rgba(208,208,211,0.35)',
  sysColor: (sys) => SYSTEM_COLORS[sys] ?? '#7c8aff',
  trackOpacity: 0.3, trackOpacityDim: 0.1,
  maskColor: 'rgba(255,80,80,0.35)', areaFill: 'rgba(124,138,255,0.1)',
  linePrimary: '#7c8aff', dimDot: 'rgba(160,160,170,0.3)',
};

export const PRINT_THEME: ChartTheme = {
  bg: '#ffffff', grid: '#e0e0e0',
  text: '#333333', label: '#666666',
  sysColor: (sys) => PRINT_SYS[sys] ?? '#4f46e5',
  trackOpacity: 0.5, trackOpacityDim: 0.15,
  maskColor: '#dc2626', areaFill: 'rgba(37,99,235,0.08)',
  linePrimary: '#2563eb', dimDot: '#bbbbbb',
};

/* ================================================================== */
/*  Sky Plot SVG                                                        */
/* ================================================================== */

export function renderSkyPlotSvg(
  allPositions: AllPositionsData,
  observedPrns: Set<string>[] | null,
  elevMaskDeg: number = 5,
  theme: ChartTheme = DARK_THEME,
): string {
  const size = 500;
  const cx = size / 2;
  const cy = size / 2;
  const R = (size - 60) / 2;
  const halfPi = Math.PI / 2;

  const toXY = (az: number, el: number): [number, number] => {
    const r = R * (1 - el / halfPi);
    return [cx + r * Math.sin(az), cy - r * Math.cos(az)];
  };

  const allObserved = new Set<string>();
  if (observedPrns) {
    for (const set of observedPrns) for (const prn of set) allObserved.add(prn);
  }
  const hasObsInfo = allObserved.size > 0;
  const elevMaskRad = elevMaskDeg * Math.PI / 180;
  const { prns, times, positions } = allPositions;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  svg += `<rect width="${size}" height="${size}" fill="${theme.bg}" rx="8"/>`;

  // Elevation rings
  for (const elDeg of [0, 15, 30, 45, 60, 75]) {
    const r = R * (1 - (elDeg * Math.PI / 180) / halfPi);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${theme.grid}" stroke-width="0.5"/>`;
  }

  // Azimuth lines
  for (let azDeg = 0; azDeg < 360; azDeg += 30) {
    const az = azDeg * Math.PI / 180;
    svg += `<line x1="${cx}" y1="${cy}" x2="${cx + R * Math.sin(az)}" y2="${cy - R * Math.cos(az)}" stroke="${theme.grid}" stroke-width="0.5"/>`;
  }

  // Direction labels
  const dirs = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
  for (let i = 0; i < 12; i++) {
    const az = i * 30 * Math.PI / 180;
    const lx = cx + (R + 18) * Math.sin(az);
    const ly = cy - (R + 18) * Math.cos(az);
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="${theme.text}" font-family="${MONO}" font-size="10">${dirs[i]}</text>`;
  }

  // Elevation labels
  for (const elDeg of [30, 60]) {
    const r = R * (1 - (elDeg * Math.PI / 180) / halfPi);
    svg += `<text x="${cx + 3}" y="${cy - r + 3}" fill="${theme.label}" font-family="${MONO}" font-size="7">${elDeg}°</text>`;
  }

  // Elevation mask
  if (elevMaskDeg > 0) {
    const rMask = R * (1 - elevMaskRad / halfPi);
    svg += `<circle cx="${cx}" cy="${cy}" r="${rMask}" fill="none" stroke="${theme.maskColor}" stroke-width="1" stroke-dasharray="4 4"/>`;
  }

  // Satellite tracks
  for (const prn of prns) {
    const pts = positions[prn];
    if (!pts) continue;
    const isObserved = !hasObsInfo || allObserved.has(prn);
    const color = isObserved ? theme.sysColor(prn[0]!) : theme.dimDot;
    const opacity = isObserved ? theme.trackOpacity : theme.trackOpacityDim;

    let path = '';
    let inSeg = false;
    for (let i = 0; i < times.length; i++) {
      const pt = pts[i];
      if (!pt || pt.el < elevMaskRad) {
        if (path) { svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2" opacity="${opacity}"/>`; path = ''; }
        inSeg = false;
        continue;
      }
      const [x, y] = toXY(pt.az, pt.el);
      if (!inSeg) { path = `M${x.toFixed(1)},${y.toFixed(1)}`; inSeg = true; }
      else path += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (path) svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2" opacity="${opacity}"/>`;
  }

  // Last-epoch dots + labels
  const lastEpoch = times.length - 1;
  const lastObserved = observedPrns?.[lastEpoch];
  for (const prn of prns) {
    const pt = positions[prn]?.[lastEpoch];
    if (!pt || pt.el < elevMaskRad) continue;
    const isObserved = !hasObsInfo || (lastObserved?.has(prn) ?? false);
    const color = isObserved ? theme.sysColor(prn[0]!) : theme.dimDot;
    const r = isObserved ? 4 : 2.5;
    const [x, y] = toXY(pt.az, pt.el);
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}"/>`;
    if (isObserved) {
      svg += `<text x="${(x + 6).toFixed(1)}" y="${(y - 4).toFixed(1)}" fill="${theme.text}" font-family="${MONO}" font-size="7">${prn}</text>`;
    }
  }

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Multipath RMS vs Elevation SVG                                      */
/* ================================================================== */

export function renderMultipathElevSvg(
  result: MultipathResult,
  allPositions: AllPositionsData,
  selectedSignal: string | null = null,
  theme: ChartTheme = DARK_THEME,
): string {
  const elevMaps = new Map<string, { times: number[]; els: Float64Array }>();
  for (const prn of allPositions.prns) {
    const posArr = allPositions.positions[prn];
    if (!posArr) continue;
    const ts: number[] = [];
    const es: number[] = [];
    for (let i = 0; i < allPositions.times.length; i++) {
      const pt = posArr[i];
      if (pt && pt.el !== 0) {
        ts.push(allPositions.times[i]!);
        es.push(pt.el * (180 / Math.PI));
      }
    }
    if (ts.length > 0) elevMaps.set(prn, { times: ts, els: Float64Array.from(es) });
  }

  const elevLookup = (prn: string, time: number): number | null => {
    const m = elevMaps.get(prn);
    if (!m) return null;
    const { times, els } = m;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid]! < time) lo = mid + 1; else hi = mid; }
    const prev = lo > 0 ? lo - 1 : lo;
    const idx = Math.abs(times[prev]! - time) < Math.abs(times[lo]! - time) ? prev : lo;
    if (Math.abs(times[idx]! - time) > 60000) return null;
    return els[idx]!;
  };

  const BIN = 5, numBins = Math.ceil(90 / BIN);
  const sysSet = new Set<string>();
  const bins = new Map<string, { sumSq: number; count: number }[]>();

  for (const s of result.series) {
    if (selectedSignal) {
      const [sys, band, refBand] = selectedSignal.split('-');
      if (s.system !== sys || s.band !== band || s.refBand !== refBand) continue;
    }
    sysSet.add(s.system);
    if (!bins.has(s.system)) bins.set(s.system, Array.from({ length: numBins }, () => ({ sumSq: 0, count: 0 })));
    for (const p of s.points) {
      const el = elevLookup(s.prn, p.time);
      if (el !== null && el > 0) {
        const idx = Math.min(numBins - 1, Math.floor(el / BIN));
        const b = bins.get(s.system)![idx]!;
        b.sumSq += p.mp * p.mp; b.count++;
      }
    }
  }

  const systems = [...sysSet].sort((a, b) => 'GRECIJS'.indexOf(a) - 'GRECIJS'.indexOf(b));
  const rmsData: { system: string; values: (number | null)[] }[] = [];
  let maxRms = 0;
  for (const sys of systems) {
    const sysBins = bins.get(sys)!;
    const values: (number | null)[] = [];
    for (let i = 0; i < numBins; i++) {
      const b = sysBins[i]!;
      if (b.count >= 5) { const rms = Math.sqrt(b.sumSq / b.count); values.push(rms); if (rms > maxRms) maxRms = rms; }
      else values.push(null);
    }
    rmsData.push({ system: sys, values });
  }

  if (maxRms === 0) maxRms = 1;
  const yMax = Math.ceil(maxRms * 10) / 10;

  const W = 500, H = 280;
  const margin = { top: 20, right: 20, bottom: 58, left: 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const xScale = (bin: number) => margin.left + (bin * BIN + BIN / 2) / 90 * pw;
  const yScale = (v: number) => margin.top + ph - (v / yMax) * ph;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  // Grid
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const y = margin.top + (i / yTicks) * ph;
    const val = yMax * (1 - i / yTicks);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${theme.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${margin.left - 5}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="8">${val.toFixed(2)}</text>`;
  }

  // X labels
  for (let i = 0; i < numBins; i += 2) {
    svg += `<text x="${xScale(i)}" y="${H - margin.bottom + 14}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="8">${i * BIN}°</text>`;
  }
  svg += `<text x="${margin.left + pw / 2}" y="${H - margin.bottom + 28}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9">Elevation</text>`;
  svg += `<text x="12" y="${margin.top + ph / 2}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9" transform="rotate(-90,12,${margin.top + ph / 2})">RMS (m)</text>`;

  // Lines per system
  for (const { system, values } of rmsData) {
    const color = theme.sysColor(system);
    let path = '';
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      const x = xScale(i), y = yScale(v as number);
      if (!path) path = `M${x.toFixed(1)},${y.toFixed(1)}`;
      else path += `L${x.toFixed(1)},${y.toFixed(1)}`;
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`;
    }
    if (path) svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  }

  // Legend (top-right)
  svg += renderLegend(systems.map(s => ({ label: systemName(s), color: theme.sysColor(s) })), W - margin.right, margin.top + 2, theme);

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  C/N0 Timeline SVG                                                   */
/* ================================================================== */

export function renderCn0TimelineSvg(
  grid: EpochGrid,
  theme: ChartTheme = DARK_THEME,
): string {
  const W = 500, H = 200;
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  const { nEpochs, times, systems, snrPerSystem } = grid;
  if (nEpochs === 0) return '';

  const nSys = systems.length;
  const t0 = times[0]!, tN = times[nEpochs - 1]!;
  const tRange = tN - t0 || 1;
  const step = Math.max(1, Math.ceil(nEpochs / 300));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  const yMin = 0, yMax = 55;
  const yScale = (v: number) => margin.top + ph - ((v - yMin) / (yMax - yMin)) * ph;
  const xScale = (t: number) => margin.left + ((t - t0) / tRange) * pw;

  for (const yVal of [0, 10, 20, 30, 40, 50]) {
    const y = yScale(yVal);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${theme.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${margin.left - 5}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="8">${yVal}</text>`;
  }

  for (const t of timeLabels(t0, tN)) {
    const x = xScale(t);
    if (x < margin.left || x > W - margin.right) continue;
    svg += `<text x="${x}" y="${H - margin.bottom + 14}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="8">${fmtHM(t)}</text>`;
  }

  svg += `<text x="${12}" y="${margin.top + ph / 2}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9" transform="rotate(-90,12,${margin.top + ph / 2})">dB-Hz</text>`;

  for (let s = 0; s < nSys; s++) {
    const sys = systems[s]!;
    const color = theme.sysColor(sys);
    let path = '';
    for (let i = 0; i < nEpochs; i += step) {
      const snr = snrPerSystem[i * nSys + s]!;
      if (snr <= 0) continue;
      const x = xScale(times[i]!), y = yScale(snr);
      if (!path) path = `M${x.toFixed(1)},${y.toFixed(1)}`;
      else path += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    if (path) svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.85"/>`;
  }

  // Legend (top-right)
  svg += renderLegend(systems.map(s => ({ label: systemName(s), color: theme.sysColor(s) })), W - margin.right, margin.top + 2, theme);

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Satellite count timeline SVG                                        */
/* ================================================================== */

export function renderSatCountSvg(
  grid: EpochGrid,
  theme: ChartTheme = DARK_THEME,
): string {
  const W = 500, H = 160;
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  const { nEpochs, times, totalSats } = grid;
  if (nEpochs === 0) return '';

  const t0 = times[0]!, tN = times[nEpochs - 1]!;
  const tRange = tN - t0 || 1;
  let maxSats = 0;
  for (let i = 0; i < nEpochs; i++) if (totalSats[i]! > maxSats) maxSats = totalSats[i]!;
  const yMax = Math.ceil(maxSats / 5) * 5;
  const step = Math.max(1, Math.ceil(nEpochs / 300));

  const xScale = (t: number) => margin.left + ((t - t0) / tRange) * pw;
  const yScale = (v: number) => margin.top + ph - (v / yMax) * ph;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  // Y grid
  for (let v = 0; v <= yMax; v += 5) {
    const y = yScale(v);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${theme.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${margin.left - 5}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="8">${v}</text>`;
  }

  // Time labels
  for (const t of timeLabels(t0, tN)) {
    const x = xScale(t);
    if (x < margin.left || x > W - margin.right) continue;
    svg += `<text x="${x}" y="${H - margin.bottom + 14}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="8">${fmtHM(t)}</text>`;
  }

  // Area + line
  let path = '';
  let areaPath = '';
  for (let i = 0; i < nEpochs; i += step) {
    const x = xScale(times[i]!), y = yScale(totalSats[i]!);
    if (!path) {
      path = `M${x.toFixed(1)},${y.toFixed(1)}`;
      areaPath = `M${x.toFixed(1)},${yScale(0).toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      path += `L${x.toFixed(1)},${y.toFixed(1)}`;
      areaPath += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
  }
  if (areaPath) {
    const lastX = xScale(times[Math.min(nEpochs - 1, Math.ceil((nEpochs - 1) / step) * step)]!);
    areaPath += `L${lastX.toFixed(1)},${yScale(0).toFixed(1)}Z`;
    svg += `<path d="${areaPath}" fill="${theme.areaFill}"/>`;
  }
  if (path) svg += `<path d="${path}" fill="none" stroke="${theme.linePrimary}" stroke-width="1.2"/>`;

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Multipath stats table data                                          */
/* ================================================================== */

export interface MpStatsRow {
  label: string;
  system: string;
  rms: string;
  count: number;
  satellites: number;
}

export function getMultipathStatsRows(result: MultipathResult): MpStatsRow[] {
  return result.signalStats.map(s => ({
    label: s.label,
    system: s.system,
    rms: s.rms.toFixed(3),
    count: s.count,
    satellites: s.satellites,
  }));
}


/* ================================================================== */
/*  C/N0 Distribution Histogram SVG                                    */
/* ================================================================== */

export function renderCn0DistributionSvg(
  grid: EpochGrid,
  theme: ChartTheme = DARK_THEME,
): string {
  const { nEpochs, systems, snrPerSystem } = grid;
  if (nEpochs === 0) return '';

  const nSys = systems.length;
  const binSize = 2;
  const numBins = 30; // 0–60 dB-Hz
  // Per-system bins
  const sysBins = new Map<string, Uint32Array>();
  for (const sys of systems) sysBins.set(sys, new Uint32Array(numBins));

  for (let i = 0; i < nEpochs; i++) {
    for (let s = 0; s < nSys; s++) {
      const snr = snrPerSystem[i * nSys + s]!;
      if (snr <= 0) continue;
      const bin = Math.min(numBins - 1, Math.floor(snr / binSize));
      sysBins.get(systems[s]!)![bin]!++;
    }
  }

  // Stack bins
  let maxStack = 0;
  const stacked: number[][] = Array.from({ length: numBins }, () => []);
  for (let b = 0; b < numBins; b++) {
    let sum = 0;
    for (const sys of systems) {
      sum += sysBins.get(sys)![b]!;
      stacked[b]!.push(sum);
    }
    if (sum > maxStack) maxStack = sum;
  }
  if (maxStack === 0) return '';

  const W = 500, H = 200;
  const margin = { top: 15, right: 20, bottom: 32, left: 55 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;
  const barW = pw / numBins;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  // Y grid
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = margin.top + (i / yTicks) * ph;
    const val = maxStack * (1 - i / yTicks);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${theme.grid}" stroke-width="0.5"/>`;
    if (val > 0) svg += `<text x="${margin.left - 5}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="7">${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : Math.round(val)}</text>`;
  }

  // Stacked bars
  for (let b = 0; b < numBins; b++) {
    const x = margin.left + b * barW;
    for (let s = systems.length - 1; s >= 0; s--) {
      const top = stacked[b]![s]!;
      if (top === 0) continue;
      const barH = (top / maxStack) * ph;
      const y = margin.top + ph - barH;
      svg += `<rect x="${x + 0.5}" y="${y}" width="${barW - 1}" height="${barH}" fill="${theme.sysColor(systems[s]!)}" opacity="0.8"/>`;
    }
  }

  // X labels
  for (let b = 0; b < numBins; b += 5) {
    svg += `<text x="${margin.left + b * barW + barW / 2}" y="${H - margin.bottom + 14}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="8">${b * binSize}</text>`;
  }
  svg += `<text x="${margin.left + pw / 2}" y="${H - margin.bottom + 26}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9">C/N0 (dB-Hz)</text>`;
  svg += `<text x="12" y="${margin.top + ph / 2}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9" transform="rotate(-90,12,${margin.top + ph / 2})">Epochs</text>`;

  // Legend (top-right)
  svg += renderLegend(systems.map(s => ({ label: systemName(s), color: theme.sysColor(s) })), W - margin.right, margin.top - 10, theme);

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Cycle Slip Rate Bar Chart SVG                                      */
/* ================================================================== */

export function renderCycleSlipRateSvg(
  result: CycleSlipResult,
  theme: ChartTheme = DARK_THEME,
): string {
  const stats = result.signalStats.filter(s => s.totalSlips > 0);
  if (stats.length === 0) return '';

  stats.sort((a, b) => systemCmp(a.system, b.system) || a.label.localeCompare(b.label));

  const W = 500, barH = 18, gap = 4;
  const margin = { top: 15, right: 20, bottom: 20, left: 160 };
  const H = margin.top + stats.length * (barH + gap) + margin.bottom;
  const pw = W - margin.left - margin.right;

  const maxRate = Math.max(...stats.map(s => s.slipRate), 0.1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    const y = margin.top + i * (barH + gap);
    const bw = (s.slipRate / maxRate) * pw;
    const color = theme.sysColor(s.system);

    svg += `<text x="${margin.left - 5}" y="${y + barH / 2 + 3}" text-anchor="end" fill="${theme.text}" font-family="${FONT}" font-size="8">${s.label}</text>`;
    svg += `<rect x="${margin.left}" y="${y}" width="${Math.max(1, bw)}" height="${barH}" rx="2" fill="${color}" opacity="0.8"/>`;
    svg += `<text x="${margin.left + bw + 4}" y="${y + barH / 2 + 3}" fill="${theme.text}" font-family="${MONO}" font-size="7">${s.slipRate.toFixed(2)}</text>`;
  }

  svg += `<text x="${margin.left + pw / 2}" y="${H - 4}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9">Slips per 1000 epochs</text>`;

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Data Completeness Bar Chart SVG                                    */
/* ================================================================== */

/** Returns one SVG per constellation, keyed by system letter */
export function renderCompletenessBarSvgs(
  result: CompletenessResult,
  theme: ChartTheme = DARK_THEME,
): { system: string; name: string; svg: string }[] {
  const stats = result.signalStats.filter(s => s.expected > 0);
  if (stats.length === 0) return [];

  stats.sort((a, b) => systemCmp(a.system, b.system) || a.code.localeCompare(b.code));

  // Group by constellation
  const groups = new Map<string, typeof stats>();
  for (const s of stats) {
    let arr = groups.get(s.system);
    if (!arr) { arr = []; groups.set(s.system, arr); }
    arr.push(s);
  }

  const results: { system: string; name: string; svg: string }[] = [];

  for (const [sys, sysStats] of groups) {
    const W = 500, barH = 14, gap = 3;
    const margin = { top: 8, right: 50, bottom: 6, left: 80 };
    const H = margin.top + sysStats.length * (barH + gap) + margin.bottom;
    const pw = W - margin.left - margin.right;
    const color = theme.sysColor(sys);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

    for (let i = 0; i < sysStats.length; i++) {
      const s = sysStats[i]!;
      const y = margin.top + i * (barH + gap);
      const bw = (s.percent / 100) * pw;
      // Strip system name from label to keep it short (e.g. "C1C (GPS L1)" → "C1C")
      const shortLabel = s.code;

      svg += `<text x="${margin.left - 5}" y="${y + barH / 2 + 4}" text-anchor="end" fill="${theme.text}" font-family="${FONT}" font-size="9">${shortLabel}</text>`;
      svg += `<rect x="${margin.left}" y="${y}" width="${pw}" height="${barH}" rx="2" fill="${theme.grid}" opacity="0.3"/>`;
      svg += `<rect x="${margin.left}" y="${y}" width="${bw}" height="${barH}" rx="2" fill="${color}" opacity="0.7"/>`;
      const pctColor = s.percent >= 99 ? '#16a34a' : s.percent >= 90 ? '#d97706' : s.percent >= 75 ? '#ea580c' : '#dc2626';
      svg += `<text x="${margin.left + pw + 4}" y="${y + barH / 2 + 4}" fill="${pctColor}" font-family="${MONO}" font-size="8">${s.percent.toFixed(1)}%</text>`;
    }

    svg += '</svg>';
    results.push({ system: sys, name: systemName(sys), svg });
  }

  return results;
}


/* ================================================================== */
/*  Multipath RMS per Signal Bar Chart SVG                             */
/* ================================================================== */

export function renderMultipathRmsBarSvg(
  result: MultipathResult,
  theme: ChartTheme = DARK_THEME,
): string {
  const stats = result.signalStats.filter(s => s.count > 0);
  if (stats.length === 0) return '';

  stats.sort((a, b) => systemCmp(a.system, b.system));

  const W = 500, barH = 22, gap = 6;
  const margin = { top: 15, right: 20, bottom: 20, left: 150 };
  const H = margin.top + stats.length * (barH + gap) + margin.bottom;
  const pw = W - margin.left - margin.right;
  const maxRms = Math.max(...stats.map(s => s.rms));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    const y = margin.top + i * (barH + gap);
    const bw = (s.rms / maxRms) * pw;
    const color = theme.sysColor(s.system);

    svg += `<text x="${margin.left - 5}" y="${y + barH / 2 + 4}" text-anchor="end" fill="${theme.text}" font-family="${FONT}" font-size="9">${s.label}</text>`;
    svg += `<rect x="${margin.left}" y="${y}" width="${Math.max(1, bw)}" height="${barH}" rx="2" fill="${color}" opacity="0.8"/>`;
    svg += `<text x="${margin.left + bw + 4}" y="${y + barH / 2 + 4}" fill="${theme.text}" font-family="${MONO}" font-size="8">${s.rms.toFixed(3)} m</text>`;
  }

  svg += `<text x="${margin.left + pw / 2}" y="${H - 4}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9">RMS (m)</text>`;

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Per-Satellite Multipath RMS Scatter SVG                            */
/* ================================================================== */

export function renderMultipathPerSatSvg(
  result: MultipathResult,
  theme: ChartTheme = DARK_THEME,
): string {
  // Aggregate RMS per satellite across all signals
  const satRms = new Map<string, { sumSq: number; count: number }>();
  for (const s of result.series) {
    const prev = satRms.get(s.prn) ?? { sumSq: 0, count: 0 };
    for (const p of s.points) {
      prev.sumSq += p.mp * p.mp;
      prev.count++;
    }
    satRms.set(s.prn, prev);
  }

  const sats: { prn: string; rms: number }[] = [];
  for (const [prn, v] of satRms) {
    if (v.count >= 10) sats.push({ prn, rms: Math.sqrt(v.sumSq / v.count) });
  }
  if (sats.length === 0) return '';

  sats.sort((a, b) => systemCmp(a.prn[0]!, b.prn[0]!) || a.prn.localeCompare(b.prn));

  const W = 500, H = 200;
  const margin = { top: 15, right: 20, bottom: 30, left: 50 };
  const pw = W - margin.left - margin.right;
  const ph = H - margin.top - margin.bottom;

  const maxRms = Math.max(...sats.map(s => s.rms));
  const yMax = Math.ceil(maxRms * 5) / 5;

  const xScale = (i: number) => margin.left + (i + 0.5) / sats.length * pw;
  const yScale = (v: number) => margin.top + ph - (v / yMax) * ph;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  // Y grid
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = margin.top + (i / yTicks) * ph;
    const val = yMax * (1 - i / yTicks);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" stroke="${theme.grid}" stroke-width="0.5"/>`;
    svg += `<text x="${margin.left - 5}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="7">${val.toFixed(1)}</text>`;
  }

  // Dots
  for (let i = 0; i < sats.length; i++) {
    const s = sats[i]!;
    const x = xScale(i), y = yScale(s.rms);
    const color = theme.sysColor(s.prn[0]!);
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" opacity="0.8"/>`;
  }

  // X label every N sats to avoid crowding
  const labelStep = Math.max(1, Math.ceil(sats.length / 20));
  for (let i = 0; i < sats.length; i += labelStep) {
    svg += `<text x="${xScale(i)}" y="${H - margin.bottom + 12}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="6" transform="rotate(-45,${xScale(i)},${H - margin.bottom + 12})">${sats[i]!.prn}</text>`;
  }

  svg += `<text x="12" y="${margin.top + ph / 2}" text-anchor="middle" fill="${theme.label}" font-family="${FONT}" font-size="9" transform="rotate(-90,12,${margin.top + ph / 2})">RMS (m)</text>`;

  // Legend (top-right)
  const sysSeen = new Set<string>();
  const legendItems: { label: string; color: string }[] = [];
  for (const s of sats) {
    if (sysSeen.has(s.prn[0]!)) continue;
    sysSeen.add(s.prn[0]!);
    legendItems.push({ label: systemName(s.prn[0]!), color: theme.sysColor(s.prn[0]!) });
  }
  svg += renderLegend(legendItems, W - margin.right, margin.top - 10, theme);

  svg += '</svg>';
  return svg;
}


/* ================================================================== */
/*  Elevation vs C/N0 SVG (multi-panel)                                */
/* ================================================================== */

const BAND_LABEL: Record<string, string> = {
  '1': 'L1/E1/B1', '2': 'L2/G2', '5': 'L5/E5a/B2a',
  '6': 'E6/B3', '7': 'E5b/B2b', '8': 'E5/B2',
};

export function renderElevCn0Svg(
  allPositions: AllPositionsData,
  grid: EpochGrid,
  theme: ChartTheme = DARK_THEME,
): string {
  const bands = gridBands(grid);
  if (bands.length === 0) return '';

  const timeIdx = gridTimeIndex(grid);
  const { prns, times, positions } = allPositions;
  const { bandKeys, snrPerSatBand } = grid;
  const nBand = bandKeys.length;

  // Build bandKey → index lookup
  const bkIdx = new Map<string, number>();
  for (let i = 0; i < nBand; i++) bkIdx.set(bandKeys[i]!, i);

  // Accumulate per system:band, 1° elevation bins
  type Bin = { cn0Sum: number; n: number };
  const seriesMap = new Map<string, Bin[]>();

  // Downsample to avoid scanning every epoch for 24h 1s data
  const step = Math.max(1, Math.ceil(times.length / 600));

  for (let ti = 0; ti < times.length; ti += step) {
    const t = times[ti]!;
    const gi = timeIdx.get(t);
    if (gi == null) continue;
    const row = gi * nBand;

    for (const prn of prns) {
      const pt = positions[prn]?.[ti];
      if (!pt || pt.el <= 0) continue;
      const elDeg = pt.el * (180 / Math.PI);
      const bin = Math.min(Math.floor(elDeg), 89);
      const sys = prn[0]!;

      for (const band of bands) {
        const bi = bkIdx.get(`${prn}:${band}`);
        if (bi == null) continue;
        const cn0 = snrPerSatBand[row + bi]!;
        if (isNaN(cn0) || cn0 <= 0) continue;

        const key = `${sys}:${band}`;
        let arr = seriesMap.get(key);
        if (!arr) {
          arr = Array.from({ length: 90 }, () => ({ cn0Sum: 0, n: 0 }));
          seriesMap.set(key, arr);
        }
        arr[bin]!.cn0Sum += cn0;
        arr[bin]!.n++;
      }
    }
  }

  if (seriesMap.size === 0) return '';

  // Group by band
  const activeBands = bands.filter(b => {
    for (const [key] of seriesMap) if (key.endsWith(`:${b}`)) return true;
    return false;
  });
  if (activeBands.length === 0) return '';

  const panelW = 500;
  const panelH = 160;
  const cols = Math.min(activeBands.length, 3);
  const panelRows = Math.ceil(activeBands.length / cols);
  const W = panelW;
  const H = panelRows * panelH;
  const margin = { top: 22, right: 15, bottom: 28, left: 40 };
  const pw = (panelW / cols) - margin.left - margin.right;
  const ph = panelH - margin.top - margin.bottom;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
  svg += `<rect width="${W}" height="${H}" fill="${theme.bg}" rx="4"/>`;

  for (let pi = 0; pi < activeBands.length; pi++) {
    const band = activeBands[pi]!;
    const col = pi % cols;
    const pRow = Math.floor(pi / cols);
    const ox = col * (panelW / cols) + margin.left;
    const oy = pRow * panelH + margin.top;

    // Panel title
    svg += `<text x="${ox + pw / 2}" y="${oy - 8}" text-anchor="middle" fill="${theme.text}" font-family="${FONT}" font-size="9" font-weight="bold">${BAND_LABEL[band] ?? `Band ${band}`}</text>`;

    // Grid
    for (const yVal of [0, 10, 20, 30, 40, 50, 60]) {
      const y = oy + ph - (yVal / 60) * ph;
      svg += `<line x1="${ox}" y1="${y}" x2="${ox + pw}" y2="${y}" stroke="${theme.grid}" stroke-width="0.4"/>`;
      if (col === 0) svg += `<text x="${ox - 4}" y="${y + 3}" text-anchor="end" fill="${theme.label}" font-family="${MONO}" font-size="6">${yVal}</text>`;
    }
    for (const xVal of [0, 15, 30, 45, 60, 75, 90]) {
      svg += `<text x="${ox + (xVal / 90) * pw}" y="${oy + ph + 12}" text-anchor="middle" fill="${theme.label}" font-family="${MONO}" font-size="6">${xVal}°</text>`;
    }

    // Series for this band
    const sysList: string[] = [];
    for (const [key] of seriesMap) {
      const [sys, b] = key.split(':');
      if (b === band && sys) sysList.push(sys);
    }
    sysList.sort((a, b) => systemCmp(a, b));

    for (const sys of sysList) {
      const bins = seriesMap.get(`${sys}:${band}`)!;
      const color = theme.sysColor(sys);
      let path = '';
      for (let i = 0; i < 90; i++) {
        const b = bins[i]!;
        if (b.n < 2) continue;
        const cn0 = b.cn0Sum / b.n;
        const x = ox + (i / 90) * pw;
        const y = oy + ph - (cn0 / 60) * ph;
        if (!path) path = `M${x.toFixed(1)},${y.toFixed(1)}`;
        else path += `L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      if (path) svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2"/>`;
    }

    // Legend in first panel (top-right)
    if (pi === 0) {
      svg += renderLegend(sysList.map(s => ({ label: systemName(s), color: theme.sysColor(s) })), ox + pw, oy - 18, theme);
    }
  }

  svg += '</svg>';
  return svg;
}
