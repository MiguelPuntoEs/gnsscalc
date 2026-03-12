import { describe, it, expect } from 'vitest';
import { parseRinexStream, downsampleEpochs } from './rinex';
import type { EpochSummary } from './rinex';

/** Helper: create a File from a string. */
function fileFrom(content: string, name = 'test.obs'): File {
  return new File([content], name, { type: 'text/plain' });
}

/* ---------- RINEX 3.x ---------- */

const RINEX3_HEADER = `     3.03           OBSERVATION DATA    M                   RINEX VERSION / TYPE
testreceiver                                                OBSERVER / AGENCY
TEST                                                        MARKER NAME
                                                            ANT # / TYPE
  4027893.7145   307045.6054  4919474.5450                  APPROX POSITION XYZ
     1.000                                                  INTERVAL
G    4 C1C L1C S1C C2W                                      SYS / # / OBS TYPES
R    2 C1C S1C                                              SYS / # / OBS TYPES
  2016     3    10    16    55    31.0000000     GPS         TIME OF FIRST OBS
                                                            END OF HEADER
`;

const RINEX3_EPOCH1 = `> 2016  3 10 16 55 31.0000000  0  3
G01  23456789.123 7 123456789.123 7        42.300   99999.999 7
G03  23456790.456 7 123456790.456 7        38.100   99999.998 7
R01  24000000.000 7        35.500
`;

const RINEX3_EPOCH2 = `> 2016  3 10 16 55 32.0000000  0  2
G01  23456789.200 7 123456789.200 7        43.100   99999.999 7
R01  24000001.000 7        36.200
`;

describe('RINEX 3.x parser', () => {
  it('parses header fields', async () => {
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1);
    const result = await parseRinexStream(file);

    expect(result.header.version).toBe(3.03);
    expect(result.header.type).toBe('O');
    expect(result.header.markerName).toBe('TEST');
    expect(result.header.interval).toBe(1);
    expect(result.header.approxPosition).toEqual([4027893.7145, 307045.6054, 4919474.545]);
    expect(result.header.obsTypes['G']).toEqual(['C1C', 'L1C', 'S1C', 'C2W']);
    expect(result.header.obsTypes['R']).toEqual(['C1C', 'S1C']);
  });

  it('parses epoch with 3 satellites', async () => {
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1);
    const result = await parseRinexStream(file);

    expect(result.epochs).toHaveLength(1);
    expect(result.epochs[0]!.totalSats).toBe(3);
    expect(result.epochs[0]!.satsPerSystem).toEqual({ G: 2, R: 1 });
  });

  it('extracts SNR values', async () => {
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1);
    const result = await parseRinexStream(file);

    // G has S1C at index 2 → values 42.3 and 38.1; R has S1C at index 1 → value 35.5
    expect(result.epochs[0]!.meanSnr).toBeCloseTo((42.3 + 38.1 + 35.5) / 3, 1);
    expect(result.epochs[0]!.snrPerSystem['G']).toBeCloseTo((42.3 + 38.1) / 2, 1);
    expect(result.epochs[0]!.snrPerSystem['R']).toBeCloseTo(35.5, 1);
  });

  it('parses multiple epochs', async () => {
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1 + RINEX3_EPOCH2);
    const result = await parseRinexStream(file);

    expect(result.epochs).toHaveLength(2);
    expect(result.epochs[1]!.totalSats).toBe(2);
    expect(result.epochs[1]!.satsPerSystem).toEqual({ G: 1, R: 1 });
  });

  it('computes stats correctly', async () => {
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1 + RINEX3_EPOCH2);
    const result = await parseRinexStream(file);

    expect(result.stats.totalEpochs).toBe(2);
    expect(result.stats.duration).toBe(1); // 1 second apart
    expect(result.stats.interval).toBe(1);
    expect(result.stats.uniqueSatellites).toBe(3); // G01, G03, R01
    expect(result.stats.uniqueSatsPerSystem).toEqual({ G: 2, R: 1 });
    expect(result.stats.systems).toEqual(['G', 'R']);
    expect(result.stats.meanSatellites).toBe(2.5);
    expect(result.stats.meanSnr).toBeGreaterThan(0);
  });

  it('skips non-zero epoch flags', async () => {
    const badEpoch = `> 2016  3 10 16 55 33.0000000  1  0
`;
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1 + badEpoch);
    const result = await parseRinexStream(file);

    expect(result.epochs).toHaveLength(1);
  });

  it('skips event records (flag 2-5) with embedded header lines', async () => {
    const event = `> 2016  3 10 16 55 33.0000000  4  2
SOME HEADER RECORD                                          COMMENT
ANOTHER RECORD                                              COMMENT
`;
    const file = fileFrom(RINEX3_HEADER + RINEX3_EPOCH1 + event + RINEX3_EPOCH2);
    const result = await parseRinexStream(file);
    expect(result.epochs).toHaveLength(2);
  });

  it('throws on missing header', async () => {
    const file = fileFrom('not a rinex file\n');
    await expect(parseRinexStream(file)).rejects.toThrow('No valid RINEX header');
  });
});

/* ---------- RINEX 4.x ---------- */

describe('RINEX 4.x parser', () => {
  it('parses RINEX 4.02 header and observations', async () => {
    const header = `     4.02           OBSERVATION DATA    M                   RINEX VERSION / TYPE
testreceiver                                                OBSERVER / AGENCY
TEST                                                        MARKER NAME
G    3 C1C L1C S1C                                          SYS / # / OBS TYPES
E    2 C1C S1C                                              SYS / # / OBS TYPES
  2006     3    24    13    10    36.0000000     GPS         TIME OF FIRST OBS
                                                            END OF HEADER
`;
    // Each obs is F14.3(right-just) + LLI(1) + SS(1) = 16 chars; PRN is 3 chars
    // G has 3 obs (C1C, L1C, S1C), E has 2 obs (C1C, S1C)
    const o = (v: string) => v.padStart(14) + '  ';
    const g06 = 'G06' + o('23629347.915') + o('-.353') + o('24.158');
    const g09 = 'G09' + o('20891534.648') + o('-.358') + o('38.123');
    const e11 = 'E11' + o('26254562.136') + o('40.500');
    const epoch = `> 2006 03 24 13 10 36.0000000  0  3\n${g06}\n${g09}\n${e11}\n`;
    const file = fileFrom(header + epoch);
    const result = await parseRinexStream(file);
    expect(result.header.version).toBe(4.02);
    expect(result.epochs).toHaveLength(1);
    expect(result.epochs[0]!.totalSats).toBe(3);
    expect(result.epochs[0]!.satsPerSystem).toEqual({ G: 2, E: 1 });
    // G06 S1C=24.158, G09 S1C=38.123, E11 S1C=40.500
    expect(result.epochs[0]!.snrPerSat['G06']).toBeCloseTo(24.158, 2);
    expect(result.epochs[0]!.snrPerSat['E11']).toBeCloseTo(40.5, 1);
  });
});

/* ---------- RINEX 2.x ---------- */

const RINEX2_HEADER = `     2.11           OBSERVATION DATA    G (GPS)             RINEX VERSION / TYPE
test                test agency                             OBSERVER / AGENCY
MARK                                                        MARKER NAME
     5    C1    L1    S1    C2    S2                         # / TYPES OF OBSERV
  2016     3    10    16    55    31.0000000     GPS         TIME OF FIRST OBS
                                                            END OF HEADER
`;

// Each observation is exactly 16 chars: F14.3 (right-justified) + LLI(1) + SS(1)
function obs(val: string): string { return val.padStart(14) + '  '; }
const v2Line1 = obs('23456789.123') + obs('123456789.123') + obs('41.200') + obs('99999.999') + obs('39.800');
const v2Line2 = obs('23456790.456') + obs('123456790.456') + obs('37.600') + obs('99999.998') + obs('35.200');
const RINEX2_EPOCH = ` 16  3 10 16 55 31.0000000  0  2G01G03\n${v2Line1}\n${v2Line2}\n`;

describe('RINEX 2.x parser', () => {
  it('parses v2 header and observations', async () => {
    const file = fileFrom(RINEX2_HEADER + RINEX2_EPOCH);
    const result = await parseRinexStream(file);

    expect(result.header.version).toBe(2.11);
    expect(result.header.obsTypes['_v2']).toEqual(['C1', 'L1', 'S1', 'C2', 'S2']);
    expect(result.epochs).toHaveLength(1);
    expect(result.epochs[0]!.totalSats).toBe(2);
    expect(result.epochs[0]!.satsPerSystem).toEqual({ G: 2 });
  });

  it('extracts v2 SNR values', async () => {
    const file = fileFrom(RINEX2_HEADER + RINEX2_EPOCH);
    const result = await parseRinexStream(file);

    // S1 at index 2 (41.2, 37.6), S2 at index 4 (39.8, 35.2)
    const allSnr = [41.2, 39.8, 37.6, 35.2];
    expect(result.epochs[0]!.meanSnr).toBeCloseTo(
      allSnr.reduce((a, b) => a + b, 0) / allSnr.length,
      1,
    );
  });
});

/* ---------- CRX 3.0 (Compact RINEX / Hatanaka) ---------- */

const CRX3_HEADER = `3.0                 COMPACT RINEX FORMAT                    CRINEX VERS   / TYPE
     3.03           OBSERVATION DATA    M                   RINEX VERSION / TYPE
testreceiver                                                OBSERVER / AGENCY
TEST                                                        MARKER NAME
     1.000                                                  INTERVAL
G    3 C1C L1C S1C                                          SYS / # / OBS TYPES
R    2 C1C S1C                                              SYS / # / OBS TYPES
  2016     3    10    16    55    31.0000000     GPS         TIME OF FIRST OBS
                                                            END OF HEADER
`;

// Epoch 1: 2 GPS + 1 GLONASS, all arc-initialized with order 3
// CRX integers: pseudorange×1000, carrier phase×1000, SNR×1000
// Real CRX 3.0 format: PRNs on epoch line (pos 41+), clock line, one line per sat
const CRX3_EPOCH1 = `> 2016  3 10 16 55 31.0000000  0  3      G01G03R01

3&23456789123 3&123456789123 3&42300
3&23456790456 3&123456790456 3&38100
3&24000000000 3&35500
`;

// Epoch 2: text-differenced epoch line. G03 disappears → only G01 R01.
// G01: pseudorange diff=+100, phase diff=+200, SNR diff=+800 (42.3→43.1)
// R01: pseudorange diff=+1000, SNR diff=+700 (35.5→36.2)
// Old epoch: "> 2016  3 10 16 55 31.0000000  0  3      G01G03R01"
// New epoch: "> 2016  3 10 16 55 32.0000000  0  2      G01R01   "
// Diff: space=same char, &=replace with space, other=new char
const CRX3_EPOCH2 = `                    2             2         R 1&&&

100 200 800
1000 700
`;

describe('CRX 3.0 parser', () => {
  it('detects CRX header', async () => {
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1);
    const result = await parseRinexStream(file);
    expect(result.header.isCrx).toBe(true);
    expect(result.header.crxVersion).toBe(3);
    expect(result.header.version).toBe(3.03);
  });

  it('parses CRX epoch with 3 satellites', async () => {
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1);
    const result = await parseRinexStream(file);
    expect(result.epochs).toHaveLength(1);
    expect(result.epochs[0]!.totalSats).toBe(3);
    expect(result.epochs[0]!.satsPerSystem).toEqual({ G: 2, R: 1 });
  });

  it('decompresses SNR on initialization', async () => {
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1);
    const result = await parseRinexStream(file);
    // G01 S1C = 42300/1000 = 42.3, G03 S1C = 38100/1000 = 38.1, R01 S1C = 35500/1000 = 35.5
    expect(result.epochs[0]!.meanSnr).toBeCloseTo((42.3 + 38.1 + 35.5) / 3, 1);
    expect(result.epochs[0]!.snrPerSystem['G']).toBeCloseTo((42.3 + 38.1) / 2, 1);
    expect(result.epochs[0]!.snrPerSystem['R']).toBeCloseTo(35.5, 1);
  });

  it('decompresses differences across epochs', async () => {
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1 + CRX3_EPOCH2);
    const result = await parseRinexStream(file);
    expect(result.epochs).toHaveLength(2);
    // G01 S1C: init 42300, diff +800 → 42300+800 = 43100 → 43.1
    expect(result.epochs[1]!.snrPerSat['G01']).toBeCloseTo(43.1, 1);
    // R01 S1C: init 35500, diff +700 → 35500+700 = 36200 → 36.2
    expect(result.epochs[1]!.snrPerSat['R01']).toBeCloseTo(36.2, 1);
  });

  it('computes stats for CRX files', async () => {
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1 + CRX3_EPOCH2);
    const result = await parseRinexStream(file);
    expect(result.stats.totalEpochs).toBe(2);
    expect(result.stats.uniqueSatellites).toBe(3);
    expect(result.stats.systems).toEqual(['G', 'R']);
    expect(result.stats.duration).toBe(1);
  });
});

/* ---------- CRX 1.0 (Compact RINEX / Hatanaka, RINEX 2) ---------- */

const CRX1_HEADER = `1.0                 COMPACT RINEX FORMAT                    CRINEX VERS   / TYPE
     2.11           OBSERVATION DATA    G (GPS)             RINEX VERSION / TYPE
test                test agency                             OBSERVER / AGENCY
MARK                                                        MARKER NAME
     3    C1    L1    S1                                    # / TYPES OF OBSERV
  2026     1     1     0     0     0.0000000     GPS         TIME OF FIRST OBS
                                                            END OF HEADER
`;

// CRX 1.0: first epoch starts with & (converted to space), PRNs in epoch line
// 2 GPS satellites, 3 obs types: C1, L1, S1
const CRX1_EPOCH1 = `&26  1  1  0  0  0.0000000  0  2G01G03
\n3&23456789123 3&123456789123 3&42300
3&23456790456 3&123456790456 3&38100
`;

// Second epoch: text-differenced
// Old: " 26  1  1  0  0  0.0000000  0  2G01G03"
// New: " 26  1  1  0  0 15.0000000  0  2G01G03"
const CRX1_EPOCH2 = `              15
\n100 200 800
-100 300 -200
`;

describe('CRX 1.0 parser', () => {
  it('parses CRX 1.0 epoch with & initializer', async () => {
    const file = fileFrom(CRX1_HEADER + CRX1_EPOCH1);
    const result = await parseRinexStream(file);
    expect(result.header.isCrx).toBe(true);
    expect(result.header.crxVersion).toBe(1);
    expect(result.epochs).toHaveLength(1);
    expect(result.epochs[0]!.totalSats).toBe(2);
    expect(result.epochs[0]!.satsPerSystem).toEqual({ G: 2 });
  });

  it('decompresses CRX 1.0 SNR values', async () => {
    const file = fileFrom(CRX1_HEADER + CRX1_EPOCH1);
    const result = await parseRinexStream(file);
    // G01 S1=42300/1000=42.3, G03 S1=38100/1000=38.1
    expect(result.epochs[0]!.meanSnr).toBeCloseTo((42.3 + 38.1) / 2, 1);
  });

  it('handles text-differenced CRX 1.0 epochs', async () => {
    const file = fileFrom(CRX1_HEADER + CRX1_EPOCH1 + CRX1_EPOCH2);
    const result = await parseRinexStream(file);
    expect(result.epochs).toHaveLength(2);
    expect(result.epochs[1]!.totalSats).toBe(2);
    // G01 S1C: 42300 + 800 = 43100 → 43.1
    expect(result.epochs[1]!.snrPerSat['G01']).toBeCloseTo(43.1, 1);
    // G03 S1C: 38100 + (-200) = 37900 → 37.9
    expect(result.epochs[1]!.snrPerSat['G03']).toBeCloseTo(37.9, 1);
  });
});

/* ---------- Event record handling ---------- */

describe('Event record handling', () => {
  it('skips CRX 3.0 event records (flag 2-5)', async () => {
    // Event with flag=4 and 2 embedded header lines, followed by a new initialized epoch
    const eventEpoch = `> 2016  3 10 16 55 33.0000000  4  2
SOME HEADER RECORD                                          COMMENT
ANOTHER HEADER RECORD                                       COMMENT
`;
    // After event, next data epoch must be re-initialized (starts with >)
    const epoch2Init = `> 2016  3 10 16 55 32.0000000  0  2      G01R01
\n3&23456789223 3&123456789323 3&43100
3&24000001000 3&36200
`;
    const file = fileFrom(CRX3_HEADER + CRX3_EPOCH1 + eventEpoch + epoch2Init);
    const result = await parseRinexStream(file);
    // Should have 2 data epochs, event is skipped
    expect(result.epochs).toHaveLength(2);
    expect(result.epochs[1]!!.totalSats).toBe(2);
  });
});

/* ---------- Real CRX 1.0 file ---------- */

describe('CRX 1.0 real file', () => {
  it('parses real CRX 1.0 file (sni10010.26d)', async () => {
    const fs = await import('node:fs');
    const buf = fs.readFileSync('data/rinex/hatanaka/2.11/sni10010.26d');
    const file = new File([buf], 'sni10010.26d');
    const result = await parseRinexStream(file);
    expect(result.header.isCrx).toBe(true);
    expect(result.header.crxVersion).toBe(1);
    expect(result.header.version).toBe(2.11);
    expect(result.stats.totalEpochs).toBeGreaterThan(100);
    expect(result.stats.uniqueSatellites).toBeGreaterThan(20);
    expect(result.stats.meanSnr).toBeGreaterThan(0);
    expect(result.header.obsTypes['_v2']).toHaveLength(20);
    // Sanity check: SNR should be in reasonable range (20-60 dB-Hz)
    expect(result.stats.meanSnr).toBeGreaterThan(20);
    expect(result.stats.meanSnr).toBeLessThan(60);
  });
});

/* ---------- downsampling ---------- */

describe('downsampleEpochs', () => {
  it('returns input when under threshold', () => {
    const epochs: EpochSummary[] = [
      { time: 1000, totalSats: 10, satsPerSystem: { G: 10 }, meanSnr: 40, snrPerSystem: { G: 40 }, snrPerSat: { G01: 40 } },
    ];
    expect(downsampleEpochs(epochs)).toBe(epochs);
  });

  it('downsamples large arrays', () => {
    const epochs: EpochSummary[] = Array.from({ length: 5000 }, (_, i) => ({
      time: i * 1000,
      totalSats: 10,
      satsPerSystem: { G: 6, E: 4 },
      meanSnr: 40,
      snrPerSystem: { G: 42, E: 38 },
      snrPerSat: { G01: 42, E01: 38 },
    }));

    const ds = downsampleEpochs(epochs);
    expect(ds.length).toBeLessThanOrEqual(2000);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0]!.totalSats).toBe(10);
  });
});
