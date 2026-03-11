import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseRinexStream } from '../util/rinex';
import type { RinexResult } from '../util/rinex';
import { analyzeQuality } from '../util/quality-analysis';
import type { QualityResult } from '../util/quality-analysis';
import { systemName, systemCmp } from '../util/rinex';
import ConstellationBadges from './ConstellationBadges';
import { parseNavFile } from '../util/nav';
import type { NavResult } from '../util/nav';
import type { AllPositionsData } from '../util/orbit';
import { computeAllPositions, navTimesFromEph } from '../util/orbit';
import CopyableInput from './CopyableInput';

const RinexCharts = lazy(() => import('./RinexCharts'));
const SkyPlotCharts = lazy(() => import('./SkyPlot'));
const RinexHeaderEditor = lazy(() => import('./RinexHeaderEditor'));
const MultipathCharts = lazy(() => import('./MultipathCharts'));
const CycleSlipCharts = lazy(() => import('./CycleSlipCharts'));
const CompletenessCharts = lazy(() => import('./CompletenessCharts'));

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
  if (/\.\d{2}[nglp]$/i.test(lower)) return true;
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
  if (/OBSERVATION DATA|COMPACT RINEX/i.test(text)) return 'obs';
  return 'unknown';
}

async function readFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.gz')) {
    const ds = new DecompressionStream('gzip');
    const decompressed = file.stream().pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const decoder = new TextDecoder();
    return chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  }
  return file.text();
}

const OBS_ACCEPT = ".obs,.rnx,.crx,.gz,.Z,.26o,.25o,.24o,.23o,.22o,.21o,.20o,.19o,.18o,.17o,.16o,.15o,.14o,.13o,.12o,.11o,.10o,.09o,.08o,.07o,.06o,.05o,.04o,.03o,.02o,.01o,.00o,.26d,.25d,.24d,.23d,.22d,.21d,.20d,.19d,.18d,.17d,.16d,.15d,.14d,.13d,.12d,.11d,.10d,.09d,.08d,.07d,.06d,.05d,.04d,.03d,.02d,.01d,.00d";
const NAV_ACCEPT = ".rnx,.nav,.nnav,.gnav,.gz,.26n,.25n,.24n,.23n,.22n,.21n,.20n,.19n,.18n,.17n,.16n,.15n,.14n,.13n,.12n,.11n,.10n,.09n,.08n,.07n,.06n,.05n,.04n,.03n,.02n,.01n,.00n";

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
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

/* ─── Compact file slot (for loaded state bar) ────────────────────── */

function MiniFileSlot({
  label,
  hint,
  fileName,
  loading,
  loadingText,
  progress,
  fileSize,
  loaded,
  accept,
  onFile,
  onClear,
}: {
  label: string;
  hint: string;
  fileName: string | null;
  loading: boolean;
  loadingText?: string;
  progress?: number;
  fileSize?: number;
  loaded: boolean;
  accept: string;
  onFile: (file: File) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  if (loading) {
    return (
      <div className="flex-1 rounded-md border border-border/40 bg-bg-raised/30 px-2 py-1.5 flex items-center gap-2 min-w-0">
        <SpinnerIcon className="size-3 animate-spin text-accent shrink-0" />
        <span className="text-[10px] text-fg/50 truncate">
          {progress != null ? `${progress}%` : (loadingText ?? 'Parsing…')}
        </span>
        {progress != null && (
          <div className="w-12 h-0.5 bg-border/40 rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (loaded && fileName) {
    return (
      <div className="flex-1 rounded-md border border-green-500/15 bg-green-500/5 px-2 py-1.5 flex items-center gap-1.5 min-w-0">
        <CheckIcon className="size-3 text-green-400 shrink-0" />
        <span className="text-[10px] text-fg/50 truncate" title={fileName}>{fileName}</span>
        {onClear && (
          <button
            type="button"
            className="ml-auto text-fg/15 hover:text-fg/40 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex-1 rounded-md border border-dashed px-2 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors min-w-0 ${
        dragging ? 'border-accent bg-accent/10' : 'border-border/30 hover:border-fg/20'
      }`}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      <UploadIcon className="size-3 text-fg/25 shrink-0" />
      <span className="text-[10px] text-fg/35 truncate">{label} ({hint})</span>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
    </div>
  );
}

/* ─── Upload drop zone (initial state) ────────────────────────────── */

function UploadDropZone({
  isDragging,
  loading,
  fileName,
  progress,
  fileSize,
  onDrop,
  onDragOver,
  onDragLeave,
  onFile,
}: {
  isDragging: boolean;
  loading: boolean;
  fileName: string | null;
  progress: number;
  fileSize: number;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        onFile(files[i]!);
      }
    }
  }, [onFile]);

  // Show loading state
  if (loading) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-12">
        <SpinnerIcon className="size-6 animate-spin text-accent" />
        <div className="text-center">
          <p className="text-sm text-fg/60 mb-0.5">
            Parsing{fileName ? ` ${fileName}` : ''}…
            {progress > 0 && ` ${progress}%`}
          </p>
          {fileSize > 0 && <p className="text-[10px] text-fg/25 mb-0">{formatFileSize(fileSize)}</p>}
        </div>
        {progress > 0 && (
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
        <p className="text-sm text-fg/50 mb-0.5">Drop RINEX files here or click to browse</p>
        <p className="text-[10px] text-fg/20 mb-0">
          Observation (.obs .rnx .YYo) + optional Navigation (.nav .YYn)
        </p>
      </div>
      <p className="text-[10px] text-fg/15 mb-0">RINEX 2/3/4 &middot; Hatanaka CRX &middot; gzip</p>
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
        <span className="text-sm font-semibold text-white/90">Navigation Summary</span>
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

/* ─── Main component ──────────────────────────────────────────────── */

export default function RinexReaderPage() {
  const [result, setResult] = useState<RinexResult | null>(null);
  const [navResult, setNavResult] = useState<NavResult | null>(null);
  const [allPositions, setAllPositions] = useState<AllPositionsData | null>(null);
  const [observedPrns, setObservedPrns] = useState<Set<string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [obsFile, setObsFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [navFileName, setNavFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [computing, setComputing] = useState(false);

  const [qaResult, setQaResult] = useState<QualityResult | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaProgress, setQaProgress] = useState(0);

  const runQualityAnalysis = useCallback(async (file: File, header: RinexResult['header']) => {
    setQaLoading(true);
    setQaProgress(0);
    setQaResult(null);
    try {
      const qa = await analyzeQuality(file, header, setQaProgress);
      setQaResult(qa);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Quality analysis failed.');
    } finally {
      setQaLoading(false);
    }
  }, []);

  const processObsFile = useCallback(async (file: File) => {
    setError(null);
    setObsFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setLoading(true);
    setProgress(0);
    setResult(null);
    setAllPositions(null); setObservedPrns(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const r = await parseRinexStream(file, setProgress, controller.signal);
      if (r.epochs.length === 0) {
        setError('No valid observation epochs found in the file.');
        setResult(null);
      } else {
        setResult(r);
        runQualityAnalysis(file, r.header);
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to parse RINEX file.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [runQualityAnalysis]);

  const processNavFile = useCallback(async (file: File) => {
    setError(null);
    setNavLoading(true);
    setNavFileName(file.name);
    setAllPositions(null); setObservedPrns(null);
    try {
      const text = await readFileText(file);
      const nav = parseNavFile(text);
      if (nav.ephemerides.length === 0) {
        setError('No navigation ephemerides found. Is this a navigation file?');
        setNavResult(null);
        setNavFileName(null);
        return;
      }
      setNavResult(nav);
      setComputing(true);
      await new Promise(r => requestAnimationFrame(r));
      const times = navTimesFromEph(nav.ephemerides);
      const positions = computeAllPositions(nav.ephemerides, times);
      setAllPositions(positions);
      setObservedPrns(null);
      setComputing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse navigation file.');
      setNavResult(null);
      setNavFileName(null);
    } finally {
      setNavLoading(false);
      setComputing(false);
    }
  }, []);

  useEffect(() => {
    if (!navResult || !result) return;
    const rxPos = result.header.approxPosition ?? undefined;
    const maxEpochs = 500;
    const step = Math.max(1, Math.ceil(result.epochs.length / maxEpochs));
    const times: number[] = [];
    const obsPrns: Set<string>[] = [];
    for (let i = 0; i < result.epochs.length; i += step) {
      const e = result.epochs[i]!;
      times.push(e.time);
      obsPrns.push(new Set(Object.keys(e.snrPerSat)));
    }

    let cancelled = false;
    setComputing(true);
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      const positions = computeAllPositions(
        navResult.ephemerides, times,
        rxPos && (rxPos[0] !== 0 || rxPos[1] !== 0 || rxPos[2] !== 0) ? rxPos : undefined,
      );
      if (!cancelled) {
        setAllPositions(positions);
        setObservedPrns(obsPrns);
        setComputing(false);
      }
    });
    return () => { cancelled = true; cancelAnimationFrame(id); };
  }, [result, navResult]);

  const routeFile = useCallback(async (file: File) => {
    if (isNavFileName(file.name)) { processNavFile(file); return; }
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.rnx') || lower.endsWith('.rnx.gz') || lower.endsWith('.gz')) {
      const type = await sniffFileType(file);
      if (type === 'nav') { processNavFile(file); return; }
    }
    processObsFile(file);
  }, [processObsFile, processNavFile]);

  const handleGlobalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) { routeFile(files[0]!); return; }
    let obsFile: File | null = null;
    let navFile: File | null = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (isNavFileName(f.name)) { navFile = f; continue; }
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.rnx') || lower.endsWith('.rnx.gz') || lower.endsWith('.gz')) {
        const type = await sniffFileType(f);
        if (type === 'nav') { navFile = f; } else { obsFile = f; }
      } else { obsFile = f; }
    }
    if (obsFile) processObsFile(obsFile);
    if (navFile) processNavFile(navFile);
  }, [routeFile, processObsFile, processNavFile]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setResult(null); setNavResult(null);
    setAllPositions(null); setObservedPrns(null);
    setError(null); setObsFile(null);
    setFileName(null); setNavFileName(null);
    setFileSize(0); setProgress(0);
    setQaResult(null); setQaLoading(false); setQaProgress(0);
  }, []);

  const { header, stats } = result ?? {};

  /* ─── Initial upload state ──────────────────────────────────── */
  if (!result && !loading) {
    return (
      <section className="flex flex-col gap-4">
        <UploadDropZone
          isDragging={isDragging}
          loading={loading}
          fileName={fileName}
          progress={progress}
          fileSize={fileSize}
          onDrop={handleGlobalDrop}
          onDragOver={handleGlobalDragOver}
          onDragLeave={() => setIsDragging(false)}
          onFile={routeFile}
        />

        {error && (
          <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}

        {navResult && <NavSummary navResult={navResult} />}

        {allPositions && (
          <Suspense fallback={
            <div className="rounded-xl border border-border/40 bg-bg-raised/60 p-4">
              <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
              <div className="flex items-center justify-center" style={{ height: 360 }}>
                <SpinnerIcon className="size-5 animate-spin text-fg/20" />
              </div>
            </div>
          }>
            <SkyPlotCharts allPositions={allPositions} />
          </Suspense>
        )}
      </section>
    );
  }

  /* ─── Loaded / loading state ────────────────────────────────── */
  return (
    <section className="flex flex-col gap-4">
      {/* ── Compact summary strip ────────────────────────────── */}
      <div
        className="rounded-xl bg-bg-raised/60 border border-border/40 px-4 py-3"
        onDrop={handleGlobalDrop}
        onDragOver={handleGlobalDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        {/* Row 1: marker name + constellation badges + reset */}
        <div className="flex items-center gap-3 min-w-0">
          {result && header ? (
            <>
              <span className="text-sm font-semibold text-white/90 truncate shrink min-w-0" title={header.markerName || fileName || undefined}>
                {header.markerName || fileName}
              </span>
              <span className="text-[10px] text-fg/30 shrink-0">v{header.version.toFixed(0)}</span>
              <ConstellationBadges activeSystems={stats?.systems ?? []} />
            </>
          ) : (
            <div className="flex items-center gap-2">
              <SpinnerIcon className="size-3.5 animate-spin text-accent" />
              <span className="text-xs text-fg/50">
                Parsing{fileName ? ` ${fileName}` : ''}… {progress > 0 && `${progress}%`}
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
        {result && stats && (
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

        {/* Row 3: file slots for adding/replacing files */}
        <div className="flex gap-2 mt-2 pt-2 border-t border-border/20">
          <MiniFileSlot
            label="Observation"
            hint=".obs .rnx .YYo"
            fileName={fileName}
            loading={loading}
            progress={progress}
            fileSize={fileSize}
            loaded={!!result}
            accept={OBS_ACCEPT}
            onFile={processObsFile}
            onClear={() => { setResult(null); setAllPositions(null); setObservedPrns(null); setObsFile(null); setFileName(null); }}
          />
          <MiniFileSlot
            label="Navigation"
            hint=".nav .rnx .YYn"
            fileName={navFileName}
            loading={navLoading || computing}
            loadingText={computing ? 'Orbits…' : undefined}
            loaded={!!navResult && !computing}
            accept={NAV_ACCEPT}
            onFile={processNavFile}
            onClear={() => { setNavResult(null); setAllPositions(null); setObservedPrns(null); setNavFileName(null); }}
          />
        </div>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {result && header && stats && (
        <>
          {/* ── Charts (the main content — immediately visible) ── */}
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
            <RinexCharts epochs={result.epochs} systems={stats.systems} />
          </Suspense>

          {/* ── Signal quality analysis (multipath + cycle slips + completeness) ── */}
          {qaLoading && (
            <div className="rounded-xl bg-bg-raised/60 border border-border/40 p-4 flex items-center gap-3">
              <SpinnerIcon className="size-4 animate-spin text-accent shrink-0" />
              <span className="text-xs text-fg/50">Analyzing quality… {qaProgress > 0 && `${qaProgress}%`}</span>
              {qaProgress > 0 && (
                <div className="w-24 h-1 bg-border/40 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${qaProgress}%` }} />
                </div>
              )}
            </div>
          )}
          {qaResult && (
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
          )}

          {/* ── Sky Plot, Ground Tracks & DOP ──────────────────── */}
          {allPositions && (
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
              <SkyPlotCharts allPositions={allPositions} observedPrns={observedPrns} rxPos={result.header.approxPosition ?? undefined} epochs={result.epochs} />
            </Suspense>
          )}

          {/* ── Header details + editor (below charts) ─────────── */}
          {obsFile && (
            <Suspense fallback={null}>
              <RinexHeaderEditor result={result} file={obsFile} readFileText={readFileText} />
            </Suspense>
          )}
        </>
      )}
    </section>
  );
}
