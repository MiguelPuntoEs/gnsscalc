import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  type ConstellationRow,
  type SignalDef,
  CONSTELLATIONS,
  BAND_PRESETS,
} from '../util/gnss-signals';
import { BDS_SATELLITES } from '../util/gnss-constants';
import { phiBPSK, phiBOCs, phiBOCc, phiAltBOC, computePsdDb } from '../util/psd';
import { useChartTheme, getChartTheme } from '../hooks/useChartTheme';

const F0 = 1.023e6;
const HZ_IN_MHZ = 1e6;
const NUM_POINTS = 2000;
const PSD_OFFSET = 110; // dB offset to make values positive for plotting
const ROW_HEIGHT = 110;
const LABEL_WIDTH = 100;
const TOP_PAD = 30;
const BOTTOM_PAD = 30;

/** Build the PSD evaluation function for a signal definition. */
function makePsdFn(sig: SignalDef): (fHz: number) => number {
  if (sig.modulation === 'composite' && sig.composite) {
    const { weights, modulations, paramSets } = sig.composite;
    return (fHz: number) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) {
        const mod = modulations[i]!;
        const ps = paramSets[i]!;
        let val = 0;
        if (mod === 'BOCs') val = phiBOCs(fHz, F0, ps[0]!, ps[1]!);
        else if (mod === 'BOCc') val = phiBOCc(fHz, F0, ps[0]!, ps[1]!);
        else if (mod === 'BPSK') val = phiBPSK(fHz, F0, ps[0]!);
        sum += weights[i]! * val;
      }
      return sum;
    };
  }
  const p = sig.params;
  switch (sig.modulation) {
    case 'BPSK': return (fHz: number) => phiBPSK(fHz, F0, p[0]!);
    case 'BOCs': return (fHz: number) => phiBOCs(fHz, F0, p[0]!, p[1]!);
    case 'BOCc': return (fHz: number) => phiBOCc(fHz, F0, p[0]!, p[1]!);
    case 'AltBOC': return (fHz: number) => phiAltBOC(fHz, F0, p[0]!, p[1]!);
    default: return () => 0;
  }
}

interface PrecomputedSignal {
  sig: SignalDef;
  freqsMHz: Float64Array;
  psdDb: Float64Array;
}

function precomputeSignals(constellations: ConstellationRow[]): Map<string, PrecomputedSignal[]> {
  const map = new Map<string, PrecomputedSignal[]>();
  for (const row of constellations) {
    const signals: PrecomputedSignal[] = [];
    for (const sig of row.signals) {
      const psdFn = makePsdFn(sig);
      const { freqsMHz, psdDb } = computePsdDb(
        sig.centerMHz,
        sig.halfSpanChips,
        NUM_POINTS,
        psdFn,
        F0,
        -60,
      );
      signals.push({ sig, freqsMHz, psdDb });
    }
    map.set(row.key, signals);
  }
  return map;
}

interface TooltipInfo {
  x: number;
  y: number;
  label: string;
  constellation: string;
  freq: string;
  modulation: string;
  color: string;
}

interface HitRegion {
  path: Path2D;
  sig: SignalDef;
  row: ConstellationRow;
}

const BDS_GROUPS = (() => {
  const groups: Record<string, string[]> = {};
  for (const sat of BDS_SATELLITES) {
    const key = `${sat.phase} ${sat.orbit}`;
    (groups[key] ??= []).push(sat.prn);
  }
  return groups;
})();

export default function SpectrumChart() {
  const theme = useChartTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hitRegionsRef = useRef<HitRegion[]>([]);
  const [bandIdx, setBandIdx] = useState(1);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CONSTELLATIONS.map((c) => [c.key, true])),
  );
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);
  const [showBdsTable, setShowBdsTable] = useState(true);

  const band = BAND_PRESETS[bandIdx]!;
  const visibleRows = useMemo(
    () => CONSTELLATIONS.filter((c) => enabled[c.key]),
    [enabled],
  );

  const precomputed = useMemo(() => precomputeSignals(CONSTELLATIONS), []);

  const canvasHeight = TOP_PAD + visibleRows.length * ROW_HEIGHT + BOTTOM_PAD;

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const t = getChartTheme();
      const dpr = window.devicePixelRatio || 1;
      const w = canvasWidth;
      const h = canvasHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, w, h);
      const hitRegions: HitRegion[] = [];

      const plotLeft = LABEL_WIDTH;
      const plotRight = w - 20;
      const plotWidth = plotRight - plotLeft;
      const { minMHz, maxMHz } = band;

      const toX = (fMHz: number) =>
        plotLeft + ((fMHz - minMHz) / (maxMHz - minMHz)) * plotWidth;

      // Draw each constellation row
      visibleRows.forEach((row, rowIdx) => {
        const rowCenter = TOP_PAD + rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
        const rowTop = TOP_PAD + rowIdx * ROW_HEIGHT;

        // Row separator
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(plotLeft, rowTop);
        ctx.lineTo(plotRight, rowTop);
        ctx.stroke();

        // Constellation label
        ctx.save();
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = row.color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(row.label, plotLeft - 12, rowCenter);
        ctx.restore();

        // Draw signals
        const signals = precomputed.get(row.key);
        if (!signals) return;

        const dbMin = 0;
        const dbMax = 56;
        const rowPad = 4;
        const halfRow = (ROW_HEIGHT - 2 * rowPad) / 2;
        // Shear angle for Q/pilot (horizontal) components — matches Python's THETA_VAL
        const THETA = 30 * Math.PI / 180;
        const sinT = Math.sin(THETA);
        const cosT = Math.cos(THETA) * 0.8;

        for (const { sig, freqsMHz, psdDb } of signals) {
          const baseline = rowCenter;
          const isDown = sig.direction === 'down';

          const toAmp = (db: number) => {
            const norm = (db - dbMin) / (dbMax - dbMin);
            return Math.max(0, Math.min(1, norm)) * halfRow;
          };

          const toXY = (xBase: number, amp: number): [number, number] => {
            if (!isDown) return [xBase, baseline - amp];
            return [xBase - amp * sinT, baseline + amp * cosT];
          };

          // Build Path2D for the filled shape (used for hit testing + rendering)
          const path = new Path2D();
          let started = false;
          for (let i = 0; i < freqsMHz.length; i++) {
            const xBase = toX(freqsMHz[i]!);
            if (xBase < plotLeft - 10 || xBase > plotRight + 10) continue;
            const dbVal = psdDb[i]! + PSD_OFFSET;
            if (dbVal < dbMin) continue;
            const amp = toAmp(dbVal);
            const [px, py] = toXY(xBase, amp);
            if (!started) {
              path.moveTo(xBase, baseline);
              path.lineTo(px, py);
              started = true;
            } else {
              path.lineTo(px, py);
            }
          }
          if (started) {
            for (let i = freqsMHz.length - 1; i >= 0; i--) {
              const xBase = toX(freqsMHz[i]!);
              if (xBase < plotLeft - 10 || xBase > plotRight + 10) continue;
              const dbVal = psdDb[i]! + PSD_OFFSET;
              if (dbVal < dbMin) continue;
              path.lineTo(xBase, baseline);
              break;
            }
            path.closePath();
            ctx.fillStyle = sig.color + '55';
            ctx.fill(path);

            // Store for hit testing
            hitRegions.push({ path, sig, row });

            // Stroke outline
            ctx.strokeStyle = sig.color + 'aa';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < freqsMHz.length; i++) {
              const xBase = toX(freqsMHz[i]!);
              if (xBase < plotLeft - 10 || xBase > plotRight + 10) continue;
              const dbVal = psdDb[i]! + PSD_OFFSET;
              if (dbVal < dbMin) continue;
              const amp = toAmp(dbVal);
              const [px, py] = toXY(xBase, amp);
              if (i === 0 || toX(freqsMHz[i - 1]!) < plotLeft - 10) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      });

      // Bottom separator
      const bottomY = TOP_PAD + visibleRows.length * ROW_HEIGHT;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(plotLeft, bottomY);
      ctx.lineTo(plotRight, bottomY);
      ctx.stroke();

      // Frequency reference lines
      const refFreqs = [1176.45, 1191.795, 1207.14, 1227.6, 1246.0, 1268.52, 1278.75, 1561.098, 1575.42, 1600.995, 1602.0];
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.fillStyle = t.labelFill;
      ctx.textAlign = 'center';
      for (const freq of refFreqs) {
        const x = toX(freq);
        if (x < plotLeft || x > plotRight) continue;
        // Check we don't overlap too close to another drawn line
        ctx.beginPath();
        ctx.moveTo(x, TOP_PAD);
        ctx.lineTo(x, bottomY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // X-axis labels
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillStyle = t.canvasText + '0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tickStep = maxMHz - minMHz > 200 ? 50 : maxMHz - minMHz > 80 ? 20 : 10;
      const firstTick = Math.ceil(minMHz / tickStep) * tickStep;
      for (let f = firstTick; f <= maxMHz; f += tickStep) {
        const x = toX(f);
        ctx.fillText(`${f}`, x, bottomY + 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.moveTo(x, bottomY);
        ctx.lineTo(x, bottomY + 4);
        ctx.stroke();
      }
      ctx.fillStyle = t.canvasText + '0.4)';
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Frequency [MHz]', (plotLeft + plotRight) / 2, bottomY + 20);

      hitRegionsRef.current = hitRegions;
    },
    [canvasWidth, canvasHeight, band, visibleRows, precomputed],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas);
  }, [draw]);

  // Mouse hover for tooltip — uses Path2D hit testing for pixel-perfect detection
  const handleMouse = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const plotLeft = LABEL_WIDTH;
      const plotRight = canvasWidth - 20;
      const plotWidth = plotRight - plotLeft;
      const { minMHz, maxMHz } = band;

      if (mx < plotLeft || mx > plotRight) {
        setTooltip(null);
        return;
      }

      const fMHz = minMHz + ((mx - plotLeft) / plotWidth) * (maxMHz - minMHz);

      // Reset transform so isPointInPath tests in CSS-pixel space (matching Path2D coords)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      let hit: HitRegion | null = null;
      for (let i = hitRegionsRef.current.length - 1; i >= 0; i--) {
        const region = hitRegionsRef.current[i]!;
        if (region && ctx.isPointInPath(region.path, mx, my)) {
          hit = region;
          break;
        }
      }
      ctx.restore();

      if (hit) {
        setTooltip({
          x: mx,
          y: my,
          label: hit.sig.label,
          constellation: hit.row.label,
          freq: `${fMHz.toFixed(2)} MHz`,
          modulation: hit.sig.modulation === 'composite'
            ? 'CBOC'
            : `${hit.sig.modulation}(${hit.sig.params.join(',')})`,
          color: hit.sig.color,
        });
      } else {
        setTooltip(null);
      }
    },
    [canvasWidth, band],
  );

  const toggleConstellation = (key: string) =>
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Band selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg/40">Band:</span>
          <div className="flex gap-1">
            {BAND_PRESETS.map((bp, i) => (
              <button
                key={bp.label}
                onClick={() => setBandIdx(i)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  i === bandIdx
                    ? 'bg-accent text-fg-strong'
                    : 'bg-bg-raised/60 text-fg/60 hover:text-fg/80 border border-border/30'
                }`}
              >
                {bp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Constellation toggles */}
      <div className="flex flex-wrap gap-2">
        {CONSTELLATIONS.map((c) => (
          <button
            key={c.key}
            onClick={() => toggleConstellation(c.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors border ${
              enabled[c.key]
                ? 'border-border/40 bg-bg-raised/80 text-fg/90'
                : 'border-border/20 bg-bg-raised/30 text-fg/30'
            }`}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{
                backgroundColor: enabled[c.key] ? c.color : 'rgba(var(--color-fg) / 0.1)',
              }}
            />
            {c.label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative w-full rounded-xl bg-bg-raised/60 border border-border/40 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouse}
          onMouseLeave={() => setTooltip(null)}
          className="w-full cursor-crosshair"
          style={{ height: canvasHeight }}
        />
        {tooltip && (
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg text-xs"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 40,
              backgroundColor: theme.tooltipBg,
              border: theme.tooltipBorder,
              color: theme.tooltipFg,
              whiteSpace: 'nowrap',
            }}
          >
            <div className="font-medium flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: tooltip.color }} />
              {tooltip.constellation} — {tooltip.label}
            </div>
            <div className="text-fg/50">{tooltip.freq}</div>
            <div className="text-fg/50">{tooltip.modulation}</div>
          </div>
        )}
      </div>

      {/* BDS-2 / BDS-3 satellite reference */}
      <details
        open={showBdsTable}
        onToggle={(e) => setShowBdsTable((e.target as HTMLDetailsElement).open)}
        className="rounded-xl bg-bg-raised/60 border border-border/40 overflow-hidden"
      >
        <summary className="px-4 py-2.5 text-xs text-fg/60 cursor-pointer hover:text-fg/80 select-none">
          BeiDou satellite phase &amp; orbit reference
        </summary>
        <div className="px-4 pb-4 pt-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-fg/40 border-b border-border/30">
                <th className="text-left py-1.5 pr-4 font-medium">Group</th>
                <th className="text-left py-1.5 pr-4 font-medium">Signals</th>
                <th className="text-left py-1.5 font-medium">PRNs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(BDS_GROUPS).map(([group, prns]) => (
                <tr key={group} className="border-b border-border/20">
                  <td className="py-1.5 pr-4 text-fg/70 whitespace-nowrap font-medium">{group}</td>
                  <td className="py-1.5 pr-4 text-fg/50 whitespace-nowrap">
                    {group.startsWith('BDS-2') ? 'B1I, B2I, B3I' : 'B1C, B1I, B2a, B2b, B3I'}
                  </td>
                  <td className="py-1.5 text-fg/60">{prns.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
