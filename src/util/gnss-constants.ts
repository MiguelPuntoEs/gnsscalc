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
