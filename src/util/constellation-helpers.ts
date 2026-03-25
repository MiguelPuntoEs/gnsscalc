import type { EphemerisInfo } from 'gnss-js/rtcm3';

/* ── Constants ────────────────────────────────────────────────── */

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const BDS_EPOCH_MS = Date.UTC(2006, 0, 1);

export const CONSTELLATION_SLOTS: Record<
  string,
  { prefix: string; min: number; max: number; padWidth: number; label: string }
> = {
  G: { prefix: 'G', min: 1, max: 32, padWidth: 2, label: 'GPS' },
  E: { prefix: 'E', min: 1, max: 36, padWidth: 2, label: 'Galileo' },
  R: { prefix: 'R', min: 1, max: 28, padWidth: 2, label: 'GLONASS' },
  C: { prefix: 'C', min: 1, max: 63, padWidth: 2, label: 'BeiDou' },
  J: { prefix: 'J', min: 1, max: 10, padWidth: 2, label: 'QZSS' },
  S: { prefix: 'S', min: 120, max: 158, padWidth: 3, label: 'SBAS' },
};

export const SYSTEM_ORDER = ['G', 'E', 'R', 'C', 'J', 'S'] as const;

/** GPS PRN → Block type mapping (source: NAVCEN, March 2026) */
export const GPS_BLOCK: Record<number, string> = {
  1: 'III',
  2: 'IIR',
  3: 'IIF',
  4: 'III',
  5: 'IIR-M',
  6: 'IIF',
  7: 'IIR-M',
  8: 'IIF',
  9: 'IIF',
  10: 'IIF',
  11: 'III',
  12: 'IIR-M',
  13: 'IIR',
  14: 'III',
  15: 'IIR-M',
  16: 'IIR',
  17: 'IIR-M',
  18: 'III',
  19: 'IIR',
  20: 'IIR',
  21: 'III',
  22: 'IIR',
  23: 'III',
  24: 'IIF',
  25: 'IIF',
  26: 'IIF',
  27: 'IIF',
  28: 'III',
  29: 'IIR-M',
  30: 'IIF',
  31: 'IIR-M',
  32: 'IIF',
};

/** QZSS PRN → satellite mapping */
export const QZSS_SAT: Record<number, string> = {
  1: 'QZS-1 (Block I)',
  2: 'QZS-2R (Block II)',
  3: 'QZS-3 (GEO)',
  4: 'QZS-4 (Block II)',
  7: 'QZS-1R (Block II)',
};

/** SBAS PRN → satellite/system mapping */
export const SBAS_SAT: Record<number, string> = {
  120: 'EGNOS (PRN120)',
  121: 'EGNOS (Eutelsat 5WB)',
  122: 'SPAN (Inmarsat 4F2)',
  123: 'EGNOS (ASTRA 5B)',
  124: 'EGNOS',
  125: 'SDCM (Luch-5A)',
  126: 'EGNOS',
  127: 'GAGAN (GSAT-8)',
  128: 'GAGAN (GSAT-10)',
  129: 'MSAS (MTSAT-2)',
  130: 'BDSBAS',
  131: 'WAAS (Eutelsat 117WB)',
  133: 'WAAS (SES-15)',
  135: 'WAAS (Inmarsat 4F3)',
  136: 'EGNOS',
  137: 'MSAS (QZS-3)',
  138: 'WAAS (Anik F1R)',
  140: 'GAGAN (GSAT-15)',
  141: 'SDCM (Luch-5B)',
  143: 'BDSBAS',
  144: 'BDSBAS',
  147: 'KASS',
  148: 'KASS',
};

/** GPS 5-bit signal health codes (IS-GPS-200N Table 20-VIII) */
export const GPS_SIGNAL_HEALTH: Record<number, string> = {
  0: 'All Signals OK',
  1: 'All Signals Weak',
  2: 'All Signals Dead',
  3: 'All Signals — No Data Modulation',
  4: 'L1 P Signal Weak',
  5: 'L1 P Signal Dead',
  6: 'L1 P Signal — No Data Modulation',
  7: 'L2 P Signal Weak',
  8: 'L2 P Signal Dead',
  9: 'L2 P Signal — No Data Modulation',
  10: 'L1C Signal Weak',
  11: 'L1C Signal Dead',
  12: 'L1C Signal — No Data Modulation',
  13: 'L2C Signal Weak',
  14: 'L2C Signal Dead',
  15: 'L2C Signal — No Data Modulation',
  16: 'L1 & L2 P Signal Weak',
  17: 'L1 & L2 P Signal Dead',
  18: 'L1 & L2 P Signal — No Data Modulation',
  19: 'L1 & L2C Signal Weak',
  20: 'L1 & L2C Signal Dead',
  21: 'L1 & L2C Signal — No Data Modulation',
  22: 'L1 Signal Weak',
  23: 'L1 Signal Dead',
  24: 'L1 Signal — No Data Modulation',
  25: 'L2 Signal Weak',
  26: 'L2 Signal Dead',
  27: 'L2 Signal — No Data Modulation',
  28: 'SV Temporarily Out',
  29: 'SV Will Be Temporarily Out',
  30: 'Signals Deformed (URA valid)',
  31: 'Multiple Anomalies',
};

/** Galileo Signal Health Status (Galileo OS SIS ICD Table 84) */
export const GAL_SHS: Record<number, string> = {
  0: 'Signal OK',
  1: 'Signal Out of Service',
  2: 'Extended Operations Mode',
  3: 'Signal in Test',
};

/** Ephemeris validity periods per constellation (from ICDs) */
export const VALIDITY_MS: Record<string, number> = {
  G: 2 * 3600_000, // GPS: 2 hours (IS-GPS-200N)
  E: 4 * 3600_000, // Galileo: 4 hours (OS SIS ICD)
  R: 30 * 60_000, // GLONASS: 30 minutes (ICD-GLONASS)
  C: 1 * 3600_000, // BeiDou: 1 hour (BDS-SIS-ICD)
  J: 2 * 3600_000, // QZSS: 2 hours (IS-QZSS-PNT-006)
  S: 10 * 60_000, // SBAS: ~10 minutes
};

/* ── Classification functions ─────────────────────────────────── */

/** BeiDou PRN → generation/orbit mapping */
export function bdsGeneration(prn: number): string {
  if (prn >= 1 && prn <= 5) return 'BDS-2 GEO';
  if (prn >= 6 && prn <= 10) return 'BDS-2 IGSO';
  if (prn >= 11 && prn <= 14) return 'BDS-2 MEO';
  if (prn === 16) return 'BDS-2 IGSO';
  if (prn >= 19 && prn <= 37) return 'BDS-3 MEO';
  if (prn >= 38 && prn <= 40) return 'BDS-3 IGSO';
  if (prn >= 41 && prn <= 46) return 'BDS-3 MEO';
  if (prn >= 56 && prn <= 63) return 'BDS-3';
  return '—';
}

/** Galileo PRN → generation mapping */
export function galGeneration(prn: number): string {
  if ([11, 12, 19, 20].includes(prn)) return 'IOV';
  if ([14, 18].includes(prn)) return 'FOC (eccentric)';
  return 'FOC';
}

/** Galileo Data Validity Status (Galileo OS SIS ICD Table 81) */
export function galDvs(v: number | undefined): string {
  if (v === undefined) return '—';
  return v === 0 ? 'Valid' : 'No guarantee';
}

/** SBAS PRN → system group (for filtering) */
export function sbasSystem(prn: number): string {
  if ([120, 121, 123, 124, 126, 136].includes(prn)) return 'EGNOS';
  if ([131, 133, 135, 138].includes(prn)) return 'WAAS';
  if ([127, 128, 140].includes(prn)) return 'GAGAN';
  if ([129, 137].includes(prn)) return 'MSAS';
  if ([125, 141].includes(prn)) return 'SDCM';
  if ([130, 143, 144].includes(prn)) return 'BDSBAS';
  if ([147, 148].includes(prn)) return 'KASS';
  if (prn === 122) return 'SPAN';
  return 'Other';
}

/** BeiDou PRN → filter group */
export function bdsGroup(prn: number): string {
  if (prn >= 1 && prn <= 5) return 'GEO';
  if ((prn >= 6 && prn <= 10) || prn === 16) return 'IGSO';
  if (prn >= 11 && prn <= 14) return 'MEO (BDS-2)';
  if (prn >= 38 && prn <= 40) return 'IGSO (BDS-3)';
  if ((prn >= 19 && prn <= 37) || (prn >= 41 && prn <= 46))
    return 'MEO (BDS-3)';
  if (prn >= 56 && prn <= 63) return 'BDS-3';
  return 'Other';
}

/** GPS PRN → block group (for filtering) */
export function gpsGroup(prn: number): string {
  return GPS_BLOCK[prn] ?? 'Unknown';
}

/** GLONASS satellite type group (for filtering) */
export function glonassGroup(eph: EphemerisInfo): string {
  if (eph.satType === 1) return 'GLONASS-M';
  if (eph.satType === 0) return 'GLONASS';
  return 'Unknown';
}

/** Galileo PRN → filter group */
export function galGroup(prn: number): string {
  if ([14, 18].includes(prn)) return 'FOC (eccentric)';
  if ([11, 12, 19, 20].includes(prn)) return 'IOV';
  return 'FOC';
}

/** QZSS PRN → filter group */
export function qzssGroup(prn: number): string {
  if (prn === 3) return 'GEO';
  return 'QZO';
}

/** Get available filter groups for a constellation */
export function getFilterGroups(
  sys: string,
  satellites: Map<string, EphemerisInfo>,
): string[] {
  const groups = new Set<string>();
  for (const [prn, eph] of satellites) {
    if (!prn.startsWith(sys)) continue;
    const num = parseInt(prn.slice(1), 10);
    if (sys === 'G') groups.add(gpsGroup(num));
    else if (sys === 'E') groups.add(galGroup(num));
    else if (sys === 'R') groups.add(glonassGroup(eph));
    else if (sys === 'C') groups.add(bdsGroup(num));
    else if (sys === 'J') groups.add(qzssGroup(num));
    else if (sys === 'S') groups.add(sbasSystem(num));
  }
  if (sys === 'G')
    return ['IIR', 'IIR-M', 'IIF', 'III'].filter((g) => groups.has(g));
  if (sys === 'E')
    return ['IOV', 'FOC', 'FOC (eccentric)'].filter((g) => groups.has(g));
  if (sys === 'R') return ['GLONASS', 'GLONASS-M'].filter((g) => groups.has(g));
  if (sys === 'C')
    return [
      'GEO',
      'IGSO',
      'IGSO (BDS-3)',
      'MEO (BDS-2)',
      'MEO (BDS-3)',
      'BDS-3',
    ].filter((g) => groups.has(g));
  if (sys === 'J') return ['QZO', 'GEO'].filter((g) => groups.has(g));
  if (sys === 'S')
    return [
      'EGNOS',
      'WAAS',
      'GAGAN',
      'MSAS',
      'SDCM',
      'BDSBAS',
      'KASS',
      'SPAN',
    ].filter((g) => groups.has(g));
  return [];
}

/** Check if a PRN matches the active filter */
export function matchesFilter(
  prn: string,
  filter: string | null,
  satellites: Map<string, EphemerisInfo>,
): boolean {
  if (!filter) return true;
  const sys = prn.charAt(0);
  const num = parseInt(prn.slice(1), 10);
  if (sys === 'G') return gpsGroup(num) === filter;
  if (sys === 'E') return galGroup(num) === filter;
  if (sys === 'R') {
    const eph = satellites.get(prn);
    return eph ? glonassGroup(eph) === filter : false;
  }
  if (sys === 'C') return bdsGroup(num) === filter;
  if (sys === 'J') return qzssGroup(num) === filter;
  if (sys === 'S') return sbasSystem(num) === filter;
  return true;
}

/* ── Ephemeris helpers ────────────────────────────────────────── */

/** Check if ephemeris has expired based on constellation-specific validity period. */
export function isEphExpired(eph: EphemerisInfo): boolean {
  const sys = eph.prn.charAt(0);
  const validity = VALIDITY_MS[sys] ?? 2 * 3600_000;
  return Date.now() - eph.lastReceived > validity;
}

/**
 * Determine if a satellite is healthy based on constellation-specific rules.
 * GPS:  MSB=0 & 5-bit signal code=0 → healthy (IS-GPS-200N §20.3.3.3.1.4)
 * QZSS: only the MSB (bit 5) indicates L1 health (IS-QZSS-PNT-006 Table 4.1.2-5-1)
 * Galileo: SHS 2-bit field, 0 = OK (Galileo OS SIS ICD Table 84)
 * Others: 0 = healthy
 */
export function isSatHealthy(eph: EphemerisInfo): boolean {
  const sys = eph.prn.charAt(0);
  if (sys === 'J') return (eph.health & 0b100000) === 0; // MSB only
  return eph.health === 0;
}

export function ephDate(eph: EphemerisInfo): Date | null {
  const sys = eph.prn.charAt(0);
  if (sys === 'R' && eph.tb !== undefined) {
    // tb is already in minutes (decoder multiplies by 15), Moscow time
    const now = new Date(eph.lastReceived);
    const utcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return new Date(utcMidnight + (eph.tb * 60 - 3 * 3600) * 1000);
  }
  if (sys === 'S' && eph.toc !== undefined) {
    const now = new Date(eph.lastReceived);
    const utcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return new Date(utcMidnight + eph.toc * 1000);
  }
  if (eph.week !== undefined && eph.toe !== undefined) {
    const epoch = sys === 'C' ? BDS_EPOCH_MS : GPS_EPOCH_MS;
    let week = eph.week;
    // GPS (1019) and QZSS (1044) transmit a 10-bit week that rolls over at 1024.
    // Resolve to the current rollover cycle based on the current GPS week.
    if (sys === 'G' || sys === 'J') {
      const currentGpsWeek = Math.floor(
        (Date.now() - GPS_EPOCH_MS) / (7 * 86400_000),
      );
      const rollover = Math.floor(currentGpsWeek / 1024) * 1024;
      week += rollover;
      // If the resolved week is more than 512 weeks in the future, it's from the previous cycle
      if (week > currentGpsWeek + 512) week -= 1024;
    }
    return new Date(epoch + week * 7 * 86400_000 + eph.toe * 1000);
  }
  return null;
}

/* ── Formatting helpers ───────────────────────────────────────── */

export function formatAge(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${(seconds / 3600).toFixed(1)}h ago`;
}

export function formatEphTime(d: Date | null): string {
  if (!d) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatEphDateFull(d: Date | null): string {
  if (!d) return '—';
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}

export function fmtSec(s: number | undefined): string {
  if (s === undefined) return '—';
  return `${s.toFixed(0)} s`;
}

export function fmtSci(v: number | undefined, digits = 4): string {
  if (v === undefined) return '—';
  if (v === 0) return '0';
  return v.toExponential(digits);
}

export function fmtDeg(rad: number | undefined): string {
  if (rad === undefined) return '—';
  return `${((rad * 180) / Math.PI).toFixed(6)}°`;
}

export function fmtM(v: number | undefined): string {
  if (v === undefined) return '—';
  return `${v.toFixed(4)} m`;
}
