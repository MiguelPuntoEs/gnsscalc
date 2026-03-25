/**
 * Main-thread wrapper for the RINEX Web Worker.
 *
 * The worker is stateful: it accumulates obs + nav data incrementally
 * and auto-computes positions when both are available.
 */

import type {
  WorkerRequest,
  WorkerResponse,
  AddObsResult,
  AddNavResult,
  ApplyFiltersResult,
  RecomputePositionsResult,
  ObsExportResult,
  NavExportResult,
  HeaderOverrides,
} from './rinex.worker';
export type { HeaderOverrides } from './rinex.worker';
import type { FilterState } from './filter-state';
export type { FilterState } from './filter-state';
export { DEFAULT_FILTER } from './filter-state';
import type { RinexHeader, RinexStats } from 'gnss-js/rinex';
import type { NavResult } from 'gnss-js/rinex';
import type { QualityResult } from 'gnss-js/analysis';
import type { RinexWarnings } from 'gnss-js/rinex';
import type { AllPositionsData } from 'gnss-js/orbit';
import type { EpochGrid } from './epoch-grid';

/* ================================================================== */
/*  Singleton worker                                                   */
/* ================================================================== */

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./rinex.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

/* ================================================================== */
/*  Internal helpers                                                   */
/* ================================================================== */

let nextRequestId = 1;

function request<T extends WorkerResponse>(
  req: WorkerRequest,
  resultType: T['type'],
  onProgress?: (percent: number) => void,
): Promise<T> {
  const w = getWorker();
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if ('requestId' in msg && msg.requestId !== id) return; // not ours
      if (msg.type === 'progress') {
        onProgress?.(msg.percent);
      } else if (msg.type === resultType) {
        w.removeEventListener('message', handler);
        resolve(msg as T);
      } else if (msg.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(msg.message));
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ ...req, requestId: id });
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Build a RINEX 3 long filename: SSSS00CCC_R_YYYYDDDHHMM_PER_INT_TT.rnx */
export function rinex3Filename(
  marker: string,
  startTime: Date | null,
  durationSec: number | null,
  intervalSec: number | null,
  fileType: 'MO' | 'MN',
  fnOpts?: FilenameOptions,
): string {
  const stn = (fnOpts?.station || marker || 'XXXX')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  const monument = (fnOpts?.monument ?? '00').slice(0, 2).padStart(2, '0');
  const ccc = (fnOpts?.country ?? 'XXX')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const src = (fnOpts?.dataSource ?? 'R').toUpperCase().slice(0, 1);
  let yyyydddhhmm = '00000000000';
  if (startTime) {
    const y = startTime.getUTCFullYear();
    const doy =
      Math.floor((startTime.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
    const hh = String(startTime.getUTCHours()).padStart(2, '0');
    const mm = String(startTime.getUTCMinutes()).padStart(2, '0');
    yyyydddhhmm = `${y}${String(doy).padStart(3, '0')}${hh}${mm}`;
  }
  let per = '00U';
  if (durationSec != null && durationSec > 0) {
    const span = durationSec + (intervalSec ?? 1);
    const days = Math.floor(span / 86400);
    const hours = Math.floor(span / 3600);
    const mins = Math.floor(span / 60);
    if (days >= 1) per = `${String(days).padStart(2, '0')}D`;
    else if (hours >= 1) per = `${String(hours).padStart(2, '0')}H`;
    else per = `${String(Math.max(1, mins)).padStart(2, '0')}M`;
  }
  let intStr = '';
  if (fileType === 'MO' && intervalSec != null && intervalSec > 0) {
    if (intervalSec < 60)
      intStr = `_${String(Math.round(intervalSec)).padStart(2, '0')}S`;
    else intStr = `_${String(Math.round(intervalSec / 60)).padStart(2, '0')}M`;
  }
  return `${stn}${monument}${ccc}_${src}_${yyyydddhhmm}_${per}${intStr}_${fileType}.rnx`;
}

/** Build a RINEX 2 legacy filename: SSSSdddh.yyt */
function rinex2LegacyFilename(
  marker: string,
  startTime: Date | null,
  fileType: 'o' | 'n' | 'g',
  fnOpts?: FilenameOptions,
): string {
  const stn = (fnOpts?.station || marker || 'XXXX')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');
  let ddd = '001';
  let h = '0'; // '0' = full day session
  let yy = '00';
  if (startTime) {
    const y = startTime.getUTCFullYear();
    const doy =
      Math.floor((startTime.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
    ddd = String(doy).padStart(3, '0');
    // Session hour: 'a'-'x' for hours 0-23, '0' if data spans multiple hours
    h = String.fromCharCode(97 + startTime.getUTCHours()); // a=0, b=1, ...
    yy = String(y % 100).padStart(2, '0');
  }
  return `${stn}${ddd}${h}.${yy}${fileType}`;
}

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

export interface ObsParseResult {
  header: RinexHeader;
  stats: RinexStats;
  grid: EpochGrid;
  qaResult: QualityResult;
  warnings: RinexWarnings;
  positions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
  availablePrns: string[];
  availableCodes: Record<string, string[]>;
}

export interface FilterResult {
  stats: RinexStats;
  grid: EpochGrid;
  qaResult: QualityResult;
  positions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
  availablePrns: string[];
  availableCodes: Record<string, string[]>;
}

export interface NavParseResult {
  navResult: NavResult;
  positions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
}

/**
 * Add new observation files (incremental).
 * Worker merges with previously loaded data, runs QA, and recomputes positions if nav is available.
 */
export async function addObsFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<ObsParseResult> {
  const r = await request<AddObsResult>(
    { type: 'add-obs', files },
    'add-obs-result',
    onProgress,
  );
  return {
    header: r.header,
    stats: r.stats,
    grid: r.grid,
    qaResult: r.qaResult,
    warnings: r.warnings,
    positions: r.positions,
    observedPrns: r.observedPrns?.map((arr) => new Set(arr)) ?? null,
    availablePrns: r.availablePrns,
    availableCodes: r.availableCodes,
  };
}

/**
 * Add new navigation files (incremental).
 * Worker merges with previously loaded data and computes positions.
 */
export async function addNavFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<NavParseResult> {
  const r = await request<AddNavResult>(
    { type: 'add-nav', files },
    'add-nav-result',
    onProgress,
  );
  return {
    navResult: r.navResult,
    positions: r.positions,
    observedPrns: r.observedPrns?.map((arr) => new Set(arr)) ?? null,
  };
}

/**
 * Apply filters to cached observation data.
 * Returns filtered grid, stats, and QA — does NOT modify the cached data.
 */
export async function applyFilters(
  filters: FilterState,
): Promise<FilterResult> {
  const r = await request<ApplyFiltersResult>(
    { type: 'apply-filters', filters },
    'apply-filters-result',
  );
  return {
    stats: r.stats,
    grid: r.grid,
    qaResult: r.qaResult,
    positions: r.positions,
    observedPrns: r.observedPrns?.map((arr) => new Set(arr)) ?? null,
    availablePrns: r.availablePrns,
    availableCodes: r.availableCodes,
  };
}

export interface RecomputePositionsResult2 {
  positions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
}

/**
 * Recompute satellite positions with an overridden receiver position.
 * Used when the user edits the reference position in the header editor.
 */
export async function recomputePositions(
  rxPos?: [number, number, number],
): Promise<RecomputePositionsResult2> {
  const r = await request<RecomputePositionsResult>(
    { type: 'recompute-positions', rxPos },
    'recompute-positions-result',
  );
  return {
    positions: r.positions,
    observedPrns: r.observedPrns?.map((arr) => new Set(arr)) ?? null,
  };
}

export type ExportFormat = 'rinex3' | 'rinex2' | 'rinex4' | 'csv' | 'json-meta';

/** Filename components that the user can customize. */
export interface FilenameOptions {
  /** 4-char station name (padded/truncated). Default: from header marker. */
  station?: string;
  /** 2-digit monument number. Default: '00'. */
  monument?: string;
  /** 3-char country code. Default: 'XXX'. */
  country?: string;
  /** 1-char data source: R=Receiver, S=Stream, U=Unknown. Default: 'R'. */
  dataSource?: string;
}

export interface ExportOptions {
  filters?: FilterState;
  format?: ExportFormat;
  splitInterval?: number | null;
  filename?: FilenameOptions;
  headerOverrides?: HeaderOverrides;
}

const FORMAT_EXT: Record<ExportFormat, string> = {
  rinex3: '.rnx.gz',
  rinex2: '.obs.gz',
  rinex4: '.rnx.gz',
  csv: '.csv',
  'json-meta': '.json',
};

/** Export observation file from cached data. Triggers download. */
export async function exportObs(options?: ExportOptions): Promise<void> {
  const format = options?.format ?? 'rinex3';
  const fnOpts = options?.filename;
  const r = await request<ObsExportResult>(
    {
      type: 'export-obs',
      filters: options?.filters,
      format,
      splitInterval: options?.splitInterval,
      headerOverrides: options?.headerOverrides,
    },
    'obs-export-result',
  );

  let fname: string;
  if (format === 'csv' || format === 'json-meta') {
    const marker = (fnOpts?.station || r.filename.markerName || 'XXXX')
      .replace(/\s+/g, '')
      .toUpperCase()
      .slice(0, 9);
    fname = `${marker}${FORMAT_EXT[format]}`;
  } else if (format === 'rinex2') {
    fname =
      rinex2LegacyFilename(
        r.filename.markerName,
        r.filename.startTime ? new Date(r.filename.startTime) : null,
        'o',
        fnOpts,
      ) + '.gz';
  } else {
    fname =
      rinex3Filename(
        r.filename.markerName,
        r.filename.startTime ? new Date(r.filename.startTime) : null,
        r.filename.durationSec,
        r.filename.intervalSec,
        'MO',
        fnOpts,
      ) + '.gz';
  }
  downloadBlob(r.blob, fname);
}

/** Export navigation file from cached data. Triggers download. */
export async function exportNav(
  markerName: string,
  fnOpts?: FilenameOptions,
): Promise<void> {
  const r = await request<NavExportResult>(
    { type: 'export-nav', markerName },
    'nav-export-result',
  );
  const fname = rinex3Filename(
    r.filename.markerName,
    r.filename.startTime ? new Date(r.filename.startTime) : null,
    r.filename.durationSec,
    null,
    'MN',
    fnOpts,
  );
  downloadBlob(r.blob, fname);
}

/** Clear all cached data in the worker. */
export function clearWorker(): void {
  getWorker().postMessage({ type: 'clear' } satisfies WorkerRequest);
}
