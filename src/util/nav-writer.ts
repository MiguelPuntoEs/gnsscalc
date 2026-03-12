/**
 * RINEX 3.04 mixed navigation file writer.
 *
 * Produces a standards-compliant RINEX 3.04 nav file from parsed NavResult data.
 */

import { padL, padR, hdrLine } from './rinex-format';
import type {
  NavResult,
  Ephemeris,
  KeplerEphemeris,
  GlonassEphemeris,
} from './nav';

/* ================================================================== */
/*  D19.12 formatter                                                   */
/* ================================================================== */

/**
 * Format a number in RINEX "D19.12" scientific notation.
 *
 * 19 characters wide, 12 decimal digits, explicit exponent sign.
 * Examples:
 *   0.0       → " 0.000000000000E+00"
 *  -1.5e-8    → "-1.500000000000E-08"
 *   5153.71875→ " 5.153718750000E+03"
 */
function fmtD(val: number): string {
  if (val === 0) return ' 0.000000000000E+00';

  const sign = val < 0 ? '-' : ' ';
  const abs = Math.abs(val);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / 10 ** exp;

  // Format mantissa with 12 decimal digits
  const mStr = mantissa.toFixed(12);

  // Exponent sign and two-digit magnitude
  const expSign = exp >= 0 ? '+' : '-';
  const expStr = String(Math.abs(exp)).padStart(2, '0');

  return `${sign}${mStr}E${expSign}${expStr}`;
}

/* ================================================================== */
/*  Date formatting                                                    */
/* ================================================================== */

/** Format a Date for the SV epoch line: "YYYY MM DD HH MM SS" (each field 2-char right-aligned). */
function fmtEpoch(d: Date): string {
  const Y = padR(String(d.getUTCFullYear()), 4);
  const M = padR(String(d.getUTCMonth() + 1), 3);
  const D = padR(String(d.getUTCDate()), 3);
  const h = padR(String(d.getUTCHours()), 3);
  const m = padR(String(d.getUTCMinutes()), 3);
  const s = padR(String(d.getUTCSeconds()), 3);
  return `${Y}${M}${D}${h}${m}${s}`;
}

/* ================================================================== */
/*  Type guard                                                         */
/* ================================================================== */

function isKepler(eph: Ephemeris): eph is KeplerEphemeris {
  return 'af0' in eph;
}

/* ================================================================== */
/*  Header writer                                                      */
/* ================================================================== */

function writeHeader(nav: NavResult): string {
  const lines: string[] = [];

  // Version / Type
  lines.push(
    hdrLine(
      padL('     3.04', 9) +
        '           ' +
        padL('NAVIGATION DATA', 20) +
        padL('M', 20),
      'RINEX VERSION / TYPE',
    ),
  );

  // PGM / RUN BY / DATE
  const now = new Date();
  const dateStr =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    ' ' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    ' UTC';
  lines.push(
    hdrLine(
      padL('GNSSCalc', 20) + padL('', 20) + padL(dateStr, 20),
      'PGM / RUN BY / DATE',
    ),
  );

  // Ionospheric corrections
  const ionoOrder = ['GPSA', 'GPSB', 'GAL', 'BDSA', 'BDSB'];
  for (const key of ionoOrder) {
    const vals = nav.header.ionoCorrections[key];
    if (!vals) continue;
    const valStr = vals.map((v) => fmtD(v)).join('');
    lines.push(hdrLine(padL(key, 5) + valStr, 'IONOSPHERIC CORR'));
  }
  // Any remaining correction types not in the standard order
  for (const key of Object.keys(nav.header.ionoCorrections)) {
    if (ionoOrder.includes(key)) continue;
    const vals = nav.header.ionoCorrections[key];
    if (!vals) continue;
    const valStr = vals.map((v) => fmtD(v)).join('');
    lines.push(hdrLine(padL(key, 5) + valStr, 'IONOSPHERIC CORR'));
  }

  // Leap seconds
  if (nav.header.leapSeconds != null) {
    lines.push(
      hdrLine(padR(String(nav.header.leapSeconds), 6), 'LEAP SECONDS'),
    );
  }

  // End of header
  lines.push(hdrLine('', 'END OF HEADER'));

  return lines.join('\n') + '\n';
}

/* ================================================================== */
/*  Ephemeris record writers                                           */
/* ================================================================== */

/** Build a broadcast orbit line (4-space indent + up to 4 D19.12 values). */
function orbitLine(values: number[]): string {
  return '    ' + values.map(fmtD).join('');
}

function writeKeplerRecord(eph: KeplerEphemeris): string {
  const lines: string[] = [];

  // SV epoch line
  lines.push(
    `${padL(eph.prn, 3)} ${fmtEpoch(eph.tocDate)}${fmtD(eph.af0)}${fmtD(eph.af1)}${fmtD(eph.af2)}`,
  );

  // Broadcast orbit lines 1-7
  lines.push(orbitLine([eph.iode, eph.crs, eph.deltaN, eph.m0]));
  lines.push(orbitLine([eph.cuc, eph.e, eph.cus, eph.sqrtA]));
  lines.push(orbitLine([eph.toe, eph.cic, eph.omega0, eph.cis]));
  lines.push(orbitLine([eph.i0, eph.crc, eph.omega, eph.omegaDot]));
  lines.push(orbitLine([eph.idot, 0, eph.week, 0]));
  lines.push(orbitLine([0, eph.svHealth, eph.tgd, 0]));
  lines.push(orbitLine([eph.toe, 0, 0, 0]));

  return lines.join('\n');
}

function writeGlonassRecord(eph: GlonassEphemeris): string {
  const lines: string[] = [];

  // SV epoch line: -tauN, +gammaN, messageFrameTime
  lines.push(
    `${padL(eph.prn, 3)} ${fmtEpoch(eph.tocDate)}${fmtD(-eph.tauN)}${fmtD(eph.gammaN)}${fmtD(eph.messageFrameTime)}`,
  );

  // Broadcast orbit lines 1-3
  lines.push(orbitLine([eph.x, eph.xDot, eph.xAcc, eph.health]));
  lines.push(orbitLine([eph.y, eph.yDot, eph.yAcc, eph.freqNum]));
  lines.push(orbitLine([eph.z, eph.zDot, eph.zAcc, 0]));

  return lines.join('\n');
}

/* ================================================================== */
/*  Public API                                                         */
/* ================================================================== */

/**
 * Write a RINEX 3.04 mixed navigation file from parsed navigation data.
 *
 * Ephemerides are sorted by PRN then by tocDate.
 */
export function writeRinexNav(nav: NavResult): string {
  const header = writeHeader(nav);

  // Sort ephemerides: by PRN string, then by tocDate
  const sorted = [...nav.ephemerides].sort((a, b) => {
    const prnCmp = a.prn.localeCompare(b.prn);
    if (prnCmp !== 0) return prnCmp;
    return a.tocDate.getTime() - b.tocDate.getTime();
  });

  const records = sorted.map((eph) =>
    isKepler(eph) ? writeKeplerRecord(eph) : writeGlonassRecord(eph),
  );

  return header + records.join('\n') + '\n';
}

/**
 * Trigger a file download in the browser.
 */
export function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
