/**
 * Streaming RINEX / CRX observation file parser.
 * Supports RINEX 2.x, 3.x/4.x and Compact RINEX (Hatanaka) 1.0/3.0.
 */

import { crxRepair, parseCrxDataLine, crxDecompress } from './crx';
import type { DiffState } from './crx';
import { SYSTEM_NAMES } from './gnss-constants';

const CHUNK_SIZE = 512 * 1024; // 512 KB — small enough to yield between chunks

/** Yield to the browser so the UI stays responsive during long parses. */
const yieldToMain = (): Promise<void> => new Promise(r => setTimeout(r, 0));

/* ================================================================== */
/*  Public types                                                       */
/* ================================================================== */

export interface RinexHeader {
  version: number;
  type: string;
  satSystem: string;
  markerName: string;
  markerType: string;
  observer: string;
  agency: string;
  receiverNumber: string;
  receiverType: string;
  receiverVersion: string;
  antNumber: string;
  antType: string;
  approxPosition: [number, number, number] | null;
  antDelta: [number, number, number] | null;
  interval: number | null;
  timeOfFirstObs: Date | null;
  timeOfLastObs: Date | null;
  obsTypes: Record<string, string[]>; // system letter → obs codes
  /** GLONASS frequency channel numbers. Key = slot (1-24), value = channel k (−7…+6). */
  glonassSlots: Record<number, number>;
  isCrx: boolean;
  crxVersion: number;
}

export interface EpochSummary {
  time: number; // unix ms
  totalSats: number;
  satsPerSystem: Record<string, number>;
  meanSnr: number | null;
  snrPerSystem: Record<string, number>;
  snrPerSat: Record<string, number>; // PRN (e.g. "G01") → mean SNR
  /** Per-satellite per-band SNR.  Key = "PRN:band" e.g. "G01:1" → dB-Hz */
  snrPerSatBand?: Record<string, number>;
}

export interface RinexStats {
  totalEpochs: number;
  validEpochs: number;
  duration: number | null;
  startTime: Date | null;
  endTime: Date | null;
  interval: number | null;
  uniqueSatellites: number;
  uniqueSatsPerSystem: Record<string, number>;
  systems: string[];
  meanSatellites: number;
  meanSnr: number | null;
}

export interface RinexResult {
  header: RinexHeader;
  epochs: EpochSummary[];
  stats: RinexStats;
}

/* ================================================================== */
/*  System labels                                                      */
/* ================================================================== */

// SYSTEM_NAMES imported from gnss-constants.ts

/** Canonical constellation display order: GPS → GLONASS → Galileo → BeiDou → QZSS → NavIC → SBAS */
export const SYSTEM_ORDER = ['G', 'R', 'E', 'C', 'J', 'I', 'S'] as const;

const SYSTEM_RANK: Record<string, number> = Object.fromEntries(SYSTEM_ORDER.map((s, i) => [s, i]));

/** Compare two system codes (or PRNs) in canonical constellation order. */
export function systemCmp(a: string, b: string): number {
  const ra = SYSTEM_RANK[a.charAt(0)] ?? 99;
  const rb = SYSTEM_RANK[b.charAt(0)] ?? 99;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

export function systemName(code: string): string {
  return SYSTEM_NAMES[code] ?? code;
}

/* ================================================================== */
/*  Header parser                                                      */
/* ================================================================== */

function parseHeader(lines: string[]): RinexHeader {
  const h: RinexHeader = {
    version: 0, type: '', satSystem: '', markerName: '', markerType: '',
    observer: '', agency: '',
    receiverNumber: '', receiverType: '', receiverVersion: '',
    antNumber: '', antType: '',
    approxPosition: null, antDelta: null,
    interval: null, timeOfFirstObs: null, timeOfLastObs: null,
    obsTypes: {}, glonassSlots: {}, isCrx: false, crxVersion: 0,
  };

  let currentObsSys = '';

  for (const raw of lines) {
    const label = raw.substring(60).trim();
    const data = raw.substring(0, 60);

    switch (label) {
      case 'CRINEX VERS   / TYPE': {
        h.isCrx = true;
        h.crxVersion = parseFloat(data.substring(0, 9)) || 0;
        break;
      }
      case 'RINEX VERSION / TYPE': {
        h.version = parseFloat(data.substring(0, 9));
        h.type = data.substring(20, 21).trim();
        h.satSystem = data.substring(40, 41).trim();
        break;
      }
      case 'MARKER NAME':
        h.markerName = data.trim();
        break;
      case 'MARKER TYPE':
        h.markerType = data.trim();
        break;
      case 'OBSERVER / AGENCY':
        h.observer = data.substring(0, 20).trim();
        h.agency = data.substring(20).trim();
        break;
      case 'REC # / TYPE / VERS':
        h.receiverNumber = data.substring(0, 20).trim();
        h.receiverType = data.substring(20, 40).trim();
        h.receiverVersion = data.substring(40, 60).trim();
        break;
      case 'ANT # / TYPE':
        h.antNumber = data.substring(0, 20).trim();
        h.antType = data.substring(20).trim();
        break;
      case 'ANTENNA: DELTA H/E/N': {
        const d = data.trim().split(/\s+/).map(Number);
        if (d.length >= 3 && !d.slice(0, 3).some(isNaN)) {
          h.antDelta = [d[0]!, d[1]!, d[2]!];
        }
        break;
      }
      case 'APPROX POSITION XYZ': {
        const p = data.trim().split(/\s+/).map(Number);
        if (p.length >= 3 && p[0] !== undefined && p[1] !== undefined && p[2] !== undefined
            && !isNaN(p[0]) && !isNaN(p[1]) && !isNaN(p[2])) {
          h.approxPosition = [p[0], p[1], p[2]];
        }
        break;
      }
      case 'INTERVAL':
        h.interval = parseFloat(data);
        break;
      case 'TIME OF FIRST OBS':
        h.timeOfFirstObs = parseHeaderTime(data);
        break;
      case 'TIME OF LAST OBS':
        h.timeOfLastObs = parseHeaderTime(data);
        break;
      case 'SYS / # / OBS TYPES': {
        const sys = data[0]?.trim();
        if (sys) {
          currentObsSys = sys;
          const count = parseInt(data.substring(3, 6));
          const codes = data.substring(7, 60).trim().split(/\s+/).filter(Boolean);
          h.obsTypes[currentObsSys] = codes;
          void count; // continuation handled below
        } else if (currentObsSys && h.obsTypes[currentObsSys]) {
          const codes = data.substring(7, 60).trim().split(/\s+/).filter(Boolean);
          h.obsTypes[currentObsSys]!.push(...codes);
        }
        break;
      }
      case 'GLONASS SLOT / FRQ #': {
        // Format: nSats (3 chars), then up to 8 pairs of "Rnn k" (slot + channel)
        const nSats = parseInt(data.substring(0, 3));
        void nSats;
        for (let i = 0; i < 8; i++) {
          const off = 4 + i * 7;
          const sat = data.substring(off, off + 3).trim();
          const ch = data.substring(off + 3, off + 7).trim();
          if (sat && sat[0] === 'R' && ch) {
            const slot = parseInt(sat.substring(1));
            const k = parseInt(ch);
            if (!isNaN(slot) && !isNaN(k)) h.glonassSlots[slot] = k;
          }
        }
        break;
      }
      case '# / TYPES OF OBSERV': {
        const existing = h.obsTypes['_v2'];
        const codes = data.substring(6, 60).trim().split(/\s+/).filter(Boolean);
        if (!existing || existing.length === 0) {
          h.obsTypes['_v2'] = codes;
        } else {
          existing.push(...codes);
        }
        break;
      }
    }
  }
  return h;
}

function parseHeaderTime(data: string): Date | null {
  const p = data.trim().split(/\s+/).map(Number);
  if (p.length < 6) return null;
  const yr = p[0]!, mo = p[1]!, dy = p[2]!, hr = p[3]!, mn = p[4]!, sc = p[5]!;
  if ([yr, mo, dy, hr, mn, sc].some(isNaN)) return null;
  const wholeSec = Math.floor(sc);
  const ms = Math.round((sc - wholeSec) * 1000);
  return new Date(Date.UTC(yr, mo - 1, dy, hr, mn, wholeSec, ms));
}

/* ================================================================== */
/*  SNR index helpers                                                  */
/* ================================================================== */

function snrIndicesWithBand(obsTypes: Record<string, string[]>, system: string): { idx: number; band: string }[] {
  const codes = obsTypes[system];
  if (!codes) return [];
  const result: { idx: number; band: string }[] = [];
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c.startsWith('S')) result.push({ idx: i, band: c[1]! });
  }
  return result;
}

function snrIndicesWithBandV2(obsTypes: Record<string, string[]>): { idx: number; band: string }[] {
  const codes = obsTypes['_v2'];
  if (!codes) return [];
  const result: { idx: number; band: string }[] = [];
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c.startsWith('S')) result.push({ idx: i, band: c[1]! });
  }
  return result;
}

/* ================================================================== */
/*  RINEX observation value extraction                                 */
/* ================================================================== */

function readObsValue(line: string, index: number): number | null {
  const start = index * 16;
  if (start + 14 > line.length) return null;
  const raw = line.substring(start, start + 14).trim();
  if (!raw) return null;
  const v = parseFloat(raw);
  return isNaN(v) ? null : v;
}

/* ================================================================== */
/*  Epoch line parsers                                                 */
/* ================================================================== */

interface EpochLineInfo {
  time: number;
  flag: number;
  numSats: number;
  satIds?: string[];
}

function parseEpochLine3(line: string): EpochLineInfo | null {
  if (line[0] !== '>') return null;
  const yr = parseInt(line.substring(2, 6));
  const mo = parseInt(line.substring(7, 9));
  const dy = parseInt(line.substring(10, 12));
  const hr = parseInt(line.substring(13, 15));
  const mn = parseInt(line.substring(16, 18));
  const sc = parseFloat(line.substring(19, 29));
  const flag = parseInt(line.substring(31, 32));
  const numSats = parseInt(line.substring(32, 35));
  if ([yr, mo, dy, hr, mn].some(isNaN) || isNaN(sc)) return null;
  const wholeSec = Math.floor(sc);
  const ms = Math.round((sc - wholeSec) * 1000);
  const time = Date.UTC(yr, mo - 1, dy, hr, mn, wholeSec, ms);
  return { time, flag: isNaN(flag) ? 0 : flag, numSats: isNaN(numSats) ? 0 : numSats };
}

function parseEpochLine2(line: string): EpochLineInfo | null {
  const yr2 = parseInt(line.substring(1, 3));
  const mo = parseInt(line.substring(4, 6));
  const dy = parseInt(line.substring(7, 9));
  const hr = parseInt(line.substring(10, 12));
  const mn = parseInt(line.substring(13, 15));
  const sc = parseFloat(line.substring(15, 26));
  const flag = parseInt(line.substring(28, 29));
  const numSats = parseInt(line.substring(29, 32));
  if ([yr2, mo, dy, hr, mn].some(isNaN) || isNaN(sc)) return null;
  const yr = yr2 >= 80 ? 1900 + yr2 : 2000 + yr2;
  const wholeSec = Math.floor(sc);
  const ms = Math.round((sc - wholeSec) * 1000);
  const time = Date.UTC(yr, mo - 1, dy, hr, mn, wholeSec, ms);

  const satIds: string[] = [];
  const satPart = line.substring(32);
  for (let i = 0; i + 3 <= satPart.length; i += 3) {
    const id = satPart.substring(i, i + 3).trim();
    if (id) satIds.push(id);
  }
  return { time, flag: isNaN(flag) ? 0 : flag, numSats: isNaN(numSats) ? 0 : numSats, satIds };
}

/* ================================================================== */
/*  CRX (Compact RINEX / Hatanaka) decompression — see ./crx.ts       */
/* ================================================================== */

/* ================================================================== */
/*  Streaming parser                                                   */
/* ================================================================== */

/** Callback invoked for each satellite observation line with all raw values. */
export type SatObsCallback = (
  time: number,
  prn: string,
  codes: string[],
  values: (number | null)[],
) => void;

export async function parseRinexStream(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
  onSatObs?: SatObsCallback,
): Promise<RinexResult> {
  const decoder = new TextDecoder('ascii');
  let buffer = '';
  let header: RinexHeader | null = null;
  const headerLines: string[] = [];
  const epochs: EpochSummary[] = [];
  const satellitesSeen: Record<string, Set<string>> = {};

  // --- shared epoch accumulation ---
  let epochInfo: EpochLineInfo | null = null;
  let satsPerSystem: Record<string, number> = {};
  let snrValues: number[] = [];
  let snrPerSystemAccum: Record<string, number[]> = {};
  let snrPerSatAccum: Record<string, number[]> = {};
  let snrPerSatBandAccum: Record<string, number[]> = {}; // "PRN:band" → values

  // --- RINEX (non-CRX) state ---
  let satLinesRemaining = 0;
  let eventSkipLines = 0; // lines remaining to skip for event records (flag 2-5)
  // v2 specifics
  let v2SatIds: string[] = [];
  let v2SatIndex = 0;
  let v2LinesPerSat = 0;
  let v2CurrentSatLine = 0;
  let v2SnrBandInfo: { idx: number; band: string }[] = [];
  let v2ContinuationSatsRemaining = 0;

  // --- CRX state ---
  type CrxPhase = 'epoch' | 'clock' | 'satdata';
  let crxPhase: CrxPhase = 'epoch';
  let crxSatList: string[] = [];     // PRN list for current epoch
  let crxSatIndex = 0;               // which satellite we're on
  let crxPrevEpochLine = '';          // for text-differencing epoch lines
  // Per-satellite decompression state: PRN → array of DiffState per obs
  const crxDiffStates = new Map<string, (DiffState | null)[]>();

  /* -------- helpers -------- */

  function trackSat(sys: string, prn: string) {
    if (!satellitesSeen[sys]) satellitesSeen[sys] = new Set();
    satellitesSeen[sys]!.add(prn);
    satsPerSystem[sys] = (satsPerSystem[sys] ?? 0) + 1;
  }

  function pushSnr(sys: string, prn: string, val: number, band?: string) {
    snrValues.push(val);
    if (!snrPerSystemAccum[sys]) snrPerSystemAccum[sys] = [];
    snrPerSystemAccum[sys]!.push(val);
    if (!snrPerSatAccum[prn]) snrPerSatAccum[prn] = [];
    snrPerSatAccum[prn]!.push(val);
    if (band) {
      const key = `${prn}:${band}`;
      if (!snrPerSatBandAccum[key]) snrPerSatBandAccum[key] = [];
      snrPerSatBandAccum[key]!.push(val);
    }
  }

  function finishEpoch() {
    if (!epochInfo) return;
    const snrBySys: Record<string, number> = {};
    for (const [sys, vals] of Object.entries(snrPerSystemAccum)) {
      if (vals.length > 0) snrBySys[sys] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const meanSnr = snrValues.length > 0
      ? snrValues.reduce((a, b) => a + b, 0) / snrValues.length : null;
    const snrPerSat: Record<string, number> = {};
    for (const [prn, vals] of Object.entries(snrPerSatAccum)) {
      if (vals.length > 0) snrPerSat[prn] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const snrPerSatBand: Record<string, number> = {};
    for (const [key, vals] of Object.entries(snrPerSatBandAccum)) {
      if (vals.length > 0) snrPerSatBand[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    epochs.push({
      time: epochInfo.time,
      totalSats: Object.values(satsPerSystem).reduce((a, b) => a + b, 0),
      satsPerSystem: { ...satsPerSystem },
      meanSnr, snrPerSystem: snrBySys, snrPerSat, snrPerSatBand,
    });
    epochInfo = null;
    satsPerSystem = {};
    snrValues = [];
    snrPerSystemAccum = {};
    snrPerSatAccum = {};
    snrPerSatBandAccum = {};
  }

  function resetEpochAccum(info: EpochLineInfo) {
    epochInfo = info;
    satsPerSystem = {};
    snrValues = [];
    snrPerSystemAccum = {};
    snrPerSatAccum = {};
    snrPerSatBandAccum = {};
  }

  /* -------- RINEX 3 (non-CRX) -------- */

  function processSatLineV3(line: string) {
    if (!header || line.length < 3) return;
    const sys = line[0]!;
    const prn = line.substring(0, 3);
    trackSat(sys, prn);
    const obsLine = line.substring(3);
    for (const { idx, band } of snrIndicesWithBand(header.obsTypes, sys)) {
      const val = readObsValue(obsLine, idx);
      if (val !== null && val > 0) pushSnr(sys, prn, val, band);
    }
    if (onSatObs && epochInfo) {
      const codes = header.obsTypes[sys] ?? [];
      const values: (number | null)[] = new Array(codes.length);
      for (let i = 0; i < codes.length; i++) values[i] = readObsValue(obsLine, i);
      onSatObs(epochInfo.time, prn, codes, values);
    }
  }

  /* -------- RINEX 2 (non-CRX) -------- */

  // v2: accumulate all obs values across continuation lines for onSatObs callback
  let v2ObsAccum: (number | null)[] = [];

  function processSatLineV2(line: string) {
    if (!header || v2SatIndex >= v2SatIds.length) return;
    const satId = v2SatIds[v2SatIndex]!;
    let sys = satId[0]!;
    if (sys === ' ' || /\d/.test(sys)) sys = 'G';
    const prn = sys + satId.substring(1).padStart(2, '0');

    // Only count satellite on first line
    if (v2CurrentSatLine === 0) {
      trackSat(sys, prn);
      if (onSatObs) v2ObsAccum = [];
    }

    const lineOffset = v2CurrentSatLine * 5;
    for (const { idx, band } of v2SnrBandInfo) {
      if (idx >= lineOffset && idx < lineOffset + 5) {
        const val = readObsValue(line, idx - lineOffset);
        if (val !== null && val > 0) pushSnr(sys, prn, val, band);
      }
    }
    if (onSatObs) {
      for (let i = 0; i < 5; i++) {
        if (lineOffset + i < (header.obsTypes['_v2'] ?? []).length) {
          v2ObsAccum.push(readObsValue(line, i));
        }
      }
    }
    v2CurrentSatLine++;
    if (v2CurrentSatLine >= v2LinesPerSat) {
      if (onSatObs && epochInfo) {
        const codes = header.obsTypes['_v2'] ?? [];
        onSatObs(epochInfo.time, prn, codes, v2ObsAccum);
      }
      v2CurrentSatLine = 0;
      v2SatIndex++;
    }
  }

  /* -------- CRX satellite processing -------- */

  function processCrxSatDataLine(prn: string, line: string) {
    if (!header) return;
    const sys = prn[0]!;
    trackSat(sys, prn);

    const ntype = header.version >= 3
      ? (header.obsTypes[sys] ?? []).length
      : (header.obsTypes['_v2'] ?? []).length;
    if (ntype === 0) return;

    const { fields } = parseCrxDataLine(line, ntype);

    // Get or create diff state for this satellite (keyed by PRN)
    let states = crxDiffStates.get(prn);
    if (!states) {
      states = new Array(ntype).fill(null) as (DiffState | null)[];
      crxDiffStates.set(prn, states);
    }
    while (states.length < ntype) states.push(null);

    // Determine which obs indices are SNR (with band info)
    const sBand = header.version >= 3
      ? snrIndicesWithBand(header.obsTypes, sys)
      : snrIndicesWithBandV2(header.obsTypes);
    const sBandMap = new Map(sBand.map(s => [s.idx, s.band]));

    // Decompress each observation, collecting values for callback
    const obsValues: (number | null)[] = onSatObs ? new Array(ntype).fill(null) : [];

    for (let j = 0; j < ntype; j++) {
      const field = fields[j]!;
      if (field.empty) continue;

      const { state, result } = crxDecompress(states[j] ?? null, field);
      states[j] = state;

      if (onSatObs) obsValues[j] = result / 1000;

      const band = sBandMap.get(j);
      if (band !== undefined) {
        const snrFloat = result / 1000;
        if (snrFloat > 0) pushSnr(sys, prn, snrFloat, band);
      }
    }

    if (onSatObs && epochInfo) {
      const codes = header.version >= 3
        ? (header.obsTypes[sys] ?? [])
        : (header.obsTypes['_v2'] ?? []);
      onSatObs(epochInfo.time, prn, codes, obsValues);
    }
  }

  /* -------- CRX line processor -------- */

  // CRX 1.0 uses '&' as epoch initializer (converted to ' '), CRX 3.0 uses '>'
  let crxEpochTopFrom = '>';
  let crxEpochTopTo = '>';
  let crxEventSkipLines = 0; // lines remaining to skip for event records

  function processCrxLine(line: string) {
    if (!header) return;
    const isV3 = header.version >= 3;

    // One-time setup of epoch markers based on CRX version
    if (header.crxVersion < 3) {
      crxEpochTopFrom = '&';
      crxEpochTopTo = ' ';
    }

    // Skip embedded header lines after event records (flag 2-5)
    if (crxEventSkipLines > 0) {
      crxEventSkipLines--;
      return;
    }

    if (crxPhase === 'epoch') {
      // Skip escape lines (CRX 3.0: lines starting with &)
      if (header.crxVersion >= 3 && line[0] === '&') return;

      // Detect initialized epoch (first char matches ep_top_from)
      const isInitEpoch = line[0] === crxEpochTopFrom;
      const isTextDiff = !isInitEpoch && crxPrevEpochLine.length > 0;

      if (isInitEpoch || isTextDiff) {
        let epochLine: string;
        if (isInitEpoch) {
          // Convert ep_top_from to ep_top_to (CRX 1.0: & → space)
          epochLine = crxEpochTopTo + line.substring(1);
          // Reset previous line to trigger full copy on repair
          crxPrevEpochLine = '';
        } else {
          // Apply text differencing
          epochLine = crxRepair(crxPrevEpochLine, line);
        }

        if (isV3) {
          if (epochLine[0] !== '>') return; // not a valid epoch

          const info = parseEpochLine3(epochLine);
          if (!info) { crxPrevEpochLine = epochLine; return; }

          // Handle event records (flag 2-5): skip embedded header lines
          if (info.flag >= 2) {
            crxPrevEpochLine = epochLine;
            crxEventSkipLines = info.numSats; // numSats = # of special records
            return;
          }
          if (info.flag !== 0) { crxPrevEpochLine = epochLine; return; }

          resetEpochAccum(info);

          // Extract satellite list from position 41+
          const satPart = epochLine.substring(41).replace(/\s+$/, '');
          crxSatList = [];
          for (let i = 0; i + 3 <= satPart.length; i += 3) {
            crxSatList.push(satPart.substring(i, i + 3));
          }

          crxSatIndex = 0;
          crxPrevEpochLine = epochLine;
          crxPhase = 'clock';
        } else {
          // CRX 1.0 / RINEX 2
          const info = parseEpochLine2(epochLine);
          if (!info) { crxPrevEpochLine = epochLine; return; }

          // Handle event records (flag 2-5): skip embedded header lines
          if (info.flag >= 2) {
            crxPrevEpochLine = epochLine;
            crxEventSkipLines = info.numSats;
            return;
          }
          if (info.flag !== 0) { crxPrevEpochLine = epochLine; return; }

          resetEpochAccum(info);
          crxSatList = (info.satIds ?? []).map(id => {
            let sys = id[0]!;
            if (sys === ' ' || /\d/.test(sys)) sys = 'G';
            return sys + id.substring(1).padStart(2, '0');
          });
          crxSatIndex = 0;
          crxPrevEpochLine = epochLine;
          crxPhase = 'clock';
        }
      }
    } else if (crxPhase === 'clock') {
      // Skip clock offset line (we don't need it)
      if (crxSatList.length > 0) {
        crxPhase = 'satdata';
      } else {
        crxPhase = 'epoch';
        finishEpoch();
      }
    } else if (crxPhase === 'satdata') {
      const prn = crxSatList[crxSatIndex]!;
      processCrxSatDataLine(prn, line);
      crxSatIndex++;
      if (crxSatIndex >= crxSatList.length) {
        crxPhase = 'epoch';
        finishEpoch();
      }
    }
  }

  /* -------- RINEX (non-CRX) line processor -------- */

  function processRinexLine(line: string) {
    if (!header) return;

    // Skip embedded header lines after event records (flag 2-5)
    if (eventSkipLines > 0) {
      eventSkipLines--;
      return;
    }

    if (header.version >= 3) {
      if (satLinesRemaining > 0) {
        processSatLineV3(line);
        satLinesRemaining--;
        if (satLinesRemaining === 0) finishEpoch();
      } else if (line[0] === '>') {
        const info = parseEpochLine3(line);
        if (!info) return;
        if (info.flag >= 2 && info.flag <= 5) {
          eventSkipLines = info.numSats;
          return;
        }
        if (info.flag === 0) {
          resetEpochAccum(info);
          satLinesRemaining = info.numSats;
          if (info.numSats === 0) finishEpoch();
        }
      }
    } else {
      if (v2ContinuationSatsRemaining > 0) {
        const satPart = line.substring(32);
        for (let i = 0; i + 3 <= satPart.length; i += 3) {
          const id = satPart.substring(i, i + 3).trim();
          if (id) v2SatIds.push(id);
        }
        v2ContinuationSatsRemaining--;
        if (v2ContinuationSatsRemaining === 0) {
          v2SatIndex = 0;
          v2CurrentSatLine = 0;
          satLinesRemaining = v2SatIds.length * v2LinesPerSat;
          if (satLinesRemaining === 0) finishEpoch();
        }
      } else if (satLinesRemaining > 0) {
        processSatLineV2(line);
        satLinesRemaining--;
        if (satLinesRemaining === 0) finishEpoch();
      } else {
        const info = parseEpochLine2(line);
        if (!info) return;
        if (info.flag >= 2 && info.flag <= 5) {
          eventSkipLines = info.numSats;
          return;
        }
        if (info.flag === 0) {
          resetEpochAccum(info);
          v2SatIds = info.satIds ?? [];
          const v2ObsPerSat = (header.obsTypes['_v2'] ?? []).length;
          v2LinesPerSat = Math.ceil(v2ObsPerSat / 5) || 1;
          v2SnrBandInfo = snrIndicesWithBandV2(header.obsTypes);
          v2SatIndex = 0;
          v2CurrentSatLine = 0;
          const continuationLines = Math.max(0, Math.ceil((info.numSats - 12) / 12));
          if (continuationLines > 0) {
            v2ContinuationSatsRemaining = continuationLines;
          } else {
            satLinesRemaining = v2SatIds.length * v2LinesPerSat;
            if (satLinesRemaining === 0) finishEpoch();
          }
        }
      }
    }
  }

  /* -------- main line dispatch -------- */

  function processLine(line: string) {
    if (!header) return;
    if (header.isCrx) {
      processCrxLine(line);
    } else {
      processRinexLine(line);
    }
  }

  /* ================================================================ */
  /*  Stream the file in chunks                                        */
  /* ================================================================ */

  function processChunkText(text: string, isLast: boolean) {
    buffer += text;
    const lastNl = buffer.lastIndexOf('\n');
    if (lastNl === -1 && !isLast) return;

    const chunk = isLast ? buffer : buffer.substring(0, lastNl);
    buffer = isLast ? '' : buffer.substring(lastNl + 1);
    const lines = chunk.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line && !header) continue;
      if (!header) {
        headerLines.push(line);
        if (line.includes('END OF HEADER')) header = parseHeader(headerLines);
        continue;
      }
      processLine(line);
    }
  }

  // Detect compression by magic bytes
  const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isGz = magic[0] === 0x1f && magic[1] === 0x8b;
  if (magic[0] === 0x1f && magic[1] === 0x9d) {
    throw new Error('Unix compress (.Z) files are not supported. Please decompress first (e.g. uncompress or gzip -d).');
  }

  if (isGz) {
    // Streaming gzip decompression via DecompressionStream
    let bytesRead = 0;
    const raw = file.stream();
    const decompressed = raw.pipeThrough(new DecompressionStream('gzip'));
    const reader = decompressed.getReader();

    for (;;) {
      if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      processChunkText(decoder.decode(value, { stream: true }), false);
      // Progress based on compressed bytes is not exact, estimate from decompressed
      onProgress?.(Math.min(99, Math.round((bytesRead / (file.size * 4)) * 100)));
      await yieldToMain();
    }
    processChunkText(decoder.decode(), true);
  } else {
    // Plain file: slice in chunks for memory efficiency
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const slice = file.slice(offset, end);
      const arrayBuf = await slice.arrayBuffer();
      processChunkText(decoder.decode(arrayBuf, { stream: end < file.size }), false);
      onProgress?.(Math.min(99, Math.round((end / file.size) * 100)));
      await yieldToMain();
    }

    // Process remaining buffer
    if (buffer.length > 0) {
      processChunkText('', true);
    }
  }

  if (epochInfo && satLinesRemaining === 0 && crxPhase === 'epoch') finishEpoch();

  if (!header) throw new Error('No valid RINEX header found (missing END OF HEADER).');

  onProgress?.(100);
  return { header, epochs, stats: computeStats(header, epochs, satellitesSeen) };
}

/* ================================================================== */
/*  Stats                                                              */
/* ================================================================== */

function computeStats(
  header: RinexHeader,
  epochs: EpochSummary[],
  satellitesSeen: Record<string, Set<string>>,
): RinexStats {
  const n = epochs.length;
  const startTime = n > 0 ? new Date(epochs[0]!.time) : header.timeOfFirstObs;
  const endTime = n > 0 ? new Date(epochs[n - 1]!.time) : header.timeOfLastObs;

  let duration: number | null = null;
  if (startTime && endTime) duration = (endTime.getTime() - startTime.getTime()) / 1000;

  let interval = header.interval;
  if (interval === null && n >= 2) interval = (epochs[1]!.time - epochs[0]!.time) / 1000;

  const uniqueSatsPerSystem: Record<string, number> = {};
  let totalUnique = 0;
  const systems: string[] = [];
  for (const [sys, prns] of Object.entries(satellitesSeen)) {
    uniqueSatsPerSystem[sys] = prns.size;
    totalUnique += prns.size;
    systems.push(sys);
  }
  systems.sort(systemCmp);

  const meanSatellites = n > 0 ? epochs.reduce((s, e) => s + e.totalSats, 0) / n : 0;

  const snrEpochs = epochs.filter(e => e.meanSnr !== null);
  const meanSnr = snrEpochs.length > 0
    ? snrEpochs.reduce((s, e) => s + e.meanSnr!, 0) / snrEpochs.length : null;

  return {
    totalEpochs: n, validEpochs: n, duration, startTime, endTime, interval,
    uniqueSatellites: totalUnique, uniqueSatsPerSystem, systems, meanSatellites, meanSnr,
  };
}

/* ================================================================== */
/*  Chart downsampling                                                 */
/* ================================================================== */

const MAX_CHART_POINTS = 2000;

export function downsampleEpochs(epochs: EpochSummary[]): EpochSummary[] {
  if (epochs.length <= MAX_CHART_POINTS) return epochs;

  const groupSize = Math.ceil(epochs.length / MAX_CHART_POINTS);
  const result: EpochSummary[] = [];

  for (let i = 0; i < epochs.length; i += groupSize) {
    const group = epochs.slice(i, i + groupSize);
    const gn = group.length;

    const allSystems = new Set<string>();
    for (const e of group) for (const sys of Object.keys(e.satsPerSystem)) allSystems.add(sys);
    const satsPerSystem: Record<string, number> = {};
    for (const sys of allSystems) {
      satsPerSystem[sys] = Math.round(group.reduce((s, e) => s + (e.satsPerSystem[sys] ?? 0), 0) / gn);
    }

    const snrSystems = new Set<string>();
    for (const e of group) for (const sys of Object.keys(e.snrPerSystem)) snrSystems.add(sys);
    const snrPerSystem: Record<string, number> = {};
    for (const sys of snrSystems) {
      const vals = group.map(e => e.snrPerSystem[sys]).filter((v): v is number => v != null);
      if (vals.length > 0) snrPerSystem[sys] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    const snrVals = group.map(e => e.meanSnr).filter((v): v is number => v !== null);

    const allPrns = new Set<string>();
    for (const e of group) for (const prn of Object.keys(e.snrPerSat)) allPrns.add(prn);
    const snrPerSat: Record<string, number> = {};
    for (const prn of allPrns) {
      const vals = group.map(e => e.snrPerSat[prn]).filter((v): v is number => v != null);
      if (vals.length > 0) snrPerSat[prn] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    const allBandKeys = new Set<string>();
    for (const e of group) if (e.snrPerSatBand) for (const k of Object.keys(e.snrPerSatBand)) allBandKeys.add(k);
    const snrPerSatBand: Record<string, number> = {};
    for (const k of allBandKeys) {
      const vals = group.map(e => e.snrPerSatBand?.[k]).filter((v): v is number => v != null);
      if (vals.length > 0) snrPerSatBand[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    result.push({
      time: group[Math.floor(gn / 2)]!.time,
      totalSats: Math.round(group.reduce((s, e) => s + e.totalSats, 0) / gn),
      satsPerSystem,
      meanSnr: snrVals.length > 0 ? snrVals.reduce((a, b) => a + b, 0) / snrVals.length : null,
      snrPerSystem,
      snrPerSat,
      snrPerSatBand: allBandKeys.size > 0 ? snrPerSatBand : undefined,
    });
  }
  return result;
}
