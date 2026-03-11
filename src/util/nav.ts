/**
 * RINEX 3.x/4.x navigation file parser.
 * Parses GPS, Galileo, BeiDou (Keplerian), and GLONASS (state vector) ephemerides.
 */

/* ================================================================== */
/*  Public types                                                       */
/* ================================================================== */

export interface NavHeader {
  version: number;
  type: string;
  leapSeconds: number | null;
  ionoCorrections: Record<string, number[]>;
}

/** GPS / Galileo / BeiDou / QZSS / NavIC Keplerian ephemeris */
export interface KeplerEphemeris {
  system: 'G' | 'E' | 'C' | 'J' | 'I';
  prn: string;           // e.g. "G14"
  toc: number;           // epoch of clock (seconds of GPS week)
  tocDate: Date;
  af0: number;           // clock bias (s)
  af1: number;           // clock drift (s/s)
  af2: number;           // clock drift rate (s/s²)
  // Orbit parameters
  iode: number;
  crs: number;           // m
  deltaN: number;        // rad/s
  m0: number;            // rad
  cuc: number;           // rad
  e: number;             // eccentricity
  cus: number;           // rad
  sqrtA: number;         // m^1/2
  toe: number;           // seconds of GPS week
  cic: number;           // rad
  omega0: number;        // rad (right ascension)
  cis: number;           // rad
  i0: number;            // rad (inclination)
  crc: number;           // m
  omega: number;         // rad (argument of perigee)
  omegaDot: number;      // rad/s
  idot: number;          // rad/s
  week: number;          // GPS week
  svHealth: number;
  tgd: number;           // s
}

/** GLONASS / SBAS state-vector ephemeris */
export interface GlonassEphemeris {
  system: 'R' | 'S';
  prn: string;
  tocDate: Date;
  tauN: number;          // clock bias (s)
  gammaN: number;        // frequency bias
  messageFrameTime: number;
  x: number; xDot: number; xAcc: number;   // km, km/s, km/s²
  y: number; yDot: number; yAcc: number;
  z: number; zDot: number; zAcc: number;
  health: number;
  freqNum: number;
}

export type Ephemeris = KeplerEphemeris | GlonassEphemeris;

export interface NavResult {
  header: NavHeader;
  ephemerides: Ephemeris[];
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

// Lines per record (after epoch line) for each system
const DATA_LINES: Record<string, number> = {
  G: 7, E: 7, C: 7, J: 7, // Keplerian
  R: 3,                     // GLONASS state vector
  S: 3, I: 7,               // SBAS / NavIC
};

/* ================================================================== */
/*  Parser                                                             */
/* ================================================================== */

function parseFloat19(s: string): number {
  // RINEX uses 'D' for exponent in some files
  return parseFloat(s.trim().replace(/[dD]/g, 'E'));
}

function parseNavEpoch(line: string): { prn: string; date: Date; values: number[] } {
  const prn = line.substring(0, 3).trim();
  const yr = parseInt(line.substring(3, 8));
  const mo = parseInt(line.substring(8, 11));
  const dy = parseInt(line.substring(11, 14));
  const hr = parseInt(line.substring(14, 17));
  const mn = parseInt(line.substring(17, 20));
  const sc = parseInt(line.substring(20, 23));
  const date = new Date(Date.UTC(yr, mo - 1, dy, hr, mn, sc));

  const values: number[] = [];
  // 3 values on epoch line, starting at col 23, each 19 chars
  for (let i = 0; i < 3; i++) {
    const start = 23 + i * 19;
    if (start < line.length) {
      values.push(parseFloat19(line.substring(start, start + 19)));
    }
  }
  return { prn, date, values };
}

function parseDataLine(line: string): number[] {
  const values: number[] = [];
  // 4 values per line, each 19 chars, starting at col 4
  for (let i = 0; i < 4; i++) {
    const start = 4 + i * 19;
    if (start >= line.length) break;
    const s = line.substring(start, start + 19).trim();
    if (s.length > 0) {
      const v = parseFloat19(s);
      values.push(Number.isFinite(v) ? v : 0);
    }
  }
  return values;
}

function buildKeplerEphemeris(
  sys: 'G' | 'E' | 'C' | 'J' | 'I',
  prn: string,
  date: Date,
  epochVals: number[],
  data: number[][],
): KeplerEphemeris {
  // Flatten data lines
  const d = data.flat();
  return {
    system: sys,
    prn,
    tocDate: date,
    toc: (date.getTime() / 1000) % (7 * 86400), // seconds of week approx
    af0: epochVals[0] ?? 0,
    af1: epochVals[1] ?? 0,
    af2: epochVals[2] ?? 0,
    iode: d[0] ?? 0,
    crs: d[1] ?? 0,
    deltaN: d[2] ?? 0,
    m0: d[3] ?? 0,
    cuc: d[4] ?? 0,
    e: d[5] ?? 0,
    cus: d[6] ?? 0,
    sqrtA: d[7] ?? 0,
    toe: d[8] ?? 0,
    cic: d[9] ?? 0,
    omega0: d[10] ?? 0,
    cis: d[11] ?? 0,
    i0: d[12] ?? 0,
    crc: d[13] ?? 0,
    omega: d[14] ?? 0,
    omegaDot: d[15] ?? 0,
    idot: d[16] ?? 0,
    // d[17] = codes on L2 (GPS) or data sources (GAL)
    week: d[18] ?? 0,
    // d[19] = L2P flag (GPS) or spare
    svHealth: d[20] ?? 0,
    // d[21] = 0 (spare) for GAL, or IODC for GPS
    tgd: d[22] ?? 0,
    // d[23] = BGD (GAL) or IODC (GPS)
  };
}

function buildStateVectorEphemeris(
  sys: 'R' | 'S',
  prn: string,
  date: Date,
  epochVals: number[],
  data: number[][],
): GlonassEphemeris {
  const d = data.flat();
  return {
    system: sys,
    prn,
    tocDate: date,
    tauN: epochVals[0] ?? 0,
    gammaN: epochVals[1] ?? 0,
    messageFrameTime: epochVals[2] ?? 0,
    x: d[0] ?? 0,
    xDot: d[1] ?? 0,
    xAcc: d[2] ?? 0,
    health: d[3] ?? 0,
    y: d[4] ?? 0,
    yDot: d[5] ?? 0,
    yAcc: d[6] ?? 0,
    freqNum: d[7] ?? 0,
    z: d[8] ?? 0,
    zDot: d[9] ?? 0,
    zAcc: d[10] ?? 0,
  };
}

export function parseNavFile(text: string): NavResult {
  const lines = text.split('\n');
  const header: NavHeader = {
    version: 0,
    type: '',
    leapSeconds: null,
    ionoCorrections: {},
  };
  const ephemerides: Ephemeris[] = [];

  let inHeader = true;
  let i = 0;

  // Parse header
  while (i < lines.length) {
    const line = lines[i]!;
    const label = line.substring(60).trim();

    if (label === 'END OF HEADER') {
      inHeader = false;
      i++;
      break;
    }

    if (label === 'RINEX VERSION / TYPE') {
      header.version = parseFloat(line.substring(0, 9));
      header.type = line.substring(20, 40).trim();
    } else if (label === 'LEAP SECONDS') {
      header.leapSeconds = parseInt(line.substring(0, 6));
    } else if (label === 'IONOSPHERIC CORR') {
      const corrType = line.substring(0, 4).trim();
      const vals: number[] = [];
      for (let j = 0; j < 4; j++) {
        const s = line.substring(5 + j * 12, 5 + (j + 1) * 12).trim();
        if (s) vals.push(parseFloat19(s));
      }
      header.ionoCorrections[corrType] = vals;
    }

    i++;
  }

  if (inHeader) return { header, ephemerides };

  // Parse records
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim().length === 0) { i++; continue; }

    const sys = line.charAt(0);
    const numDataLines = DATA_LINES[sys];
    if (numDataLines == null) {
      // Unknown system, try to skip
      i++;
      continue;
    }

    const { prn, date, values: epochVals } = parseNavEpoch(line);

    // Read data lines
    const dataLines: number[][] = [];
    for (let j = 0; j < numDataLines; j++) {
      i++;
      if (i >= lines.length) break;
      dataLines.push(parseDataLine(lines[i]!));
    }

    if (dataLines.length === numDataLines) {
      const fullPrn = `${sys}${prn.substring(1)}`;
      if (sys === 'R' || sys === 'S') {
        ephemerides.push(buildStateVectorEphemeris(sys, fullPrn, date, epochVals, dataLines));
      } else if (sys === 'G' || sys === 'E' || sys === 'C' || sys === 'J' || sys === 'I') {
        ephemerides.push(buildKeplerEphemeris(sys, fullPrn, date, epochVals, dataLines));
      }
    }

    i++;
  }

  return { header, ephemerides };
}
