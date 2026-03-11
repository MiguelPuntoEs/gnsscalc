/**
 * ANTEX 1.4 (Antenna Exchange Format) parser.
 * Parses receiver and satellite antenna calibration files containing
 * Phase Center Offsets (PCO) and Phase Center Variations (PCV).
 */

/* ── Types ────────────────────────────────────────────────────────── */

export interface FrequencyData {
  /** Frequency code, e.g. "G01", "E05" */
  frequency: string;
  /** Phase Center Offset — North/X component (mm) */
  pcoN: number;
  /** Phase Center Offset — East/Y component (mm) */
  pcoE: number;
  /** Phase Center Offset — Up/Z component (mm) */
  pcoU: number;
  /** Non-azimuth-dependent PCV values (mm), length = numZen */
  pcvNoazi: number[];
  /**
   * Azimuth-dependent PCV grid (mm).
   * Rows = azimuths (0..360 step dazi), cols = zenith angles.
   * Empty when dazi === 0 (no azimuth dependence).
   */
  pcv: number[][];
}

export interface AntennaEntry {
  /** Antenna type name (20 chars, e.g. "LEIAR20         LEIM") */
  type: string;
  /** Serial number or satellite code (e.g. "G05", or blank for type-mean) */
  serialNo: string;
  /** SVN code (satellites only, optional) */
  svnCode: string;
  /** COSPAR ID (satellites only, optional) */
  cosparId: string;
  /** Whether this is a satellite antenna (vs receiver) */
  isSatellite: boolean;
  /** Calibration method */
  method: string;
  /** Agency that performed calibration */
  agency: string;
  /** Number of individual antennas calibrated */
  numCalibrated: number;
  /** Calibration date string */
  date: string;
  /** Azimuth increment (degrees). 0 = no azimuth dependence. */
  dazi: number;
  /** Zenith/nadir start angle (degrees) */
  zen1: number;
  /** Zenith/nadir end angle (degrees) */
  zen2: number;
  /** Zenith/nadir increment (degrees) */
  dzen: number;
  /** SINEX code (optional) */
  sinexCode: string;
  /** Valid-from date (optional) */
  validFrom: string;
  /** Valid-until date (optional) */
  validUntil: string;
  /** Per-frequency calibration data */
  frequencies: FrequencyData[];
}

export interface AntexFile {
  /** Format version (e.g. 1.4) */
  version: number;
  /** Satellite system flag ('G','R','E','C','J','S','M') */
  system: string;
  /** PCV type: 'A' (absolute) or 'R' (relative) */
  pcvType: string;
  /** Reference antenna type (for relative values) */
  refAntenna: string;
  /** Header comments */
  comments: string[];
  /** All antenna entries in the file */
  antennas: AntennaEntry[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Read the label from columns 61–80 of an ANTEX line. */
function label(line: string): string {
  return (line.length >= 80 ? line.substring(60, 80) : line.substring(60)).trimEnd();
}

function parseFloat10(s: string): number {
  return parseFloat(s) || 0;
}

function parseFloat8(s: string): number {
  return parseFloat(s) || 0;
}

function parseFloat6(s: string): number {
  return parseFloat(s) || 0;
}

function parseInt6(s: string): number {
  return parseInt(s, 10) || 0;
}

/** Parse a validity date line (5I6,F13.7) into a readable string. */
function parseValidityDate(line: string): string {
  const year = parseInt(line.substring(0, 6), 10);
  const month = parseInt(line.substring(6, 12), 10);
  const day = parseInt(line.substring(12, 18), 10);
  const hour = parseInt(line.substring(18, 24), 10);
  const min = parseInt(line.substring(24, 30), 10);
  if (isNaN(year)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Parse a row of PCV values: 8-char wide fixed-width numbers after an initial offset. */
function parsePcvRow(line: string, offset: number, count: number): number[] {
  const vals: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = offset + i * 8;
    const s = line.substring(start, start + 8);
    vals.push(parseFloat(s) || 0);
  }
  return vals;
}

/* ── Frequency block parser ──────────────────────────────────────── */

function parseFrequencyBlock(
  lines: string[],
  numZen: number,
  hasAzimuth: boolean,
  numAzi: number,
): FrequencyData {
  let frequency = '';
  let pcoN = 0, pcoE = 0, pcoU = 0;
  const pcvNoazi: number[] = [];
  const pcv: number[][] = [];

  for (const line of lines) {
    const lbl = label(line);

    if (lbl === 'START OF FREQUENCY') {
      frequency = line.substring(3, 6).trim();
    } else if (lbl === 'NORTH / EAST / UP') {
      pcoN = parseFloat10(line.substring(0, 10));
      pcoE = parseFloat10(line.substring(10, 20));
      pcoU = parseFloat10(line.substring(20, 30));
    } else if (line.substring(3, 8) === 'NOAZI') {
      pcvNoazi.push(...parsePcvRow(line, 8, numZen));
    } else if (lbl !== 'END OF FREQUENCY' && lbl !== 'START OF FREQUENCY') {
      // Azimuth-dependent row: F8.1 azimuth + mF8.2 values
      if (hasAzimuth && line.length > 8) {
        const row = parsePcvRow(line, 8, numZen);
        pcv.push(row);
      }
    }
  }

  return { frequency, pcoN, pcoE, pcoU, pcvNoazi, pcv };
}

/* ── Main parser ─────────────────────────────────────────────────── */

export function parseAntex(text: string): AntexFile {
  const allLines = text.split(/\r?\n/);

  let version = 0;
  let system = '';
  let pcvType = '';
  let refAntenna = '';
  const comments: string[] = [];
  const antennas: AntennaEntry[] = [];

  let inHeader = true;
  let inAntenna = false;
  let inFreq = false;
  let antennaLines: string[] = [];
  let freqLines: string[] = [];

  // Current antenna state
  let type = '', serialNo = '', svnCode = '', cosparId = '';
  let method = '', agency = '', date = '';
  let numCalibrated = 0;
  let dazi = 0, zen1 = 0, zen2 = 0, dzen = 0;
  let sinexCode = '', validFrom = '', validUntil = '';
  let frequencies: FrequencyData[] = [];
  let isSatellite = false;

  for (const rawLine of allLines) {
    // Pad line to 80 chars for consistent column access
    const line = rawLine.length < 80 ? rawLine.padEnd(80) : rawLine;
    const lbl = label(line);

    if (inHeader) {
      if (lbl === 'ANTEX VERSION / SYST') {
        version = parseFloat(line.substring(0, 8)) || 0;
        system = line.substring(20, 21).trim();
      } else if (lbl === 'PCV TYPE / REFANT') {
        pcvType = line.substring(0, 1).trim();
        refAntenna = line.substring(20, 40).trim();
      } else if (lbl === 'COMMENT') {
        comments.push(line.substring(0, 60).trim());
      } else if (lbl === 'END OF HEADER') {
        inHeader = false;
      }
      continue;
    }

    if (lbl === 'START OF ANTENNA') {
      inAntenna = true;
      antennaLines = [];
      type = ''; serialNo = ''; svnCode = ''; cosparId = '';
      method = ''; agency = ''; date = '';
      numCalibrated = 0;
      dazi = 0; zen1 = 0; zen2 = 0; dzen = 0;
      sinexCode = ''; validFrom = ''; validUntil = '';
      frequencies = [];
      isSatellite = false;
      continue;
    }

    if (!inAntenna) continue;

    if (lbl === 'END OF ANTENNA') {
      antennas.push({
        type, serialNo, svnCode, cosparId, isSatellite,
        method, agency, numCalibrated, date,
        dazi, zen1, zen2, dzen,
        sinexCode, validFrom, validUntil,
        frequencies,
      });
      inAntenna = false;
      continue;
    }

    if (lbl === 'TYPE / SERIAL NO') {
      type = line.substring(0, 20).trim();
      serialNo = line.substring(20, 40).trim();
      svnCode = line.substring(40, 50).trim();
      cosparId = line.substring(50, 60).trim();
      // Satellite antennas have a satellite code like "G05" in serialNo
      isSatellite = /^[GRECIJS]\d{2,3}$/.test(serialNo);
    } else if (lbl === 'METH / BY / # / DATE') {
      method = line.substring(0, 20).trim();
      agency = line.substring(20, 40).trim();
      numCalibrated = parseInt6(line.substring(40, 46));
      date = line.substring(50, 60).trim();
    } else if (lbl === 'DAZI') {
      dazi = parseFloat6(line.substring(2, 8));
    } else if (lbl === 'ZEN1 / ZEN2 / DZEN') {
      zen1 = parseFloat6(line.substring(2, 8));
      zen2 = parseFloat6(line.substring(8, 14));
      dzen = parseFloat6(line.substring(14, 20));
    } else if (lbl === 'SINEX CODE') {
      sinexCode = line.substring(0, 10).trim();
    } else if (lbl === 'VALID FROM') {
      validFrom = parseValidityDate(line);
    } else if (lbl === 'VALID UNTIL') {
      validUntil = parseValidityDate(line);
    } else if (lbl === 'START OF FREQUENCY') {
      inFreq = true;
      freqLines = [line];
    } else if (lbl === 'END OF FREQUENCY') {
      freqLines.push(line);
      inFreq = false;
      const numZen = dzen > 0 ? Math.round((zen2 - zen1) / dzen) + 1 : 0;
      const hasAzimuth = dazi > 0;
      const numAzi = hasAzimuth ? Math.round(360 / dazi) + 1 : 0;
      frequencies.push(parseFrequencyBlock(freqLines, numZen, hasAzimuth, numAzi));
    } else if (lbl === 'START OF FREQ RMS') {
      // Skip RMS sections — continue until END OF FREQ RMS
      inFreq = false; // don't collect into freqLines
    } else if (inFreq) {
      freqLines.push(line);
    }
  }

  return { version, system, pcvType, refAntenna, comments, antennas };
}

/* ── Frequency label mapping ─────────────────────────────────────── */

const FREQ_LABELS: Record<string, string> = {
  G01: 'GPS L1', G02: 'GPS L2', G05: 'GPS L5',
  R01: 'GLO G1', R02: 'GLO G2', R04: 'GLO G1a', R06: 'GLO G2a',
  E01: 'GAL E1', E05: 'GAL E5a', E06: 'GAL E6', E07: 'GAL E5b', E08: 'GAL E5',
  C01: 'BDS B1', C02: 'BDS B1-2', C05: 'BDS B2a', C06: 'BDS B3', C07: 'BDS B2b', C08: 'BDS B2',
  J01: 'QZS L1', J02: 'QZS L2', J05: 'QZS L5', J06: 'QZS LEX',
  S01: 'SBS L1', S05: 'SBS L5',
  I05: 'NIC L5',
};

export function frequencyLabel(code: string): string {
  return FREQ_LABELS[code] ?? code;
}
