/**
 * Shared GNSS constants and utilities used across chart and summary components.
 * Single source of truth for constellation colors, recharts styles, and formatting helpers.
 */

import type { RinexHeader } from './rinex';

/* ── Constellation colors ──────────────────────────────────────── */

export const SYSTEM_COLORS: Record<string, string> = {
  G: '#4ade80', // GPS — green
  R: '#f87171', // GLONASS — red
  E: '#60a5fa', // Galileo — blue
  C: '#fbbf24', // BeiDou — amber
  J: '#c084fc', // QZSS — purple
  I: '#fb923c', // NavIC — orange
  S: '#94a3b8', // SBAS — slate
};

/**
 * Constellation colors keyed by full name and common abbreviations
 * (sourcetable identifiers, RINEX shorthand, etc.).
 * Superset of SYSTEM_COLORS — use this when you have a name/abbreviation
 * rather than a single-letter system ID.
 */
export const CONSTELLATION_COLORS: Record<string, string> = {
  // Single-letter IDs (same values as SYSTEM_COLORS)
  G: '#4ade80', R: '#f87171', E: '#60a5fa', C: '#fbbf24',
  J: '#c084fc', I: '#fb923c', S: '#94a3b8',
  // Full names
  GPS: '#4ade80', GLONASS: '#f87171', Galileo: '#60a5fa', BeiDou: '#fbbf24',
  QZSS: '#a78bfa', NavIC: '#fb923c', SBAS: '#94a3b8',
  // Sourcetable / shorthand abbreviations
  GLO: '#f87171', GAL: '#60a5fa', BDS: '#fbbf24', QZS: '#a78bfa', IRN: '#fb923c',
};

/** Map single-letter system ID to display name and color. */
export const SYSTEM_META: Record<string, { name: string; color: string }> = {
  G: { name: 'GPS', color: '#4ade80' },
  R: { name: 'GLONASS', color: '#f87171' },
  E: { name: 'Galileo', color: '#60a5fa' },
  C: { name: 'BeiDou', color: '#fbbf24' },
  J: { name: 'QZSS', color: '#a78bfa' },
  I: { name: 'NavIC', color: '#fb923c' },
  S: { name: 'SBAS', color: '#94a3b8' },
};

/** Resolve a constellation color, with a sensible fallback for unknown systems. */
export function systemColor(sys: string): string {
  return SYSTEM_COLORS[sys] ?? '#7c8aff';
}

/** Short human-readable labels for each constellation identifier. */
export const SYS_SHORT: Record<string, string> = {
  G: 'GPS',
  R: 'GLO',
  E: 'GAL',
  C: 'BDS',
  J: 'QZS',
  I: 'NIC',
  S: 'SBS',
};

/* ── Recharts shared styles ────────────────────────────────────── */

export const GRID_STROKE = 'rgba(255,255,255,0.06)';

export const AXIS_STYLE = { fontSize: 10, fill: 'rgba(208,208,211,0.5)' } as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#32323f',
    border: '1px solid rgba(74,74,90,0.6)',
    borderRadius: 8,
    fontSize: 12,
    color: '#d0d0d3',
  },
  labelStyle: { color: 'rgba(208,208,211,0.6)', fontSize: 11 },
} as const;

/* ── BeiDou phase / orbit classification ─────────────────────── */

export interface BdsSatellite {
  prn: string;
  phase: 'BDS-2' | 'BDS-3';
  orbit: 'GEO' | 'IGSO' | 'MEO';
}

export const BDS_SATELLITES: BdsSatellite[] = [
  // BDS-2 GEO
  { prn: 'C01', phase: 'BDS-2', orbit: 'GEO' },
  { prn: 'C02', phase: 'BDS-2', orbit: 'GEO' },
  { prn: 'C03', phase: 'BDS-2', orbit: 'GEO' },
  { prn: 'C04', phase: 'BDS-2', orbit: 'GEO' },
  { prn: 'C05', phase: 'BDS-2', orbit: 'GEO' },
  // BDS-2 IGSO
  { prn: 'C06', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C07', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C08', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C09', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C10', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C13', phase: 'BDS-2', orbit: 'IGSO' },
  { prn: 'C16', phase: 'BDS-2', orbit: 'IGSO' },
  // BDS-2 MEO
  { prn: 'C11', phase: 'BDS-2', orbit: 'MEO' },
  { prn: 'C12', phase: 'BDS-2', orbit: 'MEO' },
  { prn: 'C14', phase: 'BDS-2', orbit: 'MEO' },
  // BDS-3 MEO
  { prn: 'C19', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C20', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C21', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C22', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C23', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C24', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C25', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C26', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C27', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C28', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C29', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C30', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C32', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C33', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C34', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C35', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C36', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C37', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C41', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C42', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C43', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C44', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C45', phase: 'BDS-3', orbit: 'MEO' },
  { prn: 'C46', phase: 'BDS-3', orbit: 'MEO' },
  // BDS-3 IGSO
  { prn: 'C38', phase: 'BDS-3', orbit: 'IGSO' },
  { prn: 'C39', phase: 'BDS-3', orbit: 'IGSO' },
  { prn: 'C40', phase: 'BDS-3', orbit: 'IGSO' },
  // BDS-3 GEO
  { prn: 'C59', phase: 'BDS-3', orbit: 'GEO' },
  { prn: 'C60', phase: 'BDS-3', orbit: 'GEO' },
  { prn: 'C61', phase: 'BDS-3', orbit: 'GEO' },
];

/* ── GLONASS FDMA frequency helpers ───────────────────────────── */

export const GLO_F1_BASE = 1602.0e6;
export const GLO_F1_STEP = 0.5625e6;
export const GLO_F2_BASE = 1246.0e6;
export const GLO_F2_STEP = 0.4375e6;
export const GLO_F3 = 1202.025e6; // CDMA, fixed

/** Fallback channel assignments when RINEX header lacks GLONASS SLOT / FRQ #. */
export const GLO_CHANNEL_FALLBACK: Record<string, number> = {
  R01:  1, R02: -4, R03:  5, R04:  6, R05:  1, R06: -4, R07:  5, R08:  6,
  R09: -2, R10: -7, R11:  0, R12: -1, R13: -2, R14: -7, R15:  0, R16: -1,
  R17:  4, R18: -3, R19:  3, R20:  2, R21:  4, R22: -3, R23:  3, R24:  2,
};

/**
 * Build a PRN → channel-k map from parsed RINEX header glonassSlots.
 * Falls back to hardcoded ICD assignments if the header record is absent.
 */
export function buildGloChannelMap(slots: Record<number, number>): Record<string, number> {
  if (Object.keys(slots).length === 0) return { ...GLO_CHANNEL_FALLBACK };
  const map: Record<string, number> = {};
  for (const [slot, k] of Object.entries(slots)) {
    map[`R${String(slot).padStart(2, '0')}`] = k;
  }
  return map;
}

/** Get GLONASS FDMA frequency for a given PRN and band. */
export function gloFreq(gloChannels: Record<string, number>, prn: string, band: string): number | undefined {
  const k = gloChannels[prn];
  if (k === undefined) return undefined;
  if (band === '1') return GLO_F1_BASE + k * GLO_F1_STEP;
  if (band === '2') return GLO_F2_BASE + k * GLO_F2_STEP;
  if (band === '3') return GLO_F3;
  return undefined;
}

/* ── Shared signal constants ──────────────────────────────────── */

export const C_LIGHT = 299792458;

/** Carrier frequencies (Hz) per system letter, per RINEX band digit. GLONASS FDMA bands 1/2 use gloFreq(). */
export const FREQ: Record<string, Record<string, number>> = {
  G: { '1': 1575.42e6, '2': 1227.60e6, '5': 1176.45e6 },
  R: { '3': 1202.025e6 },
  E: { '1': 1575.42e6, '5': 1176.45e6, '6': 1278.75e6, '7': 1207.14e6, '8': 1191.795e6 },
  C: { '1': 1575.42e6, '2': 1561.098e6, '5': 1176.45e6, '6': 1268.52e6, '7': 1207.14e6 },
  J: { '1': 1575.42e6, '2': 1227.60e6, '5': 1176.45e6, '6': 1278.75e6 },
  I: { '5': 1176.45e6, '9': 2492.028e6 },
  S: { '1': 1575.42e6, '5': 1176.45e6 },
};

export const BAND_LABELS: Record<string, Record<string, string>> = {
  G: { '1': 'L1', '2': 'L2', '5': 'L5' },
  R: { '1': 'G1', '2': 'G2', '3': 'G3' },
  E: { '1': 'E1', '5': 'E5a', '6': 'E6', '7': 'E5b', '8': 'E5' },
  C: { '1': 'B1C', '2': 'B1I', '5': 'B2a', '6': 'B3I', '7': 'B2I' },
  J: { '1': 'L1', '2': 'L2', '5': 'L5', '6': 'L6' },
  I: { '5': 'L5', '9': 'S' },
  S: { '1': 'L1', '5': 'L5' },
};

export const SYSTEM_NAMES: Record<string, string> = {
  G: 'GPS', R: 'GLONASS', E: 'Galileo', C: 'BeiDou',
  J: 'QZSS', I: 'NavIC', S: 'SBAS',
};

/** Preferred dual-frequency pairs [primary, secondary] per system. */
export const DUAL_FREQ_PAIRS: Record<string, [string, string][]> = {
  G: [['1', '2'], ['1', '5']],
  R: [['1', '2'], ['1', '3']],
  E: [['1', '5'], ['1', '7'], ['1', '6']],
  C: [['2', '7'], ['2', '6'], ['1', '5']],
  J: [['1', '2'], ['1', '5']],
  I: [['5', '9']],
  S: [['1', '5']],
};

export const ARC_GAP_FACTOR = 5;

/** Resolve frequency for a PRN + band, handling GLONASS FDMA. */
export function getFreq(gloChannels: Record<string, number>, prn: string, band: string): number | undefined {
  const sys = prn[0]!;
  if (sys === 'R') return gloFreq(gloChannels, prn, band);
  return FREQ[sys]?.[band];
}

/**
 * Tracking attribute priority for observation code selection.
 * Higher is better. X (combined) and C (C/A) preferred over W (encrypted).
 */
const ATTR_PRIORITY: Record<string, number> = {
  X: 8, C: 7, S: 6, L: 6, Q: 6, I: 5, B: 5, D: 4, Z: 3, P: 2, W: 1,
};

function attrRank(code: string): number {
  return ATTR_PRIORITY[code[2] ?? ''] ?? 3;
}

/** Callback type for cycle slip notifications. */
export type OnSlipDetected = (time: number, prn: string, bands: Set<string>) => void;

/** Build observation indices per system per band, preferring better tracking attributes. */
export function buildObsIndices(header: RinexHeader): Map<string, Map<string, { L: number; C: number | null }>> {
  const result = new Map<string, Map<string, { L: number; C: number | null }>>();

  for (const [sys, codes] of Object.entries(header.obsTypes)) {
    if (sys === '_v2') continue;
    const lIdx = new Map<string, number>();
    const lRank = new Map<string, number>();
    const cIdx = new Map<string, number>();
    const cRank = new Map<string, number>();

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      const type = code[0];
      const band = code[1];
      if (!band) continue;
      const rank = attrRank(code);
      if (type === 'L' && rank > (lRank.get(band) ?? -1)) { lIdx.set(band, i); lRank.set(band, rank); }
      if ((type === 'C' || type === 'P') && rank > (cRank.get(band) ?? -1)) { cIdx.set(band, i); cRank.set(band, rank); }
    }

    const bandMap = new Map<string, { L: number; C: number | null }>();
    for (const [band, li] of lIdx) {
      bandMap.set(band, { L: li, C: cIdx.get(band) ?? null });
    }
    if (bandMap.size > 0) result.set(sys, bandMap);
  }

  // RINEX v2
  const v2codes = header.obsTypes['_v2'];
  if (v2codes) {
    const lIdx = new Map<string, number>();
    const cIdx = new Map<string, number>();
    for (let i = 0; i < v2codes.length; i++) {
      const code = v2codes[i]!;
      const type = code[0];
      const band = code[1];
      if (!band) continue;
      if (type === 'L' && !lIdx.has(band)) lIdx.set(band, i);
      if ((type === 'C' || type === 'P') && !cIdx.has(band)) cIdx.set(band, i);
    }
    const bandMap = new Map<string, { L: number; C: number | null }>();
    for (const [band, li] of lIdx) {
      bandMap.set(band, { L: li, C: cIdx.get(band) ?? null });
    }
    if (bandMap.size > 0) result.set('_v2', bandMap);
  }

  return result;
}

/* ── Elevation mask ────────────────────────────────────────────── */

export const DEFAULT_ELEV_MASK_DEG = 5;

/* ── Formatting helpers ────────────────────────────────────────── */

/** Format a Date as HH:MM:SS UTC string. */
export function formatUTCTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
