import { lazy, Suspense, useState, useCallback, useRef } from 'react';
import { parseRinexStream } from '../util/rinex';
import type { RinexResult } from '../util/rinex';
import { systemName } from '../util/rinex';
import CopyableInput from './CopyableInput';

const RinexCharts = lazy(() => import('./RinexCharts'));

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

export default function RinexReaderPage() {
  const [result, setResult] = useState<RinexResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setFileSize(file.size);
    setLoading(true);
    setProgress(0);
    setResult(null);

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

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
    setFileName(null);
    setFileSize(0);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const { header, stats } = result ?? {};

  return (
    <section className="flex flex-col gap-4">
      {/* Upload area */}
      {result ? (
        <div
          className={`card flex items-center gap-3 px-4 py-2.5 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/10' : ''
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-fg/40 shrink-0"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm text-fg/60">
            Drop another file or <span className="text-accent font-medium">browse</span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".obs,.rnx,.crx,.gz,.Z,.24o,.23o,.22o,.21o,.20o,.19o,.18o,.17o,.16o,.15o,.14o,.13o,.12o,.11o,.10o,.09o,.08o,.07o,.06o,.05o,.04o,.03o,.02o,.01o,.00o,.24d,.23d,.22d,.21d,.20d,.19d,.18d,.17d,.16d,.15d,.14d,.13d,.12d,.11d,.10d,.09d,.08d,.07d,.06d,.05d,.04d,.03d,.02d,.01d,.00d"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div
          className={`card flex flex-col items-center justify-center gap-3 py-10 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/10' : ''
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8 text-fg/40"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm text-fg/60 mb-0">
            Drop a RINEX observation file here or <span className="text-accent font-medium">browse</span>
          </p>
          <p className="text-xs text-fg/40 mb-0">.obs, .rnx, .crx, .YYo, .YYd, .gz, .Z</p>
          <input
            ref={inputRef}
            type="file"
            accept=".obs,.rnx,.crx,.gz,.Z,.24o,.23o,.22o,.21o,.20o,.19o,.18o,.17o,.16o,.15o,.14o,.13o,.12o,.11o,.10o,.09o,.08o,.07o,.06o,.05o,.04o,.03o,.02o,.01o,.00o,.24d,.23d,.22d,.21d,.20d,.19d,.18d,.17d,.16d,.15d,.14d,.13d,.12d,.11d,.10d,.09d,.08d,.07d,.06d,.05d,.04d,.03d,.02d,.01d,.00d"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {loading && (
        <div className="card flex flex-col items-center gap-3 py-4">
          <div className="flex items-center gap-2">
            <svg className="size-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-fg/60">
              Parsing RINEX file… {progress}%
            </span>
          </div>
          <div className="w-full max-w-xs h-1.5 bg-border/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {fileSize > 0 && (
            <span className="text-xs text-fg/30">{formatFileSize(fileSize)}</span>
          )}
        </div>
      )}

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && header && stats && (
        <>
          {/* Statistics */}
          <div className="card-output">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-white/90">Observation Summary</span>
                {fileName && (
                  <span className="text-xs text-fg/40 truncate max-w-[200px]" title={fileName}>
                    {fileName}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5 shrink-0"
                onClick={handleReset}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3">
                  <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                </svg>
                New file
              </button>
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
              <CopyableInput value={stats.systems.map(s => `${systemName(s)} (${s})`).join(', ')} />

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

              {header.obsTypes && Object.keys(header.obsTypes).length > 0 && (
                <>
                  <div className="section-divider" />
                  <div className="section-label">Observation types</div>
                  {Object.entries(header.obsTypes)
                    .filter(([sys]) => sys !== '_v2')
                    .map(([sys, codes]) => (
                      <div key={sys} className="contents">
                        <label>{systemName(sys)}</label>
                        <CopyableInput value={codes.join(' ')} />
                      </div>
                    ))}
                  {header.obsTypes['_v2'] && (
                    <>
                      <label>All systems</label>
                      <CopyableInput value={header.obsTypes['_v2'].join(' ')} />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Charts */}
          <Suspense
            fallback={
              <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border/40 bg-bg-raised/60 p-4"
                  >
                    <div className="h-3 w-40 rounded bg-fg/5 mb-3" />
                    <div className="flex items-center justify-center" style={{ height: 180 }}>
                      <svg className="size-5 animate-spin text-fg/20" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            }
          >
            <RinexCharts epochs={result.epochs} systems={stats.systems} />
          </Suspense>
        </>
      )}
    </section>
  );
}
