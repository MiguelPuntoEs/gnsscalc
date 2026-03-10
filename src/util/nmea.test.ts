import { describe, it, expect } from 'vitest';
import {
  nmeaCoordToDecimal,
  verifyChecksum,
  parseNmeaFile,
  computeStats,
} from './nmea';

describe('nmeaCoordToDecimal', () => {
  it('converts latitude ddmm.mmmm N', () => {
    // 4807.038 N → 48 + 7.038/60 = 48.1173°
    const result = nmeaCoordToDecimal('4807.038', 'N');
    expect(result).toBeCloseTo(48.1173, 4);
  });

  it('converts latitude S to negative', () => {
    const result = nmeaCoordToDecimal('3349.375', 'S');
    expect(result).toBeCloseTo(-33.82292, 4);
  });

  it('converts longitude dddmm.mmmm E', () => {
    // 01131.000 E → 11 + 31.0/60 = 11.51667°
    const result = nmeaCoordToDecimal('01131.000', 'E');
    expect(result).toBeCloseTo(11.51667, 4);
  });

  it('converts longitude W to negative', () => {
    const result = nmeaCoordToDecimal('00342.228', 'W');
    expect(result).toBeCloseTo(-3.7038, 3);
  });

  it('returns NaN for empty input', () => {
    expect(nmeaCoordToDecimal('', 'N')).toBeNaN();
  });
});

describe('verifyChecksum', () => {
  it('validates a correct checksum', () => {
    expect(verifyChecksum('$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*76')).toBe(true);
  });

  it('rejects an incorrect checksum', () => {
    expect(verifyChecksum('$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*FF')).toBe(false);
  });

  it('returns false when no checksum present', () => {
    expect(verifyChecksum('$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,')).toBe(false);
  });
});

describe('parseNmeaFile', () => {
  it('parses a GGA sentence', () => {
    const content = '$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*76';
    const { fixes, stats } = parseNmeaFile(content);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].lat).toBeCloseTo(53.36134, 4);
    expect(fixes[0].lon).toBeCloseTo(-6.50562, 4);
    expect(fixes[0].alt).toBeCloseTo(61.7, 1);
    expect(fixes[0].satellites).toBe(8);
    expect(fixes[0].fixQuality).toBe(1);
    expect(stats.validFixes).toBe(1);
  });

  it('parses an RMC sentence', () => {
    const content = '$GPRMC,092750.000,A,5321.6802,N,00630.3372,W,0.02,31.66,280511,,,A*43';
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].lat).toBeCloseTo(53.36134, 4);
    expect(fixes[0].speed).toBeCloseTo(0.02, 2);
    expect(fixes[0].course).toBeCloseTo(31.66, 2);
    // RMC has date
    expect(fixes[0].time).not.toBeNull();
    expect(fixes[0].time!.getUTCFullYear()).toBe(2011);
    expect(fixes[0].time!.getUTCMonth()).toBe(4); // May = 4
    expect(fixes[0].time!.getUTCDate()).toBe(28);
  });

  it('merges GGA and RMC from same epoch', () => {
    const content = [
      '$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*76',
      '$GPRMC,092750.000,A,5321.6802,N,00630.3372,W,0.02,31.66,280511,,,A*43',
    ].join('\n');
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].alt).toBeCloseTo(61.7, 1);
    expect(fixes[0].satellites).toBe(8);
    expect(fixes[0].speed).toBeCloseTo(0.02, 2);
    expect(fixes[0].time!.getUTCFullYear()).toBe(2011);
  });

  it('skips invalid GGA (fix quality 0)', () => {
    const content = '$GPGGA,092750.000,5321.6802,N,00630.3372,W,0,0,,,M,,M,,*49';
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(0);
  });

  it('skips void RMC (status V)', () => {
    const content = '$GPRMC,092750.000,V,,,,,,,280511,,,N*4C';
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(0);
  });

  it('handles multi-constellation talker IDs (GN, GL, GA)', () => {
    const content = '$GNGGA,092750.000,5321.6802,N,00630.3372,W,1,12,0.80,61.7,M,55.2,M,,*59';
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].satellites).toBe(12);
  });

  it('rejects lines with bad checksum', () => {
    const content = '$GPGGA,092750.000,5321.6802,N,00630.3372,W,1,8,1.03,61.7,M,55.2,M,,*FF';
    const { fixes } = parseNmeaFile(content);
    expect(fixes).toHaveLength(0);
  });

  it('handles empty / non-NMEA content gracefully', () => {
    const content = 'this is not nmea\n\n# comment\n';
    const { fixes, stats } = parseNmeaFile(content);
    expect(fixes).toHaveLength(0);
    expect(stats.totalFixes).toBe(0);
  });
});

describe('computeStats', () => {
  it('computes duration, distance, satellites and precision', () => {
    const fixes = [
      { time: new Date('2024-01-01T00:00:00Z'), lat: 40.0, lon: -3.0, alt: 600, satellites: 10, fixQuality: 1, speed: 5.0, course: null },
      { time: new Date('2024-01-01T00:05:00Z'), lat: 41.0, lon: -2.0, alt: 800, satellites: 8, fixQuality: 1, speed: 10.0, course: null },
    ];
    const stats = computeStats(fixes);
    expect(stats.validFixes).toBe(2);
    expect(stats.duration).toBe(300);
    expect(stats.avgSatellites).toBe(9);

    // Total distance: ~130 km between these two points
    expect(stats.totalDistance).toBeGreaterThan(100_000);
    expect(stats.totalDistance).toBeLessThan(200_000);

    // Max speed: 10 knots * 1.852 = 18.52 km/h
    expect(stats.maxSpeed).toBeCloseTo(18.52, 1);

    // Precision metrics should be computed
    expect(stats.cep).not.toBeNull();
    expect(stats.drms2).not.toBeNull();
    expect(stats.hRms).not.toBeNull();
    expect(stats.vRms).not.toBeNull();

    // 2DRMS should be 2× hRMS
    expect(stats.drms2).toBeCloseTo(2 * stats.hRms!, 6);
  });
});
