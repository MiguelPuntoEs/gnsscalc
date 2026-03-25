import { lazy, Suspense, useState, useCallback, useRef } from 'react';
import { parseNmeaFile } from 'gnss-js/nmea';
import type { NmeaTrack, NmeaFix } from 'gnss-js/nmea';
import CopyableInput from './CopyableInput';

const NmeaTrackMap = lazy(() => import('./NmeaTrackMap'));
const NmeaCharts = lazy(() => import('./NmeaCharts'));

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTime(d: Date): string {
  // If year is 2000, this is a GGA-only time with no date — show time only
  if (
    d.getUTCFullYear() === 2000 &&
    d.getUTCMonth() === 0 &&
    d.getUTCDate() === 1
  ) {
    return d.toISOString().substring(11).replace('Z', ' UTC');
  }
  return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function formatDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  return `${metres.toFixed(1)} m`;
}

function generateGpx(fixes: NmeaFix[], name: string): string {
  const pts = fixes
    .map((f) => {
      const timeAttr = f.time ? ` <time>${f.time.toISOString()}</time>` : '';
      const eleTag =
        f.alt !== null ? `\n        <ele>${f.alt.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${f.lat.toFixed(8)}" lon="${f.lon.toFixed(8)}">${eleTag}${timeAttr ? `\n       ${timeAttr}` : ''}
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="gnsscalc.com"
  xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadGpx(fixes: NmeaFix[], fileName: string) {
  const gpxName = fileName.replace(/\.[^.]+$/, '') || 'track';
  const gpx = generateGpx(fixes, gpxName);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${gpxName}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NmeaReaderPage() {
  const [track, setTrack] = useState<NmeaTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    setFileName(file.name);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const result = parseNmeaFile(content);
      if (result.fixes.length === 0) {
        setError('No valid GGA or RMC sentences found in the file.');
        setTrack(null);
      } else {
        setTrack(result);
      }
      setLoading(false);
    };
    reader.onerror = () => {
      setError('Failed to read file.');
      setTrack(null);
      setLoading(false);
    };
    reader.readAsText(file);
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
    setTrack(null);
    setError(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const { stats } = track ?? {};

  return (
    <section className="flex flex-col gap-4">
      {/* Upload area */}
      {track ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
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
            Drop another file or{' '}
            <span className="text-accent font-medium">browse</span>
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".nmea,.txt,.log,.ubx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
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
            Drop an NMEA log file here or{' '}
            <span className="text-accent font-medium">browse</span>
          </p>
          <p className="text-xs text-fg/40 mb-0">.nmea, .txt, .log</p>
          <input
            ref={inputRef}
            type="file"
            accept=".nmea,.txt,.log,.ubx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {loading && (
        <div className="card flex items-center justify-center gap-2 py-4">
          <svg
            className="size-4 animate-spin text-accent"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm text-fg/60">Parsing NMEA file…</span>
        </div>
      )}

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {track && stats && (
        <>
          {/* Statistics */}
          <div className="card-output">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-fg">
                  Track Statistics
                </span>
                {fileName && (
                  <span
                    className="text-xs text-fg/40 truncate max-w-[200px]"
                    title={fileName}
                  >
                    {fileName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => downloadGpx(track.fixes, fileName ?? 'track')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-3"
                  >
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  GPX
                </button>
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={handleReset}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-3"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                      clipRule="evenodd"
                    />
                    <path
                      fillRule="evenodd"
                      d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                  New file
                </button>
              </div>
            </div>
            <div className="card-fields">
              <span>Valid fixes</span>
              <CopyableInput
                value={`${stats.validFixes} / ${stats.totalFixes}`}
              />

              {stats.startTime && (
                <>
                  <span>Start</span>
                  <CopyableInput value={formatTime(stats.startTime)} />
                </>
              )}

              {stats.endTime &&
                stats.duration !== null &&
                stats.duration > 0 && (
                  <>
                    <span>End</span>
                    <CopyableInput value={formatTime(stats.endTime)} />
                    <span>Duration</span>
                    <CopyableInput value={formatDuration(stats.duration)} />
                  </>
                )}

              {stats.totalDistance !== null && (
                <>
                  <span>Distance</span>
                  <CopyableInput value={formatDistance(stats.totalDistance)} />
                </>
              )}

              {stats.maxSpeed !== null && (
                <>
                  <span>Max speed</span>
                  <CopyableInput value={`${stats.maxSpeed.toFixed(1)} km/h`} />
                </>
              )}

              {stats.avgSatellites !== null && (
                <>
                  <span>Avg satellites</span>
                  <CopyableInput value={stats.avgSatellites.toFixed(1)} />
                </>
              )}

              {stats.cep !== null && (
                <>
                  <div className="section-divider" />
                  <div className="section-label">Precision</div>
                  <span>CEP</span>
                  <CopyableInput
                    value={`${stats.cep.toFixed(3)} m`}
                    title="Circular Error Probable (50th percentile)"
                  />
                  <span>2DRMS</span>
                  <CopyableInput
                    value={`${stats.drms2!.toFixed(3)} m`}
                    title="2x horizontal RMS (~95th percentile)"
                  />
                  <span>Horizontal RMS</span>
                  <CopyableInput value={`${stats.hRms!.toFixed(3)} m`} />
                  <span>Vertical RMS</span>
                  <CopyableInput value={`${stats.vRms!.toFixed(3)} m`} />
                </>
              )}
            </div>
          </div>

          {/* Map */}
          <Suspense
            fallback={
              <div
                className="rounded-xl border border-border/60 bg-bg-raised animate-pulse"
                style={{ height: 420 }}
              />
            }
          >
            <NmeaTrackMap fixes={track.fixes} />
          </Suspense>

          {/* Charts */}
          <Suspense
            fallback={
              <div
                className="rounded-xl border border-border/60 bg-bg-raised animate-pulse"
                style={{ height: 200 }}
              />
            }
          >
            <NmeaCharts fixes={track.fixes} />
          </Suspense>
        </>
      )}
    </section>
  );
}
