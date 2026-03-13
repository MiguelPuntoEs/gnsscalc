import { useState, useCallback } from 'react';
import type { FilterState } from '../util/rinex-client';
import type { ExportFormat, FilenameOptions } from '../util/rinex-client';

/** Parse RINEX 3/4 long filename components: SSSS00CCC_D_... */
function parseRinex3Filename(name: string): { station: string; monument: string; country: string; dataSource: string } | null {
  const base = name.replace(/\.(gz|zip|Z)$/i, '');
  const m = base.match(/^([A-Z0-9]{4})(\d{2})([A-Z]{3})_([A-Z])_/i);
  if (!m) return null;
  return { station: m[1]!, monument: m[2]!, country: m[3]!, dataSource: m[4]! };
}

interface ExportPanelProps {
  hasObs: boolean;
  hasNav: boolean;
  filters: FilterState;
  obsExporting: boolean;
  navExporting: boolean;
  markerName?: string;
  hasHeaderEdits?: boolean;
  /** First obs filename — used to derive RINEX 3/4 filename defaults */
  originalFilename?: string;
  startTime?: Date | null;
  durationSec?: number | null;
  intervalSec?: number | null;
  onExportObs: (format: ExportFormat, splitInterval: number | null, filename?: FilenameOptions) => void;
  onExportNav: (filename?: FilenameOptions) => void;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; desc: string }[] = [
  { value: 'rinex3', label: 'RINEX 3.04', desc: 'Standard observation file' },
  { value: 'rinex4', label: 'RINEX 4.01', desc: 'Latest RINEX version' },
  { value: 'rinex2', label: 'RINEX 2.11', desc: 'Legacy format (GPS+GLO only)' },
  { value: 'csv', label: 'CSV', desc: 'Tabular observation data' },
  { value: 'json-meta', label: 'JSON Metadata', desc: 'Header + statistics' },
];

const SPLIT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No split' },
  { value: '3600', label: 'Hourly' },
  { value: '7200', label: '2 hours' },
  { value: '21600', label: '6 hours' },
  { value: '43200', label: '12 hours' },
  { value: '86400', label: 'Daily' },
];

const DATA_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'R', label: 'R — Receiver' },
  { value: 'S', label: 'S — Stream' },
  { value: 'U', label: 'U — Unknown' },
];

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.06-7.672a.75.75 0 00-1.5 0v2.033l-.312-.312A7 7 0 002.849 8.612a.75.75 0 001.449.388 5.5 5.5 0 019.201-2.467l.312.311H11.38a.75.75 0 100 1.5h3.634a.75.75 0 00.75-.75V3.96l-.001-.003v-.206z" clipRule="evenodd" />
    </svg>
  );
}

const inputClass = 'w-full mt-0.5 bg-bg/60 border border-border/30 rounded px-2 py-1 text-[11px] text-fg/70 focus:border-accent/50 outline-none placeholder:text-fg/20';

export default function ExportPanel({
  hasObs, hasNav, filters, obsExporting, navExporting, markerName, hasHeaderEdits,
  originalFilename, startTime, durationSec, intervalSec,
  onExportObs, onExportNav,
}: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('rinex3');
  const [splitInterval, setSplitInterval] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  // Derive defaults from original RINEX 3/4 filename
  const fnDefaults = originalFilename ? parseRinex3Filename(originalFilename) : null;

  // Filename fields — empty = use defaults from original filename / header
  const [station, setStation] = useState('');
  const [monument, setMonument] = useState('');
  const [country, setCountry] = useState('');
  const [dataSource, setDataSource] = useState('');

  const hasFilters = filters.excludedSystems.length > 0
    || filters.excludedPrns.length > 0
    || filters.excludedSignalTypes.length > 0
    || filters.excludedBands.length > 0
    || Object.keys(filters.excludedSignalsPerSystem).length > 0
    || filters.timeStart != null
    || filters.timeEnd != null
    || filters.samplingInterval != null
    || filters.sparseThreshold > 0;

  const buildFilenameOpts = useCallback((): FilenameOptions | undefined => {
    const s = station || fnDefaults?.station;
    const m = monument || fnDefaults?.monument;
    const c = country || fnDefaults?.country;
    const d = dataSource || fnDefaults?.dataSource;
    if (!s && !m && !c && !d) return undefined;
    return {
      ...(s ? { station: s } : {}),
      ...(m ? { monument: m } : {}),
      ...(c ? { country: c } : {}),
      ...(d ? { dataSource: d } : {}),
    };
  }, [station, monument, country, dataSource, fnDefaults]);

  const handleExport = useCallback(() => {
    onExportObs(format, splitInterval ? Number(splitInterval) : null, buildFilenameOpts());
  }, [onExportObs, format, splitInterval, buildFilenameOpts]);

  const handleExportNav = useCallback(() => {
    onExportNav(buildFilenameOpts());
  }, [onExportNav, buildFilenameOpts]);

  // Preview the filename pattern
  const stnPreview = (station || fnDefaults?.station || markerName || 'XXXX').replace(/\s+/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const monPreview = (monument || fnDefaults?.monument || '00').slice(0, 2).padStart(2, '0');
  const cccPreview = (country || fnDefaults?.country || 'XXX').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const srcPreview = (dataSource || fnDefaults?.dataSource || 'R').toUpperCase().slice(0, 1);
  const isLegacy = format === 'rinex2';

  // Build time/duration/interval parts matching actual export logic
  let yyyydddhhmm = '00000000000';
  if (startTime) {
    const y = startTime.getUTCFullYear();
    const doy = Math.floor((startTime.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const hh = String(startTime.getUTCHours()).padStart(2, '0');
    const mm = String(startTime.getUTCMinutes()).padStart(2, '0');
    yyyydddhhmm = `${y}${String(doy).padStart(3, '0')}${hh}${mm}`;
  }
  let perPreview = '00U';
  if (durationSec != null && durationSec > 0) {
    const intSec = intervalSec ?? 1;
    const span = durationSec + intSec;
    const days = Math.floor(span / 86400);
    const hours = Math.floor(span / 3600);
    const mins = Math.floor(span / 60);
    if (days >= 1) perPreview = `${String(days).padStart(2, '0')}D`;
    else if (hours >= 1) perPreview = `${String(hours).padStart(2, '0')}H`;
    else perPreview = `${String(Math.max(1, mins)).padStart(2, '0')}M`;
  }
  let intPreview = '';
  if (intervalSec != null && intervalSec > 0) {
    if (intervalSec < 60) intPreview = `_${String(Math.round(intervalSec)).padStart(2, '0')}S`;
    else intPreview = `_${String(Math.round(intervalSec / 60)).padStart(2, '0')}M`;
  }

  let fnamePreview: string;
  if (isLegacy) {
    let ddd = '001', h = '0', yy = '00';
    if (startTime) {
      const y = startTime.getUTCFullYear();
      const doy = Math.floor((startTime.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
      ddd = String(doy).padStart(3, '0');
      h = String.fromCharCode(97 + startTime.getUTCHours());
      yy = String(y % 100).padStart(2, '0');
    }
    fnamePreview = `${stnPreview}${ddd}${h}.${yy}o.gz`;
  } else {
    fnamePreview = `${stnPreview}${monPreview}${cccPreview}_${srcPreview}_${yyyydddhhmm}_${perPreview}${intPreview}_MO.rnx.gz`;
  }

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/20">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Quick export button */}
        {hasObs && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] text-accent/70 hover:text-accent px-2.5 py-1 rounded-md border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-50"
            onClick={handleExport}
            disabled={obsExporting}
          >
            {obsExporting
              ? <><SpinnerIcon className="size-3 animate-spin" /> Exporting…</>
              : <><DownloadIcon className="size-3" /> Export obs</>}
            {(hasFilters || hasHeaderEdits) && (
              <span className="text-[9px] text-accent/50">
                ({[hasFilters && 'filtered', hasHeaderEdits && 'edited'].filter(Boolean).join(' + ')})
              </span>
            )}
          </button>
        )}

        {hasNav && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[11px] text-accent/70 hover:text-accent px-2.5 py-1 rounded-md border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-50"
            onClick={handleExportNav}
            disabled={navExporting}
          >
            {navExporting
              ? <><SpinnerIcon className="size-3 animate-spin" /> Exporting…</>
              : <><DownloadIcon className="size-3" /> Export nav</>}
          </button>
        )}

        {hasObs && (
          <button
            type="button"
            className="text-[10px] text-fg/25 hover:text-fg/50 transition-colors ml-auto"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Less options' : 'More options'}
          </button>
        )}
      </div>

      {/* Expanded options */}
      {expanded && hasObs && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-fg/30 uppercase tracking-wider">Format</label>
              <select
                className={inputClass}
                value={format}
                onChange={e => setFormat(e.target.value as ExportFormat)}
              >
                {FORMAT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="text-[9px] text-fg/20 mt-0.5">
                {FORMAT_OPTIONS.find(o => o.value === format)?.desc}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-fg/30 uppercase tracking-wider">File split</label>
              <select
                className={inputClass}
                value={splitInterval}
                onChange={e => setSplitInterval(e.target.value)}
              >
                {SPLIT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filename customization */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-fg/30 uppercase tracking-wider">Filename</span>
              <span className="text-[9px] text-fg/20 font-mono">{fnamePreview}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <div>
                <label className="text-[9px] text-fg/25">Station (4)</label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder={fnDefaults?.station || markerName?.slice(0, 4) || 'XXXX'}
                  value={station}
                  onChange={e => setStation(e.target.value)}
                  className={inputClass + ' uppercase'}
                />
              </div>
              {!isLegacy && (
                <>
                  <div>
                    <label className="text-[9px] text-fg/25">Monument</label>
                    <input
                      type="text"
                      maxLength={2}
                      placeholder={fnDefaults?.monument || '00'}
                      value={monument}
                      onChange={e => setMonument(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-fg/25">Country (3)</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder={fnDefaults?.country || 'XXX'}
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className={inputClass + ' uppercase'}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-fg/25">Source</label>
                    <select
                      value={dataSource}
                      onChange={e => setDataSource(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Default ({fnDefaults?.dataSource || 'R'})</option>
                      {DATA_SOURCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
