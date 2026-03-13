import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo, startTransition } from 'react';
import type { RinexHeader, RinexStats } from '../util/rinex';
import type { QualityResult } from '../util/quality-analysis';
import type { RinexWarnings } from '../util/rinex-warnings';
import { EMPTY_WARNINGS } from '../util/rinex-warnings';
import type { EpochGrid } from '../util/epoch-grid';
import { systemName, systemCmp } from '../util/rinex';
import { CONSTELLATION_COLORS } from '../util/gnss-constants';
import ConstellationBadges from './ConstellationBadges';
import type { NavResult } from '../util/nav';
import type { AllPositionsData } from '../util/orbit';
import {
  addObsFiles, addNavFiles,
  exportObs, exportNav, clearWorker, applyFilters,
  recomputePositions, rinex3Filename,
} from '../util/rinex-client';
import type { FilterState, ExportFormat, FilenameOptions, HeaderOverrides } from '../util/rinex-client';
import { DEFAULT_FILTER } from '../util/rinex-client';
import type { EditableHeaderFields } from '../util/rinex-header-edit';
import CopyableInput from './CopyableInput';
import ErrorBoundary from './ErrorBoundary';
import FilterBar from './FilterBar';
import ExportPanel from './ExportPanel';
import ObsTypeMatrix from './ObsTypeMatrix';
import type { ReportData } from '../util/report-types';

const RinexCharts = lazy(() => import('./RinexCharts'));
const SkyPlotCharts = lazy(() => import('./SkyPlot'));
const RinexHeaderEditor = lazy(() => import('./RinexHeaderEditor'));
const MultipathCharts = lazy(() => import('./MultipathCharts'));
const CycleSlipCharts = lazy(() => import('./CycleSlipCharts'));
const CompletenessCharts = lazy(() => import('./CompletenessCharts'));
const SatAvailabilityChart = lazy(() => import('./SatAvailabilityChart'));

/* ─── Helpers ─────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/* ─── File type detection ─────────────────────────────────────────── */

function isNavFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/_[MGRECJI]N\.rnx(\.gz)?$/i.test(lower)) return true;
  if (/\.\d{2}[nglpfhiq](\.gz)?$/i.test(lower)) return true;
  if (lower.endsWith('.nav') || lower.endsWith('.nnav') || lower.endsWith('.gnav')) return true;
  return false;
}

async function sniffFileType(file: File): Promise<'nav' | 'obs' | 'unknown'> {
  let text: string;
  if (file.name.toLowerCase().endsWith('.gz')) {
    try {
      const ds = new DecompressionStream('gzip');
      const decompressed = file.stream().pipeThrough(ds);
      const reader = decompressed.getReader();
      const decoder = new TextDecoder();
      let head = '';
      while (head.length < 4096) {
        const { done, value } = await reader.read();
        if (done) break;
        head += decoder.decode(value, { stream: true });
      }
      reader.cancel();
      text = head;
    } catch {
      return 'unknown';
    }
  } else {
    text = await file.slice(0, 4096).text();
  }
  if (/N:\s*(GNSS NAV|GPS NAV|GLO NAV|GAL NAV|GEO NAV|BDS NAV|MIXED NAV)/i.test(text)) return 'nav';
  if (/NAVIGATION DATA/i.test(text)) return 'nav';
  if (/OBSERVATION DATA|COMPACT RINEX/i.test(text)) return 'obs';
  return 'unknown';
}


/** Guess constellation from a nav file name. Returns system letter (G/R/E/C/J/I/S) or null. */
function navFileConstellation(name: string): string | null {
  const lower = name.toLowerCase();
  // RINEX 3/4 long name: _GN, _RN, _EN, _CN, _JN, _IN, _SN, _MN
  const r3 = lower.match(/_([grecjism])n\.rnx/i);
  if (r3) {
    const map: Record<string, string> = { g: 'G', r: 'R', e: 'E', c: 'C', j: 'J', i: 'I', s: 'S', m: 'M' };
    return map[r3[1]!.toLowerCase()] ?? null;
  }
  // Legacy .YYx extension
  const leg = lower.match(/\.\d{2}([nglpfhiq])(?:\.gz)?$/);
  if (leg) {
    const map: Record<string, string> = { n: 'G', g: 'R', l: 'E', f: 'C', q: 'J', i: 'I', h: 'S', p: 'M' };
    return map[leg[1]!] ?? null;
  }
  return null;
}

/** Human label for a constellation letter */
function constellationLabel(sys: string): string {
  const labels: Record<string, string> = {
    G: 'GPS', R: 'GLONASS', E: 'Galileo', C: 'BeiDou',
    J: 'QZSS', I: 'NavIC', S: 'SBAS', M: 'Mixed',
  };
  return labels[sys] ?? sys;
}

/* ─── IGS broadcast ephemeris download ────────────────────────────── */

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

const IGS_PROXY = 'https://ntrip-proxy.gnsscalc.com';

async function fetchIgsEphemeris(date: Date): Promise<File> {
  const yyyy = String(date.getUTCFullYear());
  const doy = String(dayOfYear(date)).padStart(3, '0');
  const name = `BRDC00IGS_R_${yyyy}${doy}0000_01D_MN.rnx`;

  const res = await fetch(IGS_PROXY, {
    headers: { 'X-Igs-Brdc': `${yyyy}/${doy}` },
  });
  if (!res.ok) throw new Error(`Failed to download ephemeris (HTTP ${res.status})`);

  const ds = new DecompressionStream('gzip');
  const decompressed = res.body!.pipeThrough(ds);
  const blob = await new Response(decompressed).blob();
  return new File([blob], name, { type: 'text/plain' });
}

/* ─── Multi-obs merge ─────────────────────────────────────────────── */

const OBS_ACCEPT = ".obs,.rnx,.crx,.gz,.Z,.26o,.25o,.24o,.23o,.22o,.21o,.20o,.19o,.18o,.17o,.16o,.15o,.14o,.13o,.12o,.11o,.10o,.09o,.08o,.07o,.06o,.05o,.04o,.03o,.02o,.01o,.00o,.26d,.25d,.24d,.23d,.22d,.21d,.20d,.19d,.18d,.17d,.16d,.15d,.14d,.13d,.12d,.11d,.10d,.09d,.08d,.07d,.06d,.05d,.04d,.03d,.02d,.01d,.00d";
const NAV_ACCEPT = [
  ".rnx,.nav,.nnav,.gnav,.gz",
  // Legacy per-constellation nav extensions (.YYx): n=GPS, g=GLONASS, l=Galileo, f=BeiDou, h=SBAS, i=NavIC, q=QZSS, p=mixed
  ...['n','g','l','f','h','i','q','p'].flatMap(c =>
    Array.from({ length: 27 }, (_, y) => `.${String(y).padStart(2, '0')}${c}`)
  ),
].join(',');

/* ─── Icons ───────────────────────────────────────────────────────── */

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}


function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ─── Upload drop zone (initial state) ────────────────────────────── */

function UploadDropZone({
  isDragging,
  loading,
  progress,
  navFileNames,
  navLoading,
  onDrop,
  onDragOver,
  onDragLeave,
  onFiles,
}: {
  isDragging: boolean;
  loading: boolean;
  progress: number;
  navFileNames: string[];
  navLoading: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
  }, [onFiles]);

  // Show loading state
  if (loading || navLoading) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-12">
        <SpinnerIcon className="size-6 animate-spin text-accent" />
        <div className="text-center">
          <p className="text-sm text-fg/60 mb-0.5">
            {loading
              ? `Parsing… ${progress > 0 ? `${progress}%` : ''}`
              : 'Loading navigation…'}
          </p>
          {navFileNames.length > 0 && (
            <p className="text-[10px] text-fg/25 mt-1 mb-0">
              + {navFileNames.length} nav file{navFileNames.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
        {loading && progress > 0 && (
          <div className="w-48 h-1 bg-border/40 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`card flex flex-col items-center justify-center gap-3 py-12 border-dashed cursor-pointer transition-colors ${
        isDragging ? 'border-accent bg-accent/10' : ''
      }`}
      onClick={() => inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <UploadIcon className="size-8 text-fg/20" />
      <div className="text-center">
        <p className="text-sm text-fg/50 mb-0.5">Drop all station files here</p>
        <p className="text-[10px] text-fg/20 mb-0">
          Observation + Navigation &mdash; we&apos;ll sort them automatically
        </p>
      </div>
      <p className="text-[10px] text-fg/15 mb-0">
        .obs .rnx .YYo .YYn .YYg .YYl .YYf &middot; RINEX 2/3/4 &middot; Hatanaka &middot; gzip
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={`${OBS_ACCEPT},${NAV_ACCEPT}`}
        onChange={handleChange}
        className="hidden"
        multiple
      />
    </div>
  );
}

/* ─── Stat pill (for the compact summary strip) ───────────────────── */

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-fg/35">{label}</span>
      <span className="text-fg/70 font-medium">{value}</span>
    </div>
  );
}

/* ─── Validation warnings panel ───────────────────────────────────── */

const SEVERITY_STYLE: Record<string, { dot: string; text: string }> = {
  error:   { dot: 'bg-red-400',    text: 'text-red-400' },
  warning: { dot: 'bg-orange-400', text: 'text-orange-400' },
  info:    { dot: 'bg-fg/20',      text: 'text-fg/40' },
};

function WarningsPanel({ warnings }: { warnings: RinexWarnings }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 pt-2 border-t border-border/20">
      <button
        type="button"
        className="flex items-center gap-2 text-[11px] text-fg/50 hover:text-fg/70 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5 text-fg/30">
          <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
        </svg>
        <span>Validation</span>
        {warnings.errorCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-red-400">
            <span className="size-1.5 rounded-full bg-red-400" />{warnings.errorCount}
          </span>
        )}
        {warnings.warningCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-orange-400">
            <span className="size-1.5 rounded-full bg-orange-400" />{warnings.warningCount}
          </span>
        )}
        {warnings.infoCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-fg/30">
            <span className="size-1.5 rounded-full bg-fg/20" />{warnings.infoCount}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className={`size-3 text-fg/30 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1">
          {warnings.items.map(w => {
            const style = SEVERITY_STYLE[w.severity] ?? SEVERITY_STYLE.info!;
            return (
              <div key={w.code} className="flex items-start gap-2 text-[11px]">
                <span className={`size-1.5 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
                <div className="min-w-0">
                  <span className="text-fg/60">{w.message}</span>
                  {w.count > 1 && <span className="text-fg/25 ml-1">({w.count}x)</span>}
                  {w.examples && w.examples.length > 0 && (
                    <div className="text-[10px] text-fg/25 mt-0.5 font-mono truncate">
                      {w.examples.join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Nav-only summary ────────────────────────────────────────────── */

function NavSummary({ navResult }: { navResult: NavResult }) {
  const { header, ephemerides } = navResult;

  const stats = useMemo(() => {
    let minT = Infinity, maxT = -Infinity;
    const satsBySystem: Record<string, Set<string>> = {};
    const ephCountBySystem: Record<string, number> = {};

    for (const eph of ephemerides) {
      const t = eph.tocDate.getTime();
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
      const sys = eph.prn.charAt(0);
      if (!satsBySystem[sys]) satsBySystem[sys] = new Set();
      satsBySystem[sys]!.add(eph.prn);
      ephCountBySystem[sys] = (ephCountBySystem[sys] ?? 0) + 1;
    }

    const systems: string[] = Object.keys(satsBySystem).sort(systemCmp);
    const totalSats = systems.reduce((s, sys) => s + satsBySystem[sys]!.size, 0);

    return {
      systems, satsBySystem, ephCountBySystem, totalSats,
      startTime: isFinite(minT) ? new Date(minT) : null,
      endTime: isFinite(maxT) ? new Date(maxT) : null,
      duration: isFinite(minT) && isFinite(maxT) ? (maxT - minT) / 1000 : null,
    };
  }, [ephemerides]);

  return (
    <div className="card-output">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-fg">Navigation Summary</span>
      </div>
      <div className="card-fields">
        <label>RINEX version</label>
        <CopyableInput value={header.version.toFixed(2)} />
        <label>Constellations</label>
        <ConstellationBadges activeSystems={stats.systems} />
        {stats.startTime && (<><label>Start</label><CopyableInput value={formatTime(stats.startTime)} /></>)}
        {stats.endTime && stats.duration !== null && stats.duration > 0 && (
          <><label>End</label><CopyableInput value={formatTime(stats.endTime)} />
          <label>Duration</label><CopyableInput value={formatDuration(stats.duration)} /></>
        )}
        <div className="section-divider" /><div className="section-label">Satellites</div>
        <label>Ephemerides</label><CopyableInput value={`${ephemerides.length} records`} />
        <label>Unique satellites</label><CopyableInput value={String(stats.totalSats)} />
        {stats.systems.map(sys => (
          <div key={sys} className="contents">
            <label>{systemName(sys)}</label>
            <CopyableInput value={`${stats.satsBySystem[sys]!.size} SVs · ${stats.ephCountBySystem[sys]} eph`} />
          </div>
        ))}
        {header.leapSeconds != null && (
          <><div className="section-divider" /><div className="section-label">Parameters</div>
          <label>Leap seconds</label><CopyableInput value={`${header.leapSeconds} s`} /></>
        )}
        {Object.keys(header.ionoCorrections).length > 0 && (
          <>
            {header.leapSeconds == null && <><div className="section-divider" /><div className="section-label">Parameters</div></>}
            {Object.entries(header.ionoCorrections).map(([key, vals]) => (
              <div key={key} className="contents">
                <label>{key}</label>
                <CopyableInput value={vals.map(v => v.toExponential(4)).join('  ')} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── File panel (collapsible manifest of loaded files) ───────────── */

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`${className ?? ''} transition-transform ${open ? 'rotate-90' : ''}`}>
      <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 1a.75.75 0 01.75.75v6.69l1.72-1.72a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V1.75A.75.75 0 018 1zM2.75 9.5a.75.75 0 01.75.75v2c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-2a.75.75 0 011.5 0v2A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-2a.75.75 0 01.75-.75z" />
    </svg>
  );
}

function FilePanel({
  files,
  loading,
  navLoading,
  computing,
}: {
  files: LoadedFileInfo[];
  loading: boolean;
  navLoading: boolean;
  computing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const obsFiles = files.filter(f => f.type === 'obs');
  const navFiles = files.filter(f => f.type === 'nav');

  // Group nav by constellation
  const navGroups = useMemo(() => {
    const groups = new Map<string, LoadedFileInfo[]>();
    for (const f of navFiles) {
      const sys = f.constellation ?? '?';
      const arr = groups.get(sys) ?? [];
      arr.push(f);
      groups.set(sys, arr);
    }
    const sysOrder = ['G', 'R', 'E', 'C', 'J', 'I', 'S', 'M', '?'];
    return sysOrder.filter(s => groups.has(s)).map(s => ({ sys: s, files: groups.get(s)! }));
  }, [navFiles]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Auto-expand when <14 files on first load
  useEffect(() => {
    if (initializedRef.current || files.length === 0) return;
    initializedRef.current = true;
    if (files.length < 14) {
      setOpen(true);
      const sections = new Set<string>();
      if (files.some(f => f.type === 'obs')) sections.add('obs');
      const navSystems = new Set<string>();
      for (const f of files) {
        if (f.type === 'nav') navSystems.add(f.constellation ?? '?');
      }
      for (const sys of navSystems) sections.add(`nav-${sys}`);
      setExpandedSections(sections);
    }
  }, [files]);

  if (files.length === 0 && !loading && !navLoading) return null;

  const OBS_COLOR = '#60a5fa'; // blue-400

  return (
    <div className="mt-2 pt-2 border-t border-border/20">
      {/* Summary row — always visible, clickable to toggle */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-fg/40 hover:text-fg/60 transition-colors"
          onClick={() => setOpen(o => !o)}
        >
          <ChevronIcon open={open} className="size-3" />
          <span>
            {obsFiles.length > 0 && (
              <span style={{ color: OBS_COLOR, opacity: 0.7 }}>{obsFiles.length === 1 ? '1 obs' : `${obsFiles.length} obs`}</span>
            )}
            {obsFiles.length > 0 && navFiles.length > 0 && <span className="text-fg/20"> · </span>}
            {navGroups.map((g, i) => {
              const color = CONSTELLATION_COLORS[g.sys] ?? '#94a3b8';
              return (
                <span key={g.sys}>
                  {i > 0 && <span className="text-fg/20"> · </span>}
                  <span style={{ color, opacity: 0.7 }}>
                    {constellationLabel(g.sys)}{g.files.length > 1 && <span style={{ opacity: 0.5 }}> ×{g.files.length}</span>}
                  </span>
                </span>
              );
            })}
          </span>
          {totalSize > 0 && <span className="text-fg/20 ml-1">{formatFileSize(totalSize)}</span>}
        </button>

        {/* Loading spinners */}
        {loading && <span className="inline-flex items-center gap-1 text-[10px] text-fg/30"><SpinnerIcon className="size-2.5 animate-spin" /> obs</span>}
        {navLoading && <span className="inline-flex items-center gap-1 text-[10px] text-fg/30"><SpinnerIcon className="size-2.5 animate-spin" /> nav</span>}
        {computing && <span className="inline-flex items-center gap-1 text-[10px] text-fg/30"><SpinnerIcon className="size-2.5 animate-spin" /> orbits</span>}
      </div>

      {/* Expanded file list */}
      {open && files.length > 0 && (
        <div className="mt-2 rounded-lg bg-bg/40 border border-border/20 text-[11px]">
          {/* Observations */}
          {obsFiles.length > 0 && (
            <div>
              <button
                type="button"
                className="w-full flex items-center gap-1.5 bg-bg/80 backdrop-blur px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-border/10 hover:bg-bg/90 transition-colors text-left"
                style={{ color: OBS_COLOR, opacity: 0.8 }}
                onClick={() => toggleSection('obs')}
              >
                <ChevronIcon open={expandedSections.has('obs')} className="size-2.5 shrink-0" />
                Observations
                <span className="font-normal text-fg/25">{obsFiles.length} file{obsFiles.length > 1 ? 's' : ''} · {formatFileSize(obsFiles.reduce((s, f) => s + f.size, 0))}</span>
              </button>
              {expandedSections.has('obs') && obsFiles.map(f => (
                <div key={f.name} className="flex items-center justify-between px-3 pl-7 py-1 border-b border-border/5 hover:bg-fg/[0.02]">
                  <span className="font-mono text-fg/50 truncate">{f.name}</span>
                  <span className="text-fg/20 shrink-0 ml-3">{formatFileSize(f.size)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Navigation — per constellation */}
          {navGroups.map(g => {
            const color = CONSTELLATION_COLORS[g.sys] ?? '#94a3b8';
            const sectionKey = `nav-${g.sys}`;
            return (
              <div key={g.sys}>
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 bg-bg/80 backdrop-blur px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-border/10 hover:bg-bg/90 transition-colors text-left"
                  style={{ color, opacity: 0.8 }}
                  onClick={() => toggleSection(sectionKey)}
                >
                  <ChevronIcon open={expandedSections.has(sectionKey)} className="size-2.5 shrink-0" />
                  {constellationLabel(g.sys)}
                  <span className="font-normal text-fg/25">{g.files.length} file{g.files.length > 1 ? 's' : ''} · {formatFileSize(g.files.reduce((s, f) => s + f.size, 0))}</span>
                </button>
                {expandedSections.has(sectionKey) && g.files.map(f => (
                  <div key={f.name} className="flex items-center justify-between px-3 pl-7 py-1 border-b border-border/5 hover:bg-fg/[0.02]">
                    <span className="font-mono text-fg/50 truncate">{f.name}</span>
                    <span className="text-fg/20 shrink-0 ml-3">{formatFileSize(f.size)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────── */

/** A staged file entry in the manifest */
interface StagedFile {
  file: File;
  type: 'obs' | 'nav' | 'unknown';
  constellation: string | null; // for nav files
  name: string;
  size: number;
}

/** Metadata kept after processing for display in the file panel */
interface LoadedFileInfo {
  name: string;
  size: number;
  type: 'obs' | 'nav';
  constellation: string | null;
}

export default function RinexReaderPage() {
  // Staged files (manifest before/during loading)
  const [staged, setStaged] = useState<StagedFile[]>([]);

  // Parsed results
  const [header, setHeader] = useState<RinexHeader | null>(null);
  const [stats, setStats] = useState<RinexStats | null>(null);
  const [allSystems, setAllSystems] = useState<string[]>([]); // unfiltered systems list
  const [grid, setGrid] = useState<EpochGrid | null>(null);
  const [obsFileNames, setObsFileNames] = useState<string[]>([]);
  const [navResult, setNavResult] = useState<NavResult | null>(null);
  const [navFileNames, setNavFileNames] = useState<string[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<LoadedFileInfo[]>([]);
  const [allPositions, setAllPositions] = useState<AllPositionsData | null>(null);
  const [observedPrns, setObservedPrns] = useState<Set<string>[] | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [computing, setComputing] = useState(false);
  const addFilesInputRef = useRef<HTMLInputElement>(null);

  const [qaResult, setQaResult] = useState<QualityResult | null>(null);
  const [warnings, setWarnings] = useState<RinexWarnings>(EMPTY_WARNINGS);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTER });
  const [availablePrns, setAvailablePrns] = useState<string[]>([]);
  const [availableCodes, setAvailableCodes] = useState<Record<string, string[]>>({});
  const [filtering, setFiltering] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterVersionRef = useRef(0);

  // Header edit overrides (null = no edits)
  const [headerEdits, setHeaderEdits] = useState<EditableHeaderFields | null>(null);

  // PDF report generation
  const [reportGenerating, setReportGenerating] = useState(false);
  const handleGenerateReport = useCallback(async () => {
    if (!header || !stats || !grid) return;
    setReportGenerating(true);
    try {
      const { generateReport, downloadReport } = await import('./PdfReport');
      const reportData: ReportData = {
        header, stats, warnings, grid,
        allPositions, observedPrns,
        qaResult: qaResult ? { multipath: qaResult.multipath, cycleSlips: qaResult.cycleSlips, completeness: qaResult.completeness } : null,
        obsFileNames, navFileNames,
      };
      const blob = await generateReport(reportData);
      const fname = rinex3Filename(
        header.markerName, stats.startTime ?? null, stats.duration ?? null, stats.interval ?? null, 'MO',
      ).replace(/_MO\.rnx$/, '.pdf');
      downloadReport(blob, fname);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate report.');
    } finally {
      setReportGenerating(false);
    }
  }, [header, stats, warnings, grid, allPositions, observedPrns, qaResult, obsFileNames, navFileNames]);

  // Recompute satellite positions when edited reference position changes
  const hasPositions = !!allPositions;
  useEffect(() => {
    if (!hasPositions) return; // no positions to recompute
    const rxPos: [number, number, number] | undefined = headerEdits
      ? [headerEdits.positionX, headerEdits.positionY, headerEdits.positionZ]
      : header?.approxPosition ?? undefined;
    let cancelled = false;
    recomputePositions(rxPos).then(r => {
      if (cancelled) return;
      if (r.positions) {
        setAllPositions(r.positions);
        if (r.observedPrns) setObservedPrns(r.observedPrns);
      }
    });
    return () => { cancelled = true; };
    // Only re-run when position fields change, not on every headerEdits change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPositions, headerEdits?.positionX, headerEdits?.positionY, headerEdits?.positionZ]);

  /** Classify files and add to staged manifest */
  const stageFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const newStaged: StagedFile[] = [];

    for (const f of files) {
      // Skip duplicates
      if (staged.some(s => s.name === f.name) || newStaged.some(s => s.name === f.name)) continue;

      let type: 'obs' | 'nav' | 'unknown';
      let constellation: string | null = null;

      if (isNavFileName(f.name)) {
        type = 'nav';
        constellation = navFileConstellation(f.name);
      } else {
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.rnx') || lower.endsWith('.rnx.gz') || lower.endsWith('.gz')) {
          const sniffed = await sniffFileType(f);
          type = sniffed === 'unknown' ? 'obs' : sniffed; // default ambiguous to obs
          if (type === 'nav') constellation = navFileConstellation(f.name);
        } else {
          type = 'obs';
        }
      }
      newStaged.push({ file: f, type, constellation, name: f.name, size: f.size });
    }

    if (newStaged.length > 0) {
      setStaged(prev => [...prev, ...newStaged]);
    }
  }, [staged]);

  /** Process all staged files — parse obs and nav */
  const processStaged = useCallback(async () => {
    const obsEntries = staged.filter(s => s.type === 'obs');
    const navEntries = staged.filter(s => s.type === 'nav');

    if (obsEntries.length === 0 && navEntries.length === 0) return;

    setError(null);

    // Process observation files (incremental — worker accumulates)
    if (obsEntries.length > 0) {
      const newObsEntries = obsEntries.filter(e => !obsFileNames.includes(e.name));

      if (newObsEntries.length > 0) {
        setLoading(true);
        setProgress(0);

        try {
          const result = await addObsFiles(newObsEntries.map(e => e.file), setProgress);
          setHeader(result.header);
          setStats(result.stats);
          setAllSystems(result.stats.systems);
          setGrid(result.grid);
          setQaResult(result.qaResult);
          setWarnings(result.warnings);
          setAvailablePrns(result.availablePrns);
          setAvailableCodes(result.availableCodes);
          setObsFileNames(prev => [...prev, ...newObsEntries.map(e => e.name)]);
          if (result.positions) { setAllPositions(result.positions); setObservedPrns(result.observedPrns); }
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to parse observation file(s).');
        } finally {
          setLoading(false);
        }
      }
    }

    // Process nav files (incremental — worker accumulates)
    if (navEntries.length > 0) {
      const newNavEntries = navEntries.filter(e => !navFileNames.includes(e.name));

      if (newNavEntries.length > 0) {
        setNavLoading(true);
        try {
          setComputing(true);
          const { navResult: merged, positions, observedPrns: prns } =
            await addNavFiles(newNavEntries.map(e => e.file));
          setNavResult(merged);
          setNavFileNames(prev => [...prev, ...newNavEntries.map(e => e.name)]);
          if (positions) { setAllPositions(positions); setObservedPrns(prns); }
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to parse navigation file(s).');
        } finally {
          setComputing(false);
          setNavLoading(false);
        }
      }
    }

    // Preserve file metadata for display, then clear staged
    setLoadedFiles(prev => [
      ...prev,
      ...staged
        .filter(s => s.type === 'obs' || s.type === 'nav')
        .map(s => ({ name: s.name, size: s.size, type: s.type as 'obs' | 'nav', constellation: s.constellation })),
    ]);
    setStaged([]);
  }, [staged, obsFileNames, navFileNames]);

  // Auto-process when files are staged (no manual "Load" button — just go)
  const pendingProcess = useRef(false);
  useEffect(() => {
    if (staged.length === 0 || pendingProcess.current) return;
    pendingProcess.current = true;
    // Small delay to batch rapid drops
    const timer = setTimeout(() => {
      processStaged();
      pendingProcess.current = false;
    }, 150);
    return () => { clearTimeout(timer); pendingProcess.current = false; };
  }, [staged, processStaged]);

  /** Add more files (from drop or picker) on already-loaded page */
  const addMoreFiles = useCallback(async (fileList: FileList | File[]) => {
    await stageFiles(fileList);
  }, [stageFiles]);

  const handleGlobalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    stageFiles(files);
  }, [stageFiles]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleReset = useCallback(() => {
    setStaged([]); setHeader(null); setStats(null); setAllSystems([]); setGrid(null);
    setNavResult(null); setAllPositions(null); setObservedPrns(null);
    setError(null); setObsFileNames([]);
    setNavFileNames([]); setLoadedFiles([]);
    setProgress(0); setQaResult(null); setWarnings(EMPTY_WARNINGS);
    setFilters({ ...DEFAULT_FILTER }); setHeaderEdits(null);
    setAvailablePrns([]); setAvailableCodes({});
    clearWorker();
  }, []);

  // Debounced filter application with version tracking to discard stale results
  const handleFilterChange = useCallback((next: FilterState) => {
    setFilters(next);
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    const version = ++filterVersionRef.current;
    filterTimerRef.current = setTimeout(async () => {
      setFiltering(true);
      try {
        const r = await applyFilters(next);
        // Discard if a newer filter was applied while we were computing
        if (filterVersionRef.current !== version) return;
        startTransition(() => {
          setStats(r.stats);
          setGrid(r.grid);
          setQaResult(r.qaResult);
          if (r.positions) { setAllPositions(r.positions); setObservedPrns(r.observedPrns); }
        });
      } catch (e: unknown) {
        if (filterVersionRef.current !== version) return;
        setError(e instanceof Error ? e.message : 'Filter error');
      } finally {
        if (filterVersionRef.current === version) setFiltering(false);
      }
    }, 300);
  }, []);

  const [igsLoading, setIgsLoading] = useState(false);
  const handleFetchIgs = useCallback(async () => {
    const startDate = stats?.startTime ?? navResult?.ephemerides[0]?.tocDate;
    if (!startDate) return;
    setIgsLoading(true);
    setError(null);
    try {
      // Collect all days spanned by the observation
      const endDate = stats?.endTime ?? startDate;
      const startDay = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
      const endDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
      const days: Date[] = [];
      for (let d = startDay; d <= endDay; d += 86_400_000) {
        days.push(new Date(d));
      }
      const files = await Promise.all(days.map(d => fetchIgsEphemeris(d)));
      await stageFiles(files);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch IGS ephemeris.');
    } finally {
      setIgsLoading(false);
    }
  }, [stats, navResult, stageFiles]);

  const [navExporting, setNavExporting] = useState(false);
  const handleDownloadNav = useCallback(async (fnOpts?: FilenameOptions) => {
    if (!navResult) return;
    setNavExporting(true);
    try {
      await exportNav(header?.markerName || '', fnOpts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to export navigation file.');
    } finally {
      setNavExporting(false);
    }
  }, [navResult, header]);

  const [obsExporting, setObsExporting] = useState(false);
  const handleDownloadObs = useCallback(async (format: ExportFormat = 'rinex3', splitInterval: number | null = null, fnOpts?: FilenameOptions) => {
    if (!header) return;
    setObsExporting(true);
    try {
      const hasFilters = filters.excludedSystems.length > 0
        || filters.excludedPrns.length > 0
        || filters.excludedSignalTypes.length > 0
        || filters.excludedBands.length > 0
        || Object.keys(filters.excludedSignalsPerSystem).length > 0
        || filters.timeStart != null || filters.timeEnd != null
        || filters.samplingInterval != null || filters.sparseThreshold > 0;

      // Convert EditableHeaderFields to HeaderOverrides
      let headerOverrides: HeaderOverrides | undefined;
      if (headerEdits) {
        headerOverrides = {
          markerName: headerEdits.markerName,
          markerType: headerEdits.markerType,
          receiverNumber: headerEdits.receiverNumber,
          receiverType: headerEdits.receiverType,
          receiverVersion: headerEdits.receiverVersion,
          antNumber: headerEdits.antNumber,
          antType: headerEdits.antType,
          approxPosition: [headerEdits.positionX, headerEdits.positionY, headerEdits.positionZ],
          antDelta: [headerEdits.antDeltaH, headerEdits.antDeltaE, headerEdits.antDeltaN],
          observer: headerEdits.observer,
          agency: headerEdits.agency,
        };
      }

      await exportObs({
        format,
        splitInterval,
        filters: hasFilters ? filters : undefined,
        filename: fnOpts,
        headerOverrides,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to export observation file.');
    } finally {
      setObsExporting(false);
    }
  }, [header, filters, headerEdits]);

  /* ─── Initial upload state (nothing loaded yet) ─────────────── */
  const hasAnyData = !!header || !!navResult;
  if (!hasAnyData && !loading && !navLoading) {
    return (
      <section className="flex flex-col gap-4">
        <UploadDropZone
          isDragging={isDragging}
          loading={loading}
          progress={progress}
          navFileNames={navFileNames}
          navLoading={navLoading}
          onDrop={handleGlobalDrop}
          onDragOver={handleGlobalDragOver}
          onDragLeave={() => setIsDragging(false)}
          onFiles={stageFiles}
        />

        {error && (
          <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}
      </section>
    );
  }

  /* ─── Loaded / loading state ────────────────────────────────── */
  const obsLabel = obsFileNames.length > 1 ? `${obsFileNames.length} obs files` : obsFileNames[0] ?? null;

  return (
    <section className="flex flex-col gap-4">
      {/* ── Compact summary strip ────────────────────────────── */}
      <div
        className={`rounded-xl bg-bg-raised/60 border border-border/40 px-4 py-3 transition-colors ${isDragging ? 'border-accent bg-accent/5' : ''}`}
        onDrop={handleGlobalDrop}
        onDragOver={handleGlobalDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        {/* Row 1: marker name + constellation badges + actions */}
        <div className="flex items-center gap-3 min-w-0">
          {header ? (
            <>
              <span className="text-sm font-semibold text-fg truncate shrink min-w-0" title={header.markerName || obsLabel || undefined}>
                {header.markerName || obsLabel}
              </span>
              <span className="text-[10px] text-fg/30 shrink-0">v{header.version.toFixed(0)}</span>
            </>
          ) : navResult ? (
            <>
              <span className="text-sm font-semibold text-fg truncate shrink min-w-0">
                Navigation Data
              </span>
              <span className="text-[10px] text-fg/30 shrink-0">v{navResult.header.version.toFixed(0)}</span>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <SpinnerIcon className="size-3.5 animate-spin text-accent" />
              <span className="text-xs text-fg/50">
                {loading
                  ? `Parsing… ${progress > 0 ? `${progress}%` : ''}`
                  : 'Loading navigation…'}
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="text-fg/20 hover:text-fg/50 transition-colors"
              onClick={handleReset}
              title="Clear all files"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2: key stats as compact pills */}
        {stats && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t border-border/20">
            {stats.startTime && (
              <StatPill label="Start" value={formatTime(stats.startTime)} />
            )}
            {stats.duration !== null && stats.duration > 0 && (
              <StatPill label="Duration" value={formatDuration(stats.duration)} />
            )}
            {stats.interval !== null && (
              <StatPill label="Interval" value={`${stats.interval}s`} />
            )}
            <StatPill label="Epochs" value={stats.totalEpochs.toLocaleString()} />
            <StatPill label="SVs" value={`${stats.uniqueSatellites} (avg ${stats.meanSatellites.toFixed(1)})`} />
            {stats.meanSnr !== null && (
              <StatPill label="C/N0" value={`${stats.meanSnr.toFixed(1)} dB-Hz`} />
            )}
          </div>
        )}

        {/* ── Validation warnings ───────────────────────────── */}
        {warnings.items.length > 0 && <WarningsPanel warnings={warnings} />}

        {/* ── Station & Header editor (inside summary card) ──── */}
        {header && stats && (
          <div className="mt-2 pt-2 border-t border-border/20">
            <ErrorBoundary>
              <Suspense fallback={null}>
                <RinexHeaderEditor header={header} onFieldsChange={setHeaderEdits} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Fetch IGS ephemeris prompt */}
        {header && !navResult && !navLoading && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/20">
            <span className="text-[11px] text-fg/30">No navigation data</span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] text-accent/70 hover:text-accent px-2.5 py-1 rounded-md border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-50"
              onClick={handleFetchIgs}
              disabled={igsLoading}
            >
              {igsLoading
                ? <><SpinnerIcon className="size-3 animate-spin" /> Fetching…</>
                : <><DownloadIcon className="size-3" /> Fetch IGS broadcast ephemeris</>}
            </button>
          </div>
        )}

        {/* Row 3: collapsible file panel + downloads */}
        <FilePanel
          files={loadedFiles}
          loading={loading}
          navLoading={navLoading}
          computing={computing}
        />

        {/* Export panel */}
        <ExportPanel
          hasObs={!!header && obsFileNames.length > 0}
          hasNav={!!navResult}
          filters={filters}
          obsExporting={obsExporting}
          navExporting={navExporting}
          markerName={header?.markerName}
          hasHeaderEdits={!!headerEdits}
          originalFilename={obsFileNames[0]}
          startTime={stats?.startTime}
          durationSec={stats?.duration}
          intervalSec={stats?.interval}
          onExportObs={handleDownloadObs}
          onExportNav={handleDownloadNav}
        />

        {/* PDF report */}
        {stats && (
          <div className="mt-2 pt-2 border-t border-border/20 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] text-accent/70 hover:text-accent px-2.5 py-1 rounded-md border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-50"
              onClick={handleGenerateReport}
              disabled={reportGenerating}
            >
              {reportGenerating
                ? <><SpinnerIcon className="size-3 animate-spin" /> Generating…</>
                : <><DownloadIcon className="size-3" /> Generate PDF Report</>}
            </button>
          </div>
        )}
      </div>

      {/* Drop zone — always visible for adding more files */}
      <div
        className={`rounded-xl border border-dashed px-4 py-2.5 flex items-center justify-center gap-2 text-[11px] cursor-pointer transition-colors ${
          isDragging ? 'border-accent bg-accent/5 text-accent/60' : 'border-border/30 text-fg/25 hover:border-fg/20 hover:text-fg/40'
        }`}
        onClick={() => addFilesInputRef.current?.click()}
        onDrop={handleGlobalDrop}
        onDragOver={handleGlobalDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        <UploadIcon className="size-3.5" />
        Drop more files or click to add
        <input ref={addFilesInputRef} type="file" accept={`${OBS_ACCEPT},${NAV_ACCEPT}`} multiple className="hidden" onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) addMoreFiles(e.target.files);
        }} />
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────── */}
      {header && stats && availablePrns.length > 0 && (
        <FilterBar
          filters={filters}
          onChange={handleFilterChange}
          availablePrns={availablePrns}
          availableCodes={availableCodes}
          allSystems={allSystems}
          timeStart={stats.startTime?.getTime() ?? null}
          timeEnd={stats.endTime?.getTime() ?? null}
          interval={stats.interval}
        />
      )}

      {filtering && (
        <div className="flex items-center gap-2 text-[11px] text-fg/40">
          <SpinnerIcon className="size-3 animate-spin" /> Applying filters…
        </div>
      )}

      {header && stats && grid && (
        <>
          {/* ── Observation inventory (standalone card) ─────────── */}
          {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
            <div className="rounded-xl bg-bg-raised/60 border border-border/40 px-4 py-3">
              <div className="text-sm font-semibold text-fg mb-1">Observation Inventory</div>
              <ObsTypeMatrix obsTypes={header.obsTypes} systems={stats.systems} />
            </div>
          )}

          {/* ── Charts (the main content — immediately visible) ── */}
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex flex-col gap-4">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
                      <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
                      <div className="flex items-center justify-center" style={{ height: 180 }}>
                        <SpinnerIcon className="size-5 animate-spin text-fg/20" />
                      </div>
                    </div>
                  ))}
                </div>
              }
            >
              <RinexCharts grid={grid} systems={stats.systems} />
            </Suspense>
          </ErrorBoundary>

          {/* ── Signal quality analysis (multipath + cycle slips + completeness) ── */}
          {qaResult && (
            <ErrorBoundary>
              <Suspense fallback={
                <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
                  <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
                  <div className="flex items-center justify-center" style={{ height: 180 }}>
                    <SpinnerIcon className="size-5 animate-spin text-fg/20" />
                  </div>
                </div>
              }>
                <MultipathCharts result={qaResult.multipath} allPositions={allPositions} />
                <CycleSlipCharts result={qaResult.cycleSlips} />
                <CompletenessCharts result={qaResult.completeness} />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── Satellite availability & health ─────────────────── */}
          {navResult && (
            <ErrorBoundary>
              <Suspense fallback={null}>
                <SatAvailabilityChart ephemerides={navResult.ephemerides} grid={grid} />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* ── Sky Plot, Ground Tracks & DOP ──────────────────── */}
          {allPositions && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
                    <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
                    <div className="flex items-center justify-center" style={{ height: 360 }}>
                      <SpinnerIcon className="size-5 animate-spin text-fg/20" />
                    </div>
                  </div>
                }
              >
                <SkyPlotCharts
                  allPositions={allPositions}
                  observedPrns={observedPrns}
                  rxPos={headerEdits
                    ? [headerEdits.positionX, headerEdits.positionY, headerEdits.positionZ]
                    : header.approxPosition ?? undefined}
                  grid={grid}
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </>
      )}

      {/* ── Nav-only: availability, sky plot + nav summary ─────── */}
      {!header && navResult && (
        <>
          <NavSummary navResult={navResult} />
          <ErrorBoundary>
            <Suspense fallback={null}>
              <SatAvailabilityChart ephemerides={navResult.ephemerides} grid={null} />
            </Suspense>
          </ErrorBoundary>
          {allPositions && (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
                    <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
                    <div className="flex items-center justify-center" style={{ height: 360 }}>
                      <SpinnerIcon className="size-5 animate-spin text-fg/20" />
                    </div>
                  </div>
                }
              >
                <SkyPlotCharts allPositions={allPositions} />
              </Suspense>
            </ErrorBoundary>
          )}
        </>
      )}
    </section>
  );
}
