/**
 * GNSS signal definitions for PSD spectrum rendering.
 * Frequencies in MHz, chip rates relative to f0 = 1.023 MHz.
 */

/* ── Frequency constants (MHz) ───────────────────────────────── */

// GPS
export const FREQ_GPS_L1 = 1575.42;
export const FREQ_GPS_L2 = 1227.6;
export const FREQ_GPS_L5 = 1176.45;

// GLONASS FDMA
export const FREQ_GLO_L1 = 1602.0;
export const FREQ_GLO_L2 = 1246.0;
export const DELTA_GLO_L1 = 0.5625;
export const DELTA_GLO_L2 = 0.4375;

// GLONASS CDMA
export const FREQ_GLO_L1OC = 1600.995;
export const FREQ_GLO_L2OC = 1248.06;
export const FREQ_GLO_L3OC = 1202.025;

// Galileo
export const FREQ_GAL_E1 = 1575.42;
export const FREQ_GAL_E5 = 1191.795;
export const FREQ_GAL_E5a = 1176.45;
export const FREQ_GAL_E5b = 1207.14;
export const FREQ_GAL_E6 = 1278.75;

// BeiDou-2
export const FREQ_BDS_B1I = 1561.098;
export const FREQ_BDS_B2I = 1207.14;
export const FREQ_BDS_B3I = 1268.52;

// BeiDou-3
export const FREQ_BDS_B1A = 1575.42;
export const FREQ_BDS_B1C = 1575.42;
export const FREQ_BDS_B3A = 1268.52;

// QZSS
export const FREQ_QZS_L1 = 1575.42;
export const FREQ_QZS_L2 = 1227.6;
export const FREQ_QZS_L5 = 1176.45;
export const FREQ_QZS_L6 = 1278.75;

// NavIC
export const FREQ_NAVIC_L5 = 1176.45;

/* ── Signal type definitions ─────────────────────────────────── */

export type Modulation = 'BPSK' | 'BOCs' | 'BOCc' | 'AltBOC' | 'composite';

export interface SignalDef {
  /** Parent constellation key */
  constellation: string;
  /** Display label (e.g. "L1 C/A") */
  label: string;
  /** Center frequency in MHz */
  centerMHz: number;
  /** Modulation type */
  modulation: Modulation;
  /** Modulation parameters: [n] for BPSK, [m, n] for BOC/AltBOC */
  params: number[];
  /** Half-span in f0 chips for the frequency sweep */
  halfSpanChips: number;
  /** Fill color */
  color: string;
  /** Draw direction: 'up' for I/data components, 'down' for Q/pilot components */
  direction: 'up' | 'down';
  /** Optional: composite PSD function coefficients for weighted sums */
  composite?: {
    weights: number[];
    modulations: Modulation[];
    paramSets: number[][];
  };
}

/* ── Constellation row definitions ───────────────────────────── */

export interface ConstellationRow {
  key: string;
  label: string;
  color: string;
  signals: SignalDef[];
}

const GPS_COLOR = '#4ade80';
const GPS_M_COLOR = '#ef4444';
const GPS_P_COLOR = '#dbc51f';
const GPS_CA_COLOR = '#06b6d4';

const GLO_P_COLOR = '#ef4444';
const GLO_CA_COLOR = '#22c55e';
const GLO_OC_COLOR = '#22c55e';
const GLO_SC_COLOR = '#ef4444';

const GAL_OS_COLOR = '#22c55e';
const GAL_PRS_COLOR = '#ef4444';
const GAL_E5_COLOR = '#3399ff';
const GAL_E5_Q_COLOR = '#2879c9';

const BDS2_I_COLOR = '#22c55e';
const BDS2_Q_COLOR = '#ef4444';

const BDS3_AUTH_COLOR = '#ef4444';
const BDS3_OS_COLOR = '#22c55e';
const BDS3_E5_COLOR = '#3399ff';
const BDS3_E5_Q_COLOR = '#2879c9';

const QZS_COLOR = '#22c55e';
const QZS_S_COLOR = '#3399ff';
const QZS_Q_COLOR = '#2d8124';
const QZS_SQ_COLOR = '#2879c9';

const NAVIC_SPS_COLOR = '#22c55e';
const NAVIC_RS_COLOR = '#ef4444';

export const CONSTELLATIONS: ConstellationRow[] = [
  {
    key: 'GPS', label: 'GPS', color: GPS_COLOR,
    signals: [
      // L1 — I channel: P(Y), M-code, L1Cd (data), L1Cp (pilot)
      { constellation: 'GPS', label: 'L1 P(Y)', centerMHz: FREQ_GPS_L1, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: GPS_P_COLOR, direction: 'up' },
      { constellation: 'GPS', label: 'L1M', centerMHz: FREQ_GPS_L1, modulation: 'BOCs', params: [10, 5], halfSpanChips: 20, color: GPS_M_COLOR, direction: 'up' },
      { constellation: 'GPS', label: 'L1Cd', centerMHz: FREQ_GPS_L1, modulation: 'BOCs', params: [1, 1], halfSpanChips: 20, color: GPS_COLOR, direction: 'up' },
      // L1 — Q channel: C/A; L1Cp shown down for visual separation
      {
        constellation: 'GPS', label: 'L1Cp', centerMHz: FREQ_GPS_L1, modulation: 'composite', params: [],
        halfSpanChips: 20, color: GPS_COLOR, direction: 'down',
        composite: {
          weights: [Math.sqrt(29 / 33), Math.sqrt(4 / 33)],
          modulations: ['BOCs', 'BOCs'],
          paramSets: [[1, 1], [6, 1]],
        },
      },
      { constellation: 'GPS', label: 'L1 C/A', centerMHz: FREQ_GPS_L1, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: GPS_CA_COLOR, direction: 'down' },
      // L2 — I channel: P(Y)
      { constellation: 'GPS', label: 'L2 P(Y)', centerMHz: FREQ_GPS_L2, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: GPS_P_COLOR, direction: 'up' },
      { constellation: 'GPS', label: 'L2M', centerMHz: FREQ_GPS_L2, modulation: 'BOCs', params: [10, 5], halfSpanChips: 20, color: GPS_M_COLOR, direction: 'down' },
      // L2 — Q channel: L2C
      { constellation: 'GPS', label: 'L2C', centerMHz: FREQ_GPS_L2, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: GPS_COLOR, direction: 'down' },
      // L5 — up (I) and down (Q)
      { constellation: 'GPS', label: 'L5-I', centerMHz: FREQ_GPS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: GPS_COLOR, direction: 'up' },
      { constellation: 'GPS', label: 'L5-Q', centerMHz: FREQ_GPS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_Q_COLOR, direction: 'down' },
    ],
  },
  {
    key: 'GLO_FDMA', label: 'GLO FDMA', color: '#f87171',
    signals: [
      // L1 P (up) and C/A (down)
      ...Array.from({ length: 15 }, (_, i) => i - 7).map((k): SignalDef => ({
        constellation: 'GLO_FDMA', label: `L1P k=${k}`, centerMHz: FREQ_GLO_L1 + k * DELTA_GLO_L1,
        modulation: 'BPSK', params: [5.11], halfSpanChips: 5.11, color: GLO_P_COLOR, direction: 'up',
      })),
      ...Array.from({ length: 15 }, (_, i) => i - 7).map((k): SignalDef => ({
        constellation: 'GLO_FDMA', label: `L1 C/A k=${k}`, centerMHz: FREQ_GLO_L1 + k * DELTA_GLO_L1,
        modulation: 'BPSK', params: [0.511], halfSpanChips: 0.511, color: GLO_CA_COLOR, direction: 'down',
      })),
      // L2 P (up) and C/A (down)
      ...Array.from({ length: 15 }, (_, i) => i - 7).map((k): SignalDef => ({
        constellation: 'GLO_FDMA', label: `L2P k=${k}`, centerMHz: FREQ_GLO_L2 + k * DELTA_GLO_L2,
        modulation: 'BPSK', params: [5.11], halfSpanChips: 5.11, color: GLO_P_COLOR, direction: 'up',
      })),
      ...Array.from({ length: 15 }, (_, i) => i - 7).map((k): SignalDef => ({
        constellation: 'GLO_FDMA', label: `L2 C/A k=${k}`, centerMHz: FREQ_GLO_L2 + k * DELTA_GLO_L2,
        modulation: 'BPSK', params: [0.511], halfSpanChips: 0.511, color: GLO_CA_COLOR, direction: 'down',
      })),
    ],
  },
  {
    key: 'GLO_CDMA', label: 'GLO CDMA', color: '#f87171',
    signals: [
      // L1OC (up), L1SC (down)
      { constellation: 'GLO_CDMA', label: 'L1OC', centerMHz: FREQ_GLO_L1OC, modulation: 'BOCs', params: [1, 1], halfSpanChips: 20, color: GLO_OC_COLOR, direction: 'up' },
      { constellation: 'GLO_CDMA', label: 'L1SC', centerMHz: FREQ_GLO_L1OC, modulation: 'BOCs', params: [5, 2.5], halfSpanChips: 20, color: GLO_SC_COLOR, direction: 'down' },
      // L2OC (up), L2SC (down)
      { constellation: 'GLO_CDMA', label: 'L2OC', centerMHz: FREQ_GLO_L2OC, modulation: 'BOCs', params: [1, 1], halfSpanChips: 20, color: GLO_OC_COLOR, direction: 'up' },
      { constellation: 'GLO_CDMA', label: 'L2SC', centerMHz: FREQ_GLO_L2OC, modulation: 'BOCs', params: [5, 2.5], halfSpanChips: 20, color: GLO_SC_COLOR, direction: 'down' },
      // L3 I (up), Q (down)
      { constellation: 'GLO_CDMA', label: 'L3-I', centerMHz: FREQ_GLO_L3OC, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: GLO_OC_COLOR, direction: 'up' },
      { constellation: 'GLO_CDMA', label: 'L3-Q', centerMHz: FREQ_GLO_L3OC, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_Q_COLOR, direction: 'down' },
    ],
  },
  {
    key: 'GAL', label: 'Galileo', color: '#60a5fa',
    signals: [
      // E1 OS (up — CBOC), E1 PRS (down)
      {
        constellation: 'GAL', label: 'E1B/E1C', centerMHz: FREQ_GAL_E1, modulation: 'composite', params: [],
        halfSpanChips: 20, color: GAL_OS_COLOR, direction: 'up',
        composite: {
          weights: [Math.sqrt(10 / 11), Math.sqrt(1 / 11)],
          modulations: ['BOCs', 'BOCs'],
          paramSets: [[1, 1], [6, 1]],
        },
      },
      { constellation: 'GAL', label: 'E1A', centerMHz: FREQ_GAL_E1, modulation: 'BOCc', params: [15, 2.5], halfSpanChips: 20, color: GAL_PRS_COLOR, direction: 'down' },
      // E6 OS (up), E6 PRS (down)
      { constellation: 'GAL', label: 'E6B/E6C', centerMHz: FREQ_GAL_E6, modulation: 'BPSK', params: [5], halfSpanChips: 20, color: GAL_OS_COLOR, direction: 'up' },
      { constellation: 'GAL', label: 'E6A', centerMHz: FREQ_GAL_E6, modulation: 'BOCc', params: [10, 5], halfSpanChips: 20, color: GAL_PRS_COLOR, direction: 'down' },
      // E5 AltBOC — I (up), Q (down)
      { constellation: 'GAL', label: 'E5a-I / E5b-I', centerMHz: FREQ_GAL_E5, modulation: 'AltBOC', params: [15, 10], halfSpanChips: 35, color: GAL_E5_COLOR, direction: 'up' },
      { constellation: 'GAL', label: 'E5a-Q / E5b-Q', centerMHz: FREQ_GAL_E5, modulation: 'AltBOC', params: [15, 10], halfSpanChips: 35, color: GAL_E5_Q_COLOR, direction: 'down' },
    ],
  },
  {
    key: 'BDS2', label: 'BeiDou-2', color: '#fbbf24',
    signals: [
      // B1 I (up), Q (down)
      { constellation: 'BDS2', label: 'B1I', centerMHz: FREQ_BDS_B1I, modulation: 'BPSK', params: [2], halfSpanChips: 20, color: BDS2_I_COLOR, direction: 'up' },
      { constellation: 'BDS2', label: 'B1Q', centerMHz: FREQ_BDS_B1I, modulation: 'BPSK', params: [2], halfSpanChips: 20, color: BDS2_Q_COLOR, direction: 'down' },
      // B3 I (up), Q (down)
      { constellation: 'BDS2', label: 'B3I', centerMHz: FREQ_BDS_B3I, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: BDS2_I_COLOR, direction: 'up' },
      { constellation: 'BDS2', label: 'B3Q', centerMHz: FREQ_BDS_B3I, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: BDS2_Q_COLOR, direction: 'down' },
      // B2 I (up), Q (down)
      { constellation: 'BDS2', label: 'B2I', centerMHz: FREQ_BDS_B2I, modulation: 'BPSK', params: [2], halfSpanChips: 20, color: BDS2_I_COLOR, direction: 'up' },
      { constellation: 'BDS2', label: 'B2Q', centerMHz: FREQ_BDS_B2I, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: BDS2_Q_COLOR, direction: 'down' },
    ],
  },
  {
    key: 'BDS3', label: 'BeiDou-3', color: '#fbbf24',
    signals: [
      // B1A (up + down, same modulation)
      { constellation: 'BDS3', label: 'B1A', centerMHz: FREQ_BDS_B1A, modulation: 'BOCs', params: [14, 2], halfSpanChips: 20, color: BDS3_AUTH_COLOR, direction: 'up' },
      { constellation: 'BDS3', label: 'B1A', centerMHz: FREQ_BDS_B1A, modulation: 'BOCs', params: [14, 2], halfSpanChips: 20, color: BDS3_AUTH_COLOR, direction: 'down' },
      // B1C data (up), pilot (down)
      { constellation: 'BDS3', label: 'B1Cd', centerMHz: FREQ_BDS_B1C, modulation: 'BOCs', params: [1, 1], halfSpanChips: 20, color: BDS3_OS_COLOR, direction: 'up' },
      {
        constellation: 'BDS3', label: 'B1Cp', centerMHz: FREQ_BDS_B1C, modulation: 'composite', params: [],
        halfSpanChips: 20, color: BDS3_OS_COLOR, direction: 'down',
        composite: {
          weights: [Math.sqrt(29 / 33), Math.sqrt(4 / 33)],
          modulations: ['BOCs', 'BOCs'],
          paramSets: [[1, 1], [6, 1]],
        },
      },
      // B3A (up only)
      { constellation: 'BDS3', label: 'B3A', centerMHz: FREQ_BDS_B3A, modulation: 'BOCs', params: [15, 2.5], halfSpanChips: 20, color: BDS3_AUTH_COLOR, direction: 'up' },
      // B2a/B2b AltBOC — I (up), Q (down)
      { constellation: 'BDS3', label: 'B2a-I / B2b-I', centerMHz: FREQ_GAL_E5, modulation: 'AltBOC', params: [15, 10], halfSpanChips: 35, color: BDS3_E5_COLOR, direction: 'up' },
      { constellation: 'BDS3', label: 'B2a-Q / B2b-Q', centerMHz: FREQ_GAL_E5, modulation: 'AltBOC', params: [15, 10], halfSpanChips: 35, color: BDS3_E5_Q_COLOR, direction: 'down' },
    ],
  },
  {
    key: 'QZSS', label: 'QZSS', color: '#a78bfa',
    signals: [
      // L1 — I: L1Cd, L1Cp, L1S; Q: L1C/A
      { constellation: 'QZSS', label: 'L1Cd', centerMHz: FREQ_QZS_L1, modulation: 'BOCs', params: [1, 1], halfSpanChips: 20, color: QZS_COLOR, direction: 'up' },
      {
        constellation: 'QZSS', label: 'L1Cp', centerMHz: FREQ_QZS_L1, modulation: 'composite', params: [],
        halfSpanChips: 20, color: '#06b6d4', direction: 'up',
        composite: {
          weights: [Math.sqrt(29 / 33), Math.sqrt(4 / 33)],
          modulations: ['BOCs', 'BOCs'],
          paramSets: [[1, 1], [6, 1]],
        },
      },
      { constellation: 'QZSS', label: 'L1S', centerMHz: FREQ_QZS_L1, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: QZS_S_COLOR, direction: 'up' },
      { constellation: 'QZSS', label: 'L1 C/A', centerMHz: FREQ_QZS_L1, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: QZS_COLOR, direction: 'down' },
      // L2C (up only)
      { constellation: 'QZSS', label: 'L2C', centerMHz: FREQ_QZS_L2, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: QZS_COLOR, direction: 'down' },
      // L5 — I (up), Q (down)
      { constellation: 'QZSS', label: 'L5-I', centerMHz: FREQ_QZS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_COLOR, direction: 'up' },
      { constellation: 'QZSS', label: 'L5-Q', centerMHz: FREQ_QZS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_Q_COLOR, direction: 'down' },
      // L5S — I (up), Q (down) — slightly lower power
      { constellation: 'QZSS', label: 'L5S-I', centerMHz: FREQ_QZS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_S_COLOR, direction: 'up' },
      { constellation: 'QZSS', label: 'L5S-Q', centerMHz: FREQ_QZS_L5, modulation: 'BPSK', params: [10], halfSpanChips: 20, color: QZS_SQ_COLOR, direction: 'down' },
      // L6 (up only)
      { constellation: 'QZSS', label: 'L6', centerMHz: FREQ_QZS_L6, modulation: 'BPSK', params: [5], halfSpanChips: 20, color: QZS_COLOR, direction: 'up' },
    ],
  },
  {
    key: 'NavIC', label: 'NavIC', color: '#fb923c',
    signals: [
      // L5 SPS (up), RS (down)
      { constellation: 'NavIC', label: 'L5 SPS', centerMHz: FREQ_NAVIC_L5, modulation: 'BPSK', params: [1], halfSpanChips: 20, color: NAVIC_SPS_COLOR, direction: 'up' },
      { constellation: 'NavIC', label: 'L5 RS', centerMHz: FREQ_NAVIC_L5, modulation: 'BOCs', params: [5, 2], halfSpanChips: 20, color: NAVIC_RS_COLOR, direction: 'down' },
    ],
  },
];

/* ── Band presets ─────────────────────────────────────────────── */

export interface BandPreset {
  label: string;
  minMHz: number;
  maxMHz: number;
}

export const BAND_PRESETS: BandPreset[] = [
  { label: 'Full L-Band', minMHz: 1150, maxMHz: 1630 },
  { label: 'Upper L-Band', minMHz: 1530, maxMHz: 1630 },
  { label: 'Lower L-Band', minMHz: 1150, maxMHz: 1310 },
  { label: 'L1 / E1', minMHz: 1555, maxMHz: 1605 },
  { label: 'L6 / E6', minMHz: 1255, maxMHz: 1305 },
  { label: 'L5 / E5', minMHz: 1155, maxMHz: 1220 },
];
