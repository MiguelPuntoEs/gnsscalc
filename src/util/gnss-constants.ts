/**
 * Shared GNSS constants and utilities used across chart and summary components.
 * Single source of truth for constellation colors, recharts styles, and formatting helpers.
 */

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
  itemStyle: { color: '#d0d0d3' },
} as const;

/* ── Elevation mask ────────────────────────────────────────────── */

export const DEFAULT_ELEV_MASK_DEG = 5;

/* ── Formatting helpers ────────────────────────────────────────── */

/** Format a Date as HH:MM:SS UTC string. */
export function formatUTCTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
