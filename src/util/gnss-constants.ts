/**
 * UI-specific GNSS constants: constellation colors, chart styles.
 * Pure GNSS data (frequencies, system names, etc.) is in gnss-js.
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

export const CONSTELLATION_COLORS: Record<string, string> = {
  G: '#4ade80',
  R: '#f87171',
  E: '#60a5fa',
  C: '#fbbf24',
  J: '#c084fc',
  I: '#fb923c',
  S: '#94a3b8',
  GPS: '#4ade80',
  GLONASS: '#f87171',
  Galileo: '#60a5fa',
  BeiDou: '#fbbf24',
  QZSS: '#a78bfa',
  NavIC: '#fb923c',
  SBAS: '#94a3b8',
  GLO: '#f87171',
  GAL: '#60a5fa',
  BDS: '#fbbf24',
  QZS: '#a78bfa',
  IRN: '#fb923c',
};

export const SYSTEM_META: Record<string, { name: string; color: string }> = {
  G: { name: 'GPS', color: '#4ade80' },
  R: { name: 'GLONASS', color: '#f87171' },
  E: { name: 'Galileo', color: '#60a5fa' },
  C: { name: 'BeiDou', color: '#fbbf24' },
  J: { name: 'QZSS', color: '#a78bfa' },
  I: { name: 'NavIC', color: '#fb923c' },
  S: { name: 'SBAS', color: '#94a3b8' },
};

export function systemColor(sys: string): string {
  return SYSTEM_COLORS[sys] ?? '#7c8aff';
}

/* ── Recharts shared styles ────────────────────────────────────── */

export const GRID_STROKE = 'rgba(255,255,255,0.06)';

export const AXIS_STYLE = {
  fontSize: 10,
  fill: 'rgba(208,208,211,0.5)',
} as const;

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
