import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { parseRinexStream } from '../util/rinex';
import type { RinexResult } from '../util/rinex';
import { systemName, systemCmp } from '../util/rinex';
import { SYS_SHORT, systemColor } from '../util/gnss-constants';
import ConstellationBadges from './ConstellationBadges';
import { parseNavFile } from '../util/nav';
import type { NavResult } from '../util/nav';
import type { AllPositionsData } from '../util/orbit';
import { computeAllPositions, navTimesFromEph } from '../util/orbit';
import CopyableInput from './CopyableInput';

const RinexCharts = lazy(() => import('./RinexCharts'));
const SkyPlotCharts = lazy(() => import('./SkyPlot'));

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

/** Check filename for unambiguous nav extensions. */
function isNavFileName(name: string): boolean {
  const lower = name.toLowerCase();
  // RINEX 3/4 nav: *_MN.rnx, *_GN.rnx, etc (unambiguous suffix before .rnx)
  if (/_[MGRECJI]N\.rnx(\.gz)?$/i.test(lower)) return true;
  // RINEX 2 nav: *.YYn, *.YYg, *.YYl, *.YYp
  if (/\.\d{2}[nglp]$/i.test(lower)) return true;
  // Explicit nav extensions
  if (lower.endsWith('.nav') || lower.endsWith('.nnav') || lower.endsWith('.gnav')) return true;
  return false;
}

/** Check file content header to determine type. Returns 'nav', 'obs', or 'unknown'. */
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

/* ─── File slot component ──────────────────────────────────────── */

function FileSlot({
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
      <div className="flex-1 rounded-lg border border-border/40 bg-bg-raised/30 px-3 py-3 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <SpinnerIcon className="size-3.5 animate-spin text-accent" />
          <span className="text-xs text-fg/50">
            {progress != null ? `Parsing… ${progress}%` : (loadingText ?? 'Parsing…')}
          </span>
        </div>
        {progress != null && (
          <div className="w-full max-w-[120px] h-1 bg-border/40 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
        {fileSize != null && fileSize > 0 && (
          <span className="text-[10px] text-fg/25">{formatFileSize(fileSize)}</span>
        )}
      </div>
    );
  }

  if (loaded && fileName) {
    return (
      <div className="flex-1 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2.5 flex items-center gap-2 min-w-0">
        <CheckIcon className="size-3.5 text-green-400 shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-fg/30 leading-none">{label}</span>
          <span className="text-xs text-fg/60 truncate" title={fileName}>{fileName}</span>
        </div>
        {onClear && (
          <button
            type="button"
            className="ml-auto text-fg/20 hover:text-fg/50 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            title={`Remove ${label.toLowerCase()}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex-1 rounded-lg border border-dashed px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${
        dragging ? 'border-accent bg-accent/10' : 'border-border/40 hover:border-fg/20'
      }`}
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      <UploadIcon className="size-3.5 text-fg/30 shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-xs text-fg/50">{label}</span>
        <span className="text-[10px] text-fg/25">{hint}</span>
      </div>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
    </div>
  );
}

/* ─── Observation type matrix ──────────────────────────────────── */

const OBS_TYPE_LABELS: Record<string, string> = {
  C: 'Pseudorange', L: 'Carrier phase', S: 'Signal strength', D: 'Doppler',
};

function ObsTypeMatrix({ obsTypes, systems }: { obsTypes: Record<string, string[]>; systems: string[] }) {
  // For RINEX v2, obsTypes has '_v2' key with codes shared by all systems
  const isV2 = !!obsTypes['_v2'];

  // Collect all systems and their code sets
  const sysList = isV2 ? systems : Object.keys(obsTypes).filter(s => s !== '_v2').sort(systemCmp);
  if (sysList.length === 0) return null;

  const codesBySys: Record<string, Set<string>> = {};
  for (const sys of sysList) {
    codesBySys[sys] = new Set(isV2 ? obsTypes['_v2'] : (obsTypes[sys] ?? []));
  }

  // Collect all unique codes, group by measurement type (first char)
  const allCodes = new Set<string>();
  for (const set of Object.values(codesBySys)) {
    for (const c of set) allCodes.add(c);
  }
  const grouped: Record<string, string[]> = {};
  for (const code of allCodes) {
    const type = code.charAt(0);
    if (!grouped[type]) grouped[type] = [];
    grouped[type]!.push(code);
  }
  // Sort groups by type order, codes within group alphabetically
  const typeOrder = ['C', 'L', 'D', 'S'];
  const sortedTypes = Object.keys(grouped).sort((a, b) => (typeOrder.indexOf(a) - typeOrder.indexOf(b)));
  for (const t of sortedTypes) grouped[t]!.sort();

  return (
    <div className="col-span-2 mt-1">
      <div className="section-divider" />
      <div className="section-label">Observation types</div>
      <div className="mt-2 overflow-x-auto">
        {sortedTypes.map(type => {
          const codes = grouped[type]!;
          return (
            <div key={type} className="mb-2.5 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-fg/30 mb-1">
                {OBS_TYPE_LABELS[type] ?? type}
              </div>
              <div className="grid gap-px" style={{
                gridTemplateColumns: `36px repeat(${codes.length}, minmax(28px, 1fr))`,
              }}>
                {/* Header row — code labels */}
                <div />
                {codes.map(code => (
                  <div key={code} className="text-center text-[9px] font-mono text-fg/30 pb-0.5">
                    {code}
                  </div>
                ))}
                {/* System rows */}
                {sysList.map(sys => {
                  const sysSet = codesBySys[sys]!;
                  const color = systemColor(sys);
                  return (
                    <div key={sys} className="contents">
                      <div className="text-[10px] font-medium h-5 flex items-center" style={{ color }}>
                        {SYS_SHORT[sys] ?? sys}
                      </div>
                      {codes.map(code => {
                        const has = sysSet.has(code);
                        return (
                          <div key={code} className="flex items-center justify-center h-5">
                            {has ? (
                              <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: color, opacity: 0.85 }}
                              />
                            ) : (
                              <span className="size-1.5 rounded-full bg-fg/6" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Nav-only summary ─────────────────────────────────────────── */

function NavSummary({ navResult }: { navResult: NavResult }) {
  const { header, ephemerides } = navResult;

  // Derive stats from ephemerides
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
      systems,
      satsBySystem,
      ephCountBySystem,
      totalSats,
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

        {stats.startTime && (
          <>
            <label>Start</label>
            <CopyableInput value={formatTime(stats.startTime)} />
          </>
        )}
        {stats.endTime && stats.duration !== null && stats.duration > 0 && (
          <>
            <label>End</label>
            <CopyableInput value={formatTime(stats.endTime)} />
            <label>Duration</label>
            <CopyableInput value={formatDuration(stats.duration)} />
          </>
        )}

        <div className="section-divider" />
        <div className="section-label">Satellites</div>

        <label>Ephemerides</label>
        <CopyableInput value={`${ephemerides.length} records`} />

        <label>Unique satellites</label>
        <CopyableInput value={String(stats.totalSats)} />

        {stats.systems.map(sys => (
          <div key={sys} className="contents">
            <label>{systemName(sys)}</label>
            <CopyableInput value={`${stats.satsBySystem[sys]!.size} SVs · ${stats.ephCountBySystem[sys]} eph`} />
          </div>
        ))}

        {header.leapSeconds != null && (
          <>
            <div className="section-divider" />
            <div className="section-label">Parameters</div>
            <label>Leap seconds</label>
            <CopyableInput value={`${header.leapSeconds} s`} />
          </>
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

/* ─── Main component ───────────────────────────────────────────── */

export default function RinexReaderPage() {
  const [result, setResult] = useState<RinexResult | null>(null);
  const [navResult, setNavResult] = useState<NavResult | null>(null);
  const [allPositions, setAllPositions] = useState<AllPositionsData | null>(null);
  /** Per-epoch observed PRN sets, aligned with allPositions.times (only when obs data available). */
  const [observedPrns, setObservedPrns] = useState<Set<string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [navFileName, setNavFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const processObsFile = useCallback(async (file: File) => {
    setError(null);
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
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to parse RINEX file.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);


  const [computing, setComputing] = useState(false);

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

      // Compute positions eagerly right after parsing
      setComputing(true);
      // Yield to let the UI update before heavy computation
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

  // Recompute positions when obs data arrives (adds obs times, rxPos, observed PRNs)
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
        navResult.ephemerides,
        times,
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

  // Route a file to the right parser based on name, then content sniffing
  const routeFile = useCallback(async (file: File) => {
    // Fast path: unambiguous filename
    if (isNavFileName(file.name)) { processNavFile(file); return; }
    // Ambiguous extensions (.rnx, .gz) — sniff content
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.rnx') || lower.endsWith('.rnx.gz') || lower.endsWith('.gz')) {
      const type = await sniffFileType(file);
      if (type === 'nav') { processNavFile(file); return; }
    }
    // Default to observation
    processObsFile(file);
  }, [processObsFile, processNavFile]);

  // Handle files from the global drop zone — classify all first to avoid races
  const handleGlobalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) { routeFile(files[0]!); return; }

    // Multiple files: classify all before dispatching
    let obsFile: File | null = null;
    let navFile: File | null = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (isNavFileName(f.name)) { navFile = f; continue; }
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.rnx') || lower.endsWith('.rnx.gz') || lower.endsWith('.gz')) {
        const type = await sniffFileType(f);
        if (type === 'nav') { navFile = f; } else { obsFile = f; }
      } else {
        obsFile = f;
      }
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
    setResult(null);
    setNavResult(null);
    setAllPositions(null); setObservedPrns(null);
    setError(null);
    setFileName(null);
    setNavFileName(null);
    setFileSize(0);
    setProgress(0);
  }, []);

  const { header, stats } = result ?? {};

  /* ─── No files loaded yet ──────────────────────────────────── */
  if (!result && !loading) {
    return (
      <section className="flex flex-col gap-4">
        <div
          className={`card flex flex-col items-center justify-center gap-4 py-10 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/10' : ''
          }`}
          onDrop={handleGlobalDrop}
          onDragOver={handleGlobalDragOver}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadIcon className="size-8 text-fg/30" />
          <div className="text-center">
            <p className="text-sm text-fg/60 mb-1">Drop your RINEX files here</p>
            <p className="text-xs text-fg/30 mb-0">Observation + Navigation for full analysis</p>
          </div>
          <div className="flex gap-3 w-full max-w-md">
            <FileSlot
              label="Observation"
              hint=".obs .rnx .crx .YYo"
              fileName={fileName}
              loading={loading}
              progress={progress}
              fileSize={fileSize}
              loaded={!!result}
              accept={OBS_ACCEPT}
              onFile={routeFile}
            />
            <FileSlot
              label="Navigation"
              hint=".nav .rnx .YYn"
              fileName={navFileName}
              loading={navLoading || computing}
              loadingText={computing ? 'Computing orbits…' : undefined}
              loaded={!!navResult && !computing}
              accept={NAV_ACCEPT}
              onFile={routeFile}
            />
          </div>
          <p className="text-[10px] text-fg/20 mb-0">Supports RINEX 2/3/4, Hatanaka CRX, gzip</p>
        </div>

        {error && (
          <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
        )}

        {/* Nav-only summary */}
        {navResult && <NavSummary navResult={navResult} />}

        {/* Nav-only ground track */}
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
            <SkyPlotCharts allPositions={allPositions} />
          </Suspense>
        )}
      </section>
    );
  }

  /* ─── Loading / loaded ─────────────────────────────────────── */
  return (
    <section className="flex flex-col gap-4">
      {/* File status bar */}
      <div
        className="card flex items-center gap-3 px-3 py-2"
        onDrop={handleGlobalDrop}
        onDragOver={handleGlobalDragOver}
        onDragLeave={() => setIsDragging(false)}
      >
        <div className="flex gap-2 flex-1 min-w-0">
          <FileSlot
            label="Observation"
            hint=".obs .rnx .crx .YYo"
            fileName={fileName}
            loading={loading}
            progress={progress}
            fileSize={fileSize}
            loaded={!!result}
            accept={OBS_ACCEPT}
            onFile={processObsFile}
            onClear={() => { setResult(null); setAllPositions(null); setObservedPrns(null); setFileName(null); }}
          />
          <FileSlot
            label="Navigation"
            hint=".nav .rnx .YYn"
            fileName={navFileName}
            loading={navLoading || computing}
            loadingText={computing ? 'Computing orbits…' : undefined}
            loaded={!!navResult && !computing}
            accept={NAV_ACCEPT}
            onFile={processNavFile}
            onClear={() => { setNavResult(null); setAllPositions(null); setObservedPrns(null); setNavFileName(null); }}
          />
        </div>
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5 shrink-0 text-xs"
          onClick={handleReset}
          title="Clear all files"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
          </svg>
          Reset
        </button>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>
      )}

      {result && header && stats && (
        <>
          {/* Statistics */}
          <div className="card-output">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white/90">Observation Summary</span>
            </div>
            <div className="card-fields">
              {header.markerName && (
                <>
                  <label>Marker</label>
                  <CopyableInput value={header.markerName} />
                </>
              )}

              <label>RINEX version</label>
              <CopyableInput value={header.version.toFixed(2)} />

              <label>Constellations</label>
              <ConstellationBadges activeSystems={stats.systems} />

              {stats.startTime && (
                <>
                  <label>Start</label>
                  <CopyableInput value={formatTime(stats.startTime)} />
                </>
              )}

              {stats.endTime && stats.duration !== null && stats.duration > 0 && (
                <>
                  <label>End</label>
                  <CopyableInput value={formatTime(stats.endTime)} />
                  <label>Duration</label>
                  <CopyableInput value={formatDuration(stats.duration)} />
                </>
              )}

              {stats.interval !== null && (
                <>
                  <label>Interval</label>
                  <CopyableInput value={`${stats.interval} s`} />
                </>
              )}

              <div className="section-divider" />
              <div className="section-label">Satellites</div>

              <label>Epochs</label>
              <CopyableInput value={stats.totalEpochs.toLocaleString()} />

              <label>Avg satellites</label>
              <CopyableInput value={stats.meanSatellites.toFixed(1)} />

              <label>Unique satellites</label>
              <CopyableInput value={String(stats.uniqueSatellites)} />

              {stats.systems.map(sys => (
                <div key={sys} className="contents">
                  <label>{systemName(sys)}</label>
                  <CopyableInput value={`${stats.uniqueSatsPerSystem[sys]} SVs`} />
                </div>
              ))}

              {stats.meanSnr !== null && (
                <>
                  <div className="section-divider" />
                  <div className="section-label">Signal quality</div>
                  <label>Mean C/N0</label>
                  <CopyableInput value={`${stats.meanSnr.toFixed(1)} dB-Hz`} />
                </>
              )}

              {navResult && (
                <>
                  <div className="section-divider" />
                  <div className="section-label">Navigation</div>
                  <label>Ephemerides</label>
                  <CopyableInput value={`${navResult.ephemerides.length} records`} />
                </>
              )}

              {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
                <ObsTypeMatrix obsTypes={header.obsTypes} systems={stats.systems} />
              )}
            </div>
          </div>

          {/* Observation Charts */}
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

          {/* Sky Plot, Ground Tracks & DOP Charts */}
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
              <SkyPlotCharts allPositions={allPositions} observedPrns={observedPrns} rxPos={result.header.approxPosition ?? undefined} />
            </Suspense>
          )}
        </>
      )}

    </section>
  );
}
