import { useState, useCallback, useRef, useMemo } from 'react';
import { parseAntex, frequencyLabel } from 'gnss-js/antex';
import type { AntexFile, AntennaEntry } from 'gnss-js/antex';
import { SYSTEM_COLORS } from '../util/gnss-constants';
import CopyableInput from './CopyableInput';
import { PcvPolarPlot, PcvSurfacePlot } from './PcvPlots';

/* ─── Icons ────────────────────────────────────────────────────── */

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function AntennaIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 7L9 3 5 7l4 4" />
      <path d="M11 13l4 4 4-4-4-4" />
      <path d="m8 16 2.586-2.586a2 2 0 0 0 0-2.828L8 8" />
      <path d="M3 21c0-4.4 3.6-8 8-8" />
    </svg>
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
            {antenna.isSatellite ? (
              <SatelliteIcon className="size-3.5 text-fg/40" />
            ) : (
              <AntennaIcon className="size-3.5 text-fg/40" />
            )}
            <span className="text-sm font-semibold text-fg">
              {antenna.type}
            </span>
          </div>
          <div className="card-fields">
            {antenna.serialNo && (
              <>
                <span>{antenna.isSatellite ? 'PRN' : 'Serial No'}</span>
                <CopyableInput value={antenna.serialNo} />
              </>
            )}

            {antenna.svnCode && (
              <>
                <span>SVN</span>
                <CopyableInput value={antenna.svnCode} />
              </>
            )}

            {antenna.cosparId && (
              <>
                <span>COSPAR ID</span>
                <CopyableInput value={antenna.cosparId} />
              </>
            )}

            {antenna.method && (
              <>
                <span>Calibration</span>
                <CopyableInput
                  value={`${antenna.method}${antenna.agency ? ` — ${antenna.agency}` : ''}`}
                />
              </>
            )}

            {antenna.numCalibrated > 0 && (
              <>
                <span># calibrated</span>
                <CopyableInput value={String(antenna.numCalibrated)} />
              </>
            )}

            {antenna.date && (
              <>
                <span>Date</span>
                <CopyableInput value={antenna.date} />
              </>
            )}

            {antenna.sinexCode && (
              <>
                <span>SINEX code</span>
                <CopyableInput value={antenna.sinexCode} />
              </>
            )}

            {antenna.validFrom && (
              <>
                <span>Valid from</span>
                <CopyableInput value={antenna.validFrom} />
              </>
            )}

            {antenna.validUntil && (
              <>
                <span>Valid until</span>
                <CopyableInput value={antenna.validUntil} />
              </>
            )}

            <span>Zenith grid</span>
            <CopyableInput
              value={`${antenna.zen1}° – ${antenna.zen2}° (Δ${antenna.dzen}°)`}
            />

            <span>Azimuth</span>
            <CopyableInput
              value={
                antenna.dazi > 0
                  ? `0° – 360° (Δ${antenna.dazi}°)`
                  : 'None (azimuth-independent)'
              }
            />
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
                  <th className="text-right py-1.5 px-2 font-medium">
                    {antenna.isSatellite ? 'X' : 'North'}
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    {antenna.isSatellite ? 'Y' : 'East'}
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium">
                    {antenna.isSatellite ? 'Z' : 'Up'}
                  </th>
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
                      <td className="py-1.5 pr-3" style={{ color }}>
                        {f.frequency}
                      </td>
                      <td className="py-1.5 pr-3 text-fg/50">
                        {frequencyLabel(f.frequency)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-fg/70">
                        {f.pcoN.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-fg/70">
                        {f.pcoE.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-fg/70">
                        {f.pcoU.toFixed(2)}
                      </td>
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
              Phase Center Variations — {freq.frequency} (
              {frequencyLabel(freq.frequency)})
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
      .filter(
        ({ antenna }) =>
          antenna.type.toLowerCase().includes(q) ||
          antenna.serialNo.toLowerCase().includes(q) ||
          antenna.svnCode.toLowerCase().includes(q),
      );
  }, [antennas, filter]);

  return (
    <>
      {filtered.length === 0 && (
        <div className="p-4 text-sm text-fg/30 text-center">
          No antennas match the filter.
        </div>
      )}
      {filtered.map(({ antenna, idx }) => {
        const sysChar = antenna.isSatellite ? antenna.serialNo.charAt(0) : '';
        const color = sysChar
          ? (SYSTEM_COLORS[sysChar] ?? '#7c8aff')
          : undefined;
        return (
          <button
            key={idx}
            type="button"
            data-idx={idx}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-border/10 transition-colors ${
              idx === selectedIdx
                ? 'bg-accent/10 border-l-2 border-l-accent'
                : 'hover:bg-fg/5'
            }`}
            onClick={() => onSelect(idx)}
          >
            {antenna.isSatellite ? (
              <SatelliteIcon className="size-3.5 text-fg/30 shrink-0" />
            ) : (
              <AntennaIcon className="size-3.5 text-fg/30 shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-fg/80 truncate font-medium">
                {antenna.type}
              </span>
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

  const processFile = useCallback(
    async (file: File) => {
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
    },
    [processText],
  );

  const loadSample = useCallback(
    async (file: string, label: string) => {
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
    },
    [processText],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

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
    const rcv = antexFile.antennas.filter((a) => !a.isSatellite);
    const sat = antexFile.antennas.filter((a) => a.isSatellite);
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
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`card flex flex-col items-center justify-center gap-4 py-10 border-dashed cursor-pointer transition-colors ${
            isDragging ? 'border-accent bg-accent/10' : ''
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadIcon className="size-8 text-fg/30" />
          <div className="text-center">
            <p className="text-sm text-fg/60 mb-1">Drop your ANTEX file here</p>
            <p className="text-xs text-fg/30 mb-0">
              .atx antenna calibration file
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".atx,.ATX"
            onChange={handleChange}
            className="hidden"
          />
          <p className="text-[10px] text-fg/20 mb-0">
            Supports ANTEX 1.4 — receiver and satellite antennas
          </p>
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
              onClick={() =>
                void loadSample(file!, `igs20.atx — ${label!.split(' (')[0]}`)
              }
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">
            {error}
          </div>
        )}
      </section>
    );
  }

  /* ─── Loading ────────────────────────────────────────────────── */
  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="card flex items-center justify-center gap-3 py-8">
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
          <span className="text-sm text-fg/50">
            {loadingText} {fileName}
          </span>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-3.5 text-green-400 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs text-fg/60 truncate" title={fileName ?? ''}>
            {fileName}
          </span>
          <span className="text-[10px] text-fg/30">
            ANTEX {antexFile!.version.toFixed(1)} ·{' '}
            {antexFile!.pcvType === 'A' ? 'Absolute' : 'Relative'}
          </span>
          {stats && (
            <span className="text-[10px] text-fg/30">
              · {stats.total} antennas ({stats.receivers} rcv,{' '}
              {stats.satellites} sat)
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-3"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
          Reset
        </button>
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Antenna selector */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter antennas…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const filtered = antexFile!.antennas
                .map((a, i) => ({ a, i }))
                .filter(({ a }) => {
                  if (!filter) return true;
                  const q = filter.toLowerCase();
                  return (
                    a.type.toLowerCase().includes(q) ||
                    a.serialNo.toLowerCase().includes(q) ||
                    a.svnCode.toLowerCase().includes(q)
                  );
                });
              if (filtered.length === 0) return;
              const curPos = filtered.findIndex((f) => f.i === selectedIdx);
              const next =
                e.key === 'ArrowDown'
                  ? (curPos + 1) % filtered.length
                  : (curPos - 1 + filtered.length) % filtered.length;
              const newIdx = filtered[next]!.i;
              setSelectedIdx(newIdx);
              listRef.current
                ?.querySelector(`[data-idx="${newIdx}"]`)
                ?.scrollIntoView({ block: 'nearest' });
            }
          }}
          className="flex-1 rounded-lg border border-border/40 bg-bg-raised/30 px-3 py-1.5 text-xs text-fg/80 placeholder:text-fg/25 focus:outline-none focus:border-accent/50"
        />
        <span className="text-[10px] text-fg/30 shrink-0">
          {selectedIdx + 1} / {antexFile!.antennas.length}
        </span>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto max-h-[200px] border border-border/30 rounded-lg"
      >
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
