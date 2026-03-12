import { describe, it, expect } from 'vitest';
import {
  keplerPosition,
  glonassPosition,
  ecefToGeodetic,
  geodeticToEcef,
  ecefToAzEl,
  computeDop,
  selectEphemeris,
  computeSatPosition,
  navTimesFromEph,
} from './orbit';
import type { KeplerEphemeris, GlonassEphemeris, Ephemeris } from './nav';

/* ── Helpers ──────────────────────────────────────────────────── */

/** Build a minimal GPS Keplerian ephemeris resembling a real GPS satellite. */
function makeGpsEph(overrides: Partial<KeplerEphemeris> = {}): KeplerEphemeris {
  // GPS satellite at ~26,560 km semi-major axis
  const sqrtA = 5153.6; // sqrt(26559696) ≈ 5153.6 → a ≈ 26560 km
  return {
    system: 'G',
    prn: 'G01',
    toc: 0,
    tocDate: new Date('2024-01-01T00:00:00Z'),
    af0: 0, af1: 0, af2: 0,
    iode: 0,
    crs: 0, deltaN: 0,
    m0: 0,          // mean anomaly at toe
    cuc: 0, e: 0.01, cus: 0,
    sqrtA,
    toe: 0,         // reference time (seconds of GPS week)
    cic: 0,
    omega0: 0,      // right ascension of ascending node
    cis: 0,
    i0: 0.96,       // inclination ~55°
    crc: 0,
    omega: 0,       // argument of perigee
    omegaDot: 0,
    idot: 0,
    week: 0,
    svHealth: 0,
    tgd: 0,
    ...overrides,
  };
}

function makeGloEph(overrides: Partial<GlonassEphemeris> = {}): GlonassEphemeris {
  // GLONASS at ~25,500 km orbit, position in km
  return {
    system: 'R',
    prn: 'R01',
    tocDate: new Date('2024-01-01T00:00:00Z'),
    tauN: 0, gammaN: 0, messageFrameTime: 0,
    x: 10_000, xDot: 0, xAcc: 0,   // km, km/s, km/s²
    y: 20_000, yDot: 0, yAcc: 0,
    z: 10_000, zDot: 0, zAcc: 0,
    health: 0, freqNum: 1,
    ...overrides,
  };
}

/* ── keplerPosition ──────────────────────────────────────────── */

describe('keplerPosition', () => {
  it('produces position at GPS orbit altitude (~26500 km)', () => {
    const eph = makeGpsEph();
    const pos = keplerPosition(eph, 0); // t = toe

    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    // Semi-major axis ≈ 26.56 million metres, eccentricity small
    expect(r).toBeGreaterThan(25_000_000);
    expect(r).toBeLessThan(28_000_000);
    expect(pos.prn).toBe('G01');
  });

  it('position changes over time (satellite moves)', () => {
    const eph = makeGpsEph();
    const p1 = keplerPosition(eph, 0);
    const p2 = keplerPosition(eph, 3600); // 1 hour later

    const dist = Math.sqrt(
      (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2,
    );
    // GPS satellite velocity ~3.9 km/s → ~14,000 km in 1 hour
    expect(dist).toBeGreaterThan(10_000_000);
    expect(dist).toBeLessThan(20_000_000);
  });

  it('handles circular orbit (e=0)', () => {
    const eph = makeGpsEph({ e: 0 });
    const pos = keplerPosition(eph, 0);
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    const a = eph.sqrtA * eph.sqrtA;
    // For e=0, r should equal semi-major axis exactly
    expect(r).toBeCloseTo(a, -2); // within 100m
  });

  it('wraps tk correctly for times crossing week boundary', () => {
    const eph = makeGpsEph({ toe: 0 });
    // t just past the half-week boundary: should wrap
    const pos = keplerPosition(eph, 302500);
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(25_000_000);
  });

  it('applies harmonic corrections (crs, crc, cus, cuc, cis, cic)', () => {
    const eph1 = makeGpsEph();
    const eph2 = makeGpsEph({ crs: 10, crc: 10, cus: 1e-5, cuc: 1e-5, cis: 1e-5, cic: 1e-5 });

    const p1 = keplerPosition(eph1, 1000);
    const p2 = keplerPosition(eph2, 1000);

    // Corrections should make positions differ
    const dist = Math.sqrt(
      (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2,
    );
    expect(dist).toBeGreaterThan(1); // at least 1m difference
  });
});

/* ── glonassPosition ─────────────────────────────────────────── */

describe('glonassPosition', () => {
  it('produces position at GLONASS orbit altitude', () => {
    const eph = makeGloEph();
    const tUtc = eph.tocDate.getTime() / 1000;
    const pos = glonassPosition(eph, tUtc);

    // Input position is (10000, 20000, 10000) km → r ≈ 24,495 km
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(20_000_000);
    expect(r).toBeLessThan(30_000_000);
    expect(pos.prn).toBe('R01');
  });

  it('returns initial position when dt=0', () => {
    const eph = makeGloEph();
    const tUtc = eph.tocDate.getTime() / 1000;
    const pos = glonassPosition(eph, tUtc);

    // Should be very close to initial state (10000, 20000, 10000) km → in metres
    expect(pos.x).toBeCloseTo(10_000_000, -1); // within ~10m
    expect(pos.y).toBeCloseTo(20_000_000, -1);
    expect(pos.z).toBeCloseTo(10_000_000, -1);
  });

  it('integrates forward in time', () => {
    const eph = makeGloEph({ xDot: 1.0, yDot: -0.5, zDot: 0.3 }); // km/s
    const tUtc = eph.tocDate.getTime() / 1000;
    const pos0 = glonassPosition(eph, tUtc);
    const pos1 = glonassPosition(eph, tUtc + 600); // 10 minutes later

    const dist = Math.sqrt(
      (pos1.x - pos0.x) ** 2 + (pos1.y - pos0.y) ** 2 + (pos1.z - pos0.z) ** 2,
    );
    // With velocity ~1.2 km/s, expect ~720 km displacement in 600s
    expect(dist).toBeGreaterThan(500_000);
    expect(dist).toBeLessThan(1_000_000);
  });

  it('integrates backward in time', () => {
    const eph = makeGloEph({ xDot: 1.0 });
    const tUtc = eph.tocDate.getTime() / 1000;
    const pos = glonassPosition(eph, tUtc - 300); // 5 minutes before
    // Should still produce a valid position
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(10_000_000);
  });
});

/* ── ecefToGeodetic / geodeticToEcef round-trip ──────────────── */

describe('ecefToGeodetic', () => {
  it('converts origin on equator/prime meridian', () => {
    // Point on equator at prime meridian at sea level
    const [lat, lon, alt] = ecefToGeodetic(6378137, 0, 0);
    expect(lat).toBeCloseTo(0, 5);
    expect(lon).toBeCloseTo(0, 5);
    expect(alt).toBeCloseTo(0, 0);
  });

  it('converts north pole', () => {
    // WGS84 polar radius ≈ 6356752.314
    const [lat, lon] = ecefToGeodetic(0, 0, 6356752.314);
    expect(lat).toBeCloseTo(Math.PI / 2, 3);
    // Longitude is indeterminate at poles, just check lat
    expect(lon).toBeDefined();
  });

  it('round-trips with geodeticToEcef', () => {
    const lat = 0.7; // ~40°
    const lon = -0.06; // ~-3.4°
    const altIn = 500;

    const [x, y, z] = geodeticToEcef(lat, lon, altIn);
    const [lat2, lon2, alt2] = ecefToGeodetic(x, y, z);

    expect(lat2).toBeCloseTo(lat, 8);
    expect(lon2).toBeCloseTo(lon, 8);
    expect(alt2).toBeCloseTo(altIn, 1);
  });
});

describe('geodeticToEcef', () => {
  it('produces correct radius at equator', () => {
    const [x, y, z] = geodeticToEcef(0, 0, 0);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeCloseTo(6378137, 0); // WGS84 equatorial radius
  });

  it('produces correct radius at pole', () => {
    const [x, y, z] = geodeticToEcef(Math.PI / 2, 0, 0);
    const r = Math.sqrt(x * x + y * y + z * z);
    // Polar radius ≈ 6356752.3
    expect(r).toBeCloseTo(6356752.3, 0);
  });
});

/* ── ecefToAzEl ──────────────────────────────────────────────── */

describe('ecefToAzEl', () => {
  it('satellite directly above receiver has el ≈ 90°', () => {
    // Receiver on equator at prime meridian
    const [rx, ry, rz] = geodeticToEcef(0, 0, 0);
    // Satellite 20,000 km directly above
    const [sx, sy, sz] = geodeticToEcef(0, 0, 20_000_000);

    const { el } = ecefToAzEl(rx, ry, rz, sx, sy, sz);
    expect(el).toBeCloseTo(Math.PI / 2, 1);
  });

  it('satellite on horizon has el ≈ 0', () => {
    // Receiver at equator, satellite far away along equator at 90° longitude
    const [rx, ry, rz] = geodeticToEcef(0, 0, 0);
    const [sx, sy, sz] = geodeticToEcef(0, Math.PI / 2, 20_200_000);

    const { el } = ecefToAzEl(rx, ry, rz, sx, sy, sz);
    // Should be near 0 (or slightly positive due to curvature)
    expect(Math.abs(el)).toBeLessThan(0.5); // within ~30°
  });

  it('satellite due north has az ≈ 0', () => {
    const [rx, ry, rz] = geodeticToEcef(0, 0, 0);
    // Satellite north of receiver, at higher latitude same longitude, high altitude
    const [sx, sy, sz] = geodeticToEcef(0.5, 0, 20_200_000);

    const { az } = ecefToAzEl(rx, ry, rz, sx, sy, sz);
    // Azimuth should be near 0 (north)
    expect(az).toBeLessThan(0.3); // within ~17°
  });
});

/* ── computeDop ──────────────────────────────────────────────── */

describe('computeDop', () => {
  it('returns null with fewer than 4 satellites', () => {
    const sats = [
      { az: 0, el: Math.PI / 4 },
      { az: Math.PI / 2, el: Math.PI / 4 },
      { az: Math.PI, el: Math.PI / 4 },
    ];
    expect(computeDop(sats)).toBeNull();
  });

  it('computes DOP for 4 well-distributed satellites', () => {
    // 4 sats at varying elevations, evenly spaced in azimuth
    const sats = [
      { az: 0, el: Math.PI / 6 },               // 30° el
      { az: Math.PI / 2, el: Math.PI / 4 },      // 45° el
      { az: Math.PI, el: Math.PI / 3 },           // 60° el
      { az: 3 * Math.PI / 2, el: Math.PI / 5 },  // 36° el
    ];

    const dop = computeDop(sats);
    expect(dop).not.toBeNull();
    expect(dop!.gdop).toBeGreaterThan(0);
    expect(dop!.pdop).toBeGreaterThan(0);
    expect(dop!.hdop).toBeGreaterThan(0);
    expect(dop!.vdop).toBeGreaterThan(0);
    // GDOP >= PDOP >= HDOP
    expect(dop!.gdop).toBeGreaterThanOrEqual(dop!.pdop);
    expect(dop!.pdop).toBeGreaterThanOrEqual(dop!.hdop);
  });

  it('DOP improves with more satellites', () => {
    const sats4 = [
      { az: 0, el: Math.PI / 6 },
      { az: Math.PI / 2, el: Math.PI / 4 },
      { az: Math.PI, el: Math.PI / 3 },
      { az: 3 * Math.PI / 2, el: Math.PI / 5 },
    ];
    const sats8 = [
      ...sats4,
      { az: Math.PI / 4, el: Math.PI / 3 },
      { az: 3 * Math.PI / 4, el: Math.PI / 6 },
      { az: 5 * Math.PI / 4, el: Math.PI / 4 },
      { az: 7 * Math.PI / 4, el: Math.PI / 5 },
    ];

    const dop4 = computeDop(sats4)!;
    const dop8 = computeDop(sats8)!;
    expect(dop8.gdop).toBeLessThan(dop4.gdop);
  });

  it('high-elevation-only geometry gives poor VDOP', () => {
    // All satellites near zenith → poor vertical geometry
    const sats = [
      { az: 0, el: 1.4 },         // ~80°
      { az: Math.PI / 2, el: 1.3 },
      { az: Math.PI, el: 1.4 },
      { az: 3 * Math.PI / 2, el: 1.3 },
    ];
    const dop = computeDop(sats)!;
    expect(dop.vdop).toBeGreaterThan(dop.hdop); // VDOP should be worse
  });
});

/* ── selectEphemeris ─────────────────────────────────────────── */

describe('selectEphemeris', () => {
  it('selects closest ephemeris to target time', () => {
    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-01-01T02:00:00Z');
    const t3 = new Date('2024-01-01T04:00:00Z');

    const ephs: Ephemeris[] = [
      makeGpsEph({ prn: 'G01', tocDate: t1 }),
      makeGpsEph({ prn: 'G01', tocDate: t2 }),
      makeGpsEph({ prn: 'G01', tocDate: t3 }),
    ];

    // Target at 01:30 → closest to t2 (02:00)
    const target = new Date('2024-01-01T01:30:00Z').getTime();
    const best = selectEphemeris(ephs, 'G01', target);
    expect(best).toBe(ephs[1]);
  });

  it('returns null for wrong PRN', () => {
    const ephs: Ephemeris[] = [
      makeGpsEph({ prn: 'G01', tocDate: new Date('2024-01-01T00:00:00Z') }),
    ];
    const result = selectEphemeris(ephs, 'G02', Date.now());
    expect(result).toBeNull();
  });

  it('rejects ephemerides older than 4 hours', () => {
    const t = new Date('2024-01-01T00:00:00Z');
    const ephs: Ephemeris[] = [makeGpsEph({ prn: 'G01', tocDate: t })];

    // Target 5 hours later
    const target = t.getTime() + 5 * 3600 * 1000;
    const result = selectEphemeris(ephs, 'G01', target);
    expect(result).toBeNull();
  });

  it('accepts ephemeris within 4 hours', () => {
    const t = new Date('2024-01-01T00:00:00Z');
    const ephs: Ephemeris[] = [makeGpsEph({ prn: 'G01', tocDate: t })];

    const target = t.getTime() + 3 * 3600 * 1000; // 3 hours
    const result = selectEphemeris(ephs, 'G01', target);
    expect(result).toBe(ephs[0]);
  });
});

/* ── computeSatPosition ──────────────────────────────────────── */

describe('computeSatPosition', () => {
  it('dispatches to keplerPosition for GPS', () => {
    const eph = makeGpsEph();
    const pos = computeSatPosition(eph, eph.tocDate.getTime());
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(25_000_000);
  });

  it('dispatches to glonassPosition for GLONASS', () => {
    const eph = makeGloEph();
    const pos = computeSatPosition(eph, eph.tocDate.getTime());
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    expect(r).toBeGreaterThan(10_000_000);
  });
});

/* ── navTimesFromEph ─────────────────────────────────────────── */

describe('navTimesFromEph', () => {
  it('returns evenly spaced times spanning ephemeris range', () => {
    const t1 = new Date('2024-01-01T00:00:00Z');
    const t2 = new Date('2024-01-01T06:00:00Z');
    const ephs: Ephemeris[] = [
      makeGpsEph({ tocDate: t1 }),
      makeGpsEph({ tocDate: t2 }),
    ];

    const times = navTimesFromEph(ephs);
    expect(times.length).toBeGreaterThan(1);
    expect(times[0]).toBe(t1.getTime());
    expect(times[times.length - 1]).toBeLessThanOrEqual(t2.getTime());
    // Should be roughly evenly spaced
    const dt = times[1]! - times[0]!;
    expect(dt).toBeGreaterThan(0);
  });

  it('returns single time for single ephemeris', () => {
    const t = new Date('2024-01-01T00:00:00Z');
    const ephs: Ephemeris[] = [makeGpsEph({ tocDate: t })];
    const times = navTimesFromEph(ephs);
    expect(times).toHaveLength(1);
    expect(times[0]).toBe(t.getTime());
  });

  it('returns empty array for no ephemerides', () => {
    const times = navTimesFromEph([]);
    expect(times).toHaveLength(0);
  });
});
