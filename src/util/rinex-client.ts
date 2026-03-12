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
  ObsExportResult,
  NavExportResult,
} from './rinex.worker';
import type { RinexResult } from './rinex';
import type { NavResult } from './nav';
import type { QualityResult } from './quality-analysis';
import type { AllPositionsData } from './orbit';

/* ================================================================== */
/*  Singleton worker                                                   */
/* ================================================================== */

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./rinex.worker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return worker;
}

/* ================================================================== */
/*  Internal helpers                                                   */
/* ================================================================== */

function request<T extends WorkerResponse>(
  req: WorkerRequest,
  resultType: T['type'],
  onProgress?: (percent: number) => void,
): Promise<T> {
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    const handler = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
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
    w.postMessage(req);
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
function rinex3Filename(
  marker: string,
  startTime: Date | null,
  durationSec: number | null,
  intervalSec: number | null,
  fileType: 'MO' | 'MN',
): string {
  const stn = (marker || 'XXXX').replace(/\s+/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const ccc = 'XXX';
  let yyyydddhhmm = '00000000000';
  if (startTime) {
    const y = startTime.getUTCFullYear();
    const doy = Math.floor((startTime.getTime() - Date.UTC(y, 0, 1)) / 86400000) + 1;
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
    if (intervalSec < 60) intStr = `_${String(Math.round(intervalSec)).padStart(2, '0')}S`;
    else intStr = `_${String(Math.round(intervalSec / 60)).padStart(2, '0')}M`;
  }
  return `${stn}00${ccc}_R_${yyyydddhhmm}_${per}${intStr}_${fileType}.rnx`;
}

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

export interface ObsParseResult {
  result: RinexResult;
  qaResult: QualityResult;
  positions: AllPositionsData | null;
  observedPrns: Set<string>[] | null;
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
    result: r.result,
    qaResult: r.qaResult,
    positions: r.positions,
    observedPrns: r.observedPrns?.map(arr => new Set(arr)) ?? null,
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
    observedPrns: r.observedPrns?.map(arr => new Set(arr)) ?? null,
  };
}

/** Export observation file from cached data. Triggers download. */
export async function exportObs(): Promise<void> {
  const r = await request<ObsExportResult>(
    { type: 'export-obs' },
    'obs-export-result',
  );
  const fname = rinex3Filename(
    r.filename.markerName,
    r.filename.startTime ? new Date(r.filename.startTime) : null,
    r.filename.durationSec,
    r.filename.intervalSec,
    'MO',
  );
  downloadBlob(r.blob, fname + '.gz');
}

/** Export navigation file from cached data. Triggers download. */
export async function exportNav(markerName: string): Promise<void> {
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
  );
  downloadBlob(r.blob, fname);
}

/** Clear all cached data in the worker. */
export function clearWorker(): void {
  getWorker().postMessage({ type: 'clear' } satisfies WorkerRequest);
}
