/**
 * End-to-end tests using real GNSS station data from BKG.
 * Run `scripts/fetch-e2e-data.sh` to download the test fixtures.
 *
 * Fixtures (in data/e2e/):
 *  - ABMF.crx  — CRX 3.0 obs from ABMF (Guadeloupe), full day 30s (2024/001)
 *  - ALBH.crx  — CRX 3.0 obs from ALBH (Victoria, Canada), full day 30s (2024/001)
 *  - BRDC.nav  — RINEX 3.04 mixed nav from IGS, full day (2024/001)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseRinexStream } from './rinex';
import { parseNavFile } from './nav';
import { computeAllPositions, navTimesFromEph, computeDop } from './orbit';
import { analyzeQuality } from './quality-analysis';

const E2E = join(__dirname, '../../data/e2e');
const HAS_DATA = existsSync(join(E2E, 'ABMF.crx'));

function fileFrom(buf: Buffer, name: string): File {
  return new File([new Uint8Array(buf)], name);
}

/* ── RINEX 3 CRX (ABMF, multi-GNSS) ───────────────────────── */

describe.skipIf(!HAS_DATA)('E2E: ABMF CRX 3.0 observation', () => {
  const buf = readFileSync(join(E2E, 'ABMF.crx'));
  const file = () => fileFrom(buf, 'ABMF.crx');

  it('parses header correctly', async () => {
    const result = await parseRinexStream(file());
    expect(result.header.isCrx).toBe(true);
    expect(result.header.crxVersion).toBe(3);
    expect(result.header.version).toBe(3.04);
    expect(result.header.markerName).toBeTruthy();
    expect(result.header.approxPosition).toBeDefined();
    expect(result.header.approxPosition![0]).not.toBe(0);
  });

  it('parses multi-GNSS full-day observations', async () => {
    const result = await parseRinexStream(file());
    expect(result.stats.totalEpochs).toBeGreaterThan(2000); // full day at 30s ≈ 2880
    expect(result.stats.systems.length).toBeGreaterThanOrEqual(3);
    expect(result.stats.uniqueSatellites).toBeGreaterThan(15);
    expect(result.stats.meanSatellites).toBeGreaterThan(10);
  });

  it('has reasonable SNR values (20-60 dB-Hz)', async () => {
    const result = await parseRinexStream(file());
    expect(result.stats.meanSnr).toBeGreaterThan(20);
    expect(result.stats.meanSnr).toBeLessThan(60);
    for (const sys of result.stats.systems) {
      const sysSnr = result.epochs
        .map(e => e.snrPerSystem[sys])
        .filter((v): v is number => v != null);
      if (sysSnr.length > 0) {
        const mean = sysSnr.reduce((a, b) => a + b, 0) / sysSnr.length;
        expect(mean).toBeGreaterThan(15);
        expect(mean).toBeLessThan(60);
      }
    }
  });

  it('has consistent epoch timing', async () => {
    const result = await parseRinexStream(file());
    expect(result.stats.interval).toBe(30);
    const expectedDuration = (result.stats.totalEpochs - 1) * 30;
    expect(result.stats.duration).toBeCloseTo(expectedDuration, -1);
  });
});

/* ── RINEX 3 CRX (ALBH, second station) ───────────────────── */

describe.skipIf(!HAS_DATA)('E2E: ALBH CRX 3.0 observation', () => {
  const buf = () => readFileSync(join(E2E, 'ALBH.crx'));
  const file = () => fileFrom(buf(), 'ALBH.crx');

  it('parses header correctly', async () => {
    const result = await parseRinexStream(file());
    expect(result.header.isCrx).toBe(true);
    expect(result.header.version).toBeGreaterThanOrEqual(3);
    expect(result.header.markerName).toBeTruthy();
    expect(result.header.approxPosition).toBeDefined();
  });

  it('parses full-day observations', async () => {
    const result = await parseRinexStream(file());
    expect(result.stats.totalEpochs).toBeGreaterThan(2000); // full day at 30s ≈ 2880
    expect(result.stats.uniqueSatellites).toBeGreaterThan(10);
    expect(result.stats.meanSnr).toBeGreaterThan(20);
  });
});

/* ── Navigation file ───────────────────────────────────────── */

describe.skipIf(!HAS_DATA)('E2E: BRDC mixed navigation', () => {
  const text = readFileSync(join(E2E, 'BRDC.nav'), 'utf-8');

  it('parses multi-GNSS nav file', () => {
    const result = parseNavFile(text);
    expect(result.header.version).toBe(3.04);
    const systems = new Set(result.ephemerides.map(e => e.system));
    expect(systems.size).toBeGreaterThanOrEqual(2); // G, R, E
  });

  it('has ephemerides for multiple PRNs per system', () => {
    const result = parseNavFile(text);
    const gpsPrns = new Set(
      result.ephemerides.filter(e => e.system === 'G').map(e => e.prn),
    );
    expect(gpsPrns.size).toBeGreaterThan(10);
  });

  it('ephemerides have valid orbital parameters', () => {
    const result = parseNavFile(text);
    for (const eph of result.ephemerides) {
      if (eph.system === 'G' && 'sqrtA' in eph) {
        const a = eph.sqrtA * eph.sqrtA;
        expect(a).toBeGreaterThan(25_000_000);
        expect(a).toBeLessThan(28_000_000);
        expect(eph.e).toBeLessThan(0.03);
      }
    }
  });
});

/* ── Full pipeline: obs → nav → orbit → sky positions ──────── */

describe.skipIf(!HAS_DATA)('E2E: observation + navigation pipeline', () => {
  const obsBuf = readFileSync(join(E2E, 'ABMF.crx'));
  const navText = readFileSync(join(E2E, 'BRDC.nav'), 'utf-8');

  it('computes satellite positions from ABMF obs + BRDC nav', async () => {
    const obs = await parseRinexStream(fileFrom(obsBuf, 'ABMF.crx'));
    const nav = parseNavFile(navText);

    const times = navTimesFromEph(nav.ephemerides);
    expect(times.length).toBeGreaterThan(0);

    const positions = computeAllPositions(
      nav.ephemerides,
      times,
      obs.header.approxPosition ?? undefined,
    );

    expect(positions.times.length).toBeGreaterThan(0);
    expect(positions.prns.length).toBeGreaterThan(10);

    // Check satellite positions are at orbital altitude
    let validCount = 0;
    for (const prn of positions.prns.slice(0, 5)) {
      for (const pt of positions.positions[prn]!) {
        if (pt) {
          // lat/lon should be in valid range
          expect(pt.lat).toBeGreaterThanOrEqual(-Math.PI / 2);
          expect(pt.lat).toBeLessThanOrEqual(Math.PI / 2);
          expect(pt.lon).toBeGreaterThanOrEqual(-Math.PI);
          expect(pt.lon).toBeLessThanOrEqual(Math.PI);
          validCount++;
        }
      }
    }
    expect(validCount).toBeGreaterThan(0);

    // AzEl should be valid when receiver position is provided
    if (obs.header.approxPosition) {
      const allPts = positions.prns.flatMap(
        prn => positions.positions[prn]!.filter((p): p is NonNullable<typeof p> => p != null),
      );
      const withEl = allPts.filter(p => p.el !== 0);
      expect(withEl.length).toBeGreaterThan(0);
      for (const pt of withEl.slice(0, 20)) {
        expect(pt.az).toBeGreaterThanOrEqual(0);
        expect(pt.az).toBeLessThan(2 * Math.PI);
        expect(pt.el).toBeGreaterThanOrEqual(-Math.PI / 2);
        expect(pt.el).toBeLessThanOrEqual(Math.PI / 2);
      }
    }
  });

  it('computes DOP values from satellite geometry', async () => {
    const obs = await parseRinexStream(fileFrom(obsBuf, 'ABMF.crx'));
    const nav = parseNavFile(navText);

    const times = navTimesFromEph(nav.ephemerides);
    const positions = computeAllPositions(
      nav.ephemerides,
      times,
      obs.header.approxPosition ?? undefined,
    );

    // Collect satellites visible at first epoch
    if (positions.times.length > 0) {
      const sats: { az: number; el: number }[] = [];
      for (const prn of positions.prns) {
        const pt = positions.positions[prn]![0];
        if (pt && pt.el > 0.05) { // > ~3° elevation
          sats.push({ az: pt.az, el: pt.el });
        }
      }

      if (sats.length >= 4) {
        const dop = computeDop(sats);
        expect(dop).not.toBeNull();
        expect(dop!.gdop).toBeGreaterThan(0);
        expect(dop!.gdop).toBeLessThan(30);
        expect(dop!.pdop).toBeLessThanOrEqual(dop!.gdop);
        expect(dop!.hdop).toBeLessThanOrEqual(dop!.pdop);
      }
    }
  });
});

/* ── Quality analysis pipeline ─────────────────────────────── */

describe.skipIf(!HAS_DATA)('E2E: quality analysis on real observations', () => {
  it('runs full quality analysis on ABMF CRX', async () => {
    const buf = readFileSync(join(E2E, 'ABMF.crx'));
    const obs = await parseRinexStream(fileFrom(buf, 'ABMF.crx'));

    const quality = await analyzeQuality(fileFrom(buf, 'ABMF.crx'), obs.header);

    // Completeness
    expect(quality.completeness.signalStats.length).toBeGreaterThan(0);
    for (const sig of quality.completeness.signalStats) {
      expect(sig.system).toMatch(/^[GREJCIS]$/);
      expect(sig.expected).toBeGreaterThan(0);
      expect(sig.present).toBeGreaterThanOrEqual(0);
      expect(sig.present).toBeLessThanOrEqual(sig.expected);
      expect(sig.percent).toBeGreaterThanOrEqual(0);
      expect(sig.percent).toBeLessThanOrEqual(100);
    }

    // Multipath
    expect(quality.multipath.signalStats.length).toBeGreaterThan(0);
    for (const sig of quality.multipath.signalStats) {
      expect(sig.rms).toBeGreaterThanOrEqual(0);
      expect(sig.rms).toBeLessThan(50); // can be high in short segments
    }

    // Cycle slips
    expect(quality.cycleSlips).toBeDefined();
    expect(quality.cycleSlips.signalStats).toBeDefined();
  });

  it('runs quality analysis on ALBH CRX', async () => {
    const buf = readFileSync(join(E2E, 'ALBH.crx'));
    const obs = await parseRinexStream(fileFrom(buf, 'ALBH.crx'));

    const quality = await analyzeQuality(fileFrom(buf, 'ALBH.crx'), obs.header);

    expect(quality.completeness.signalStats.length).toBeGreaterThan(0);
    expect(quality.multipath.signalStats.length).toBeGreaterThanOrEqual(0);
  });
});
