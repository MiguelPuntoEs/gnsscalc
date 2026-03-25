import { describe, it, expect } from 'vitest';
import { Rtcm3Decoder } from 'gnss-js/rtcm3';
import { decodeEphemeris } from 'gnss-js/rtcm3';

describe('BCEP00BKG0 live connection', () => {
  it('connects and decodes ephemeris from IGS stream', async () => {
    const username = process.env.NTRIP_USERNAME;
    const password = process.env.NTRIP_PASSWORD;
    if (!username || !password) {
      console.log('Skipping: NTRIP_USERNAME / NTRIP_PASSWORD not set in .env');
      return;
    }

    const headers: Record<string, string> = {
      'Ntrip-Version': 'Ntrip/2.0',
      'User-Agent': 'NTRIP GNSSCalc/1.0',
      'X-Ntrip-Host': 'products.igs-ip.net',
      'X-Ntrip-Port': '2101',
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
    };

    const controller = new AbortController();
    const res = await fetch('https://ntrip-proxy.gnsscalc.com/BCEP00BKG0', {
      headers,
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();

    const reader = res.body!.getReader();
    const decoder = new Rtcm3Decoder();
    const deadline = Date.now() + 15000;
    const seen = new Map<string, { health: number; msg: number }>();

    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      const frames = decoder.decode(value);
      for (const frame of frames) {
        const eph = decodeEphemeris(frame);
        if (eph) {
          seen.set(eph.prn, { health: eph.health, msg: eph.messageType });
        }
      }
    }

    void reader.cancel();
    controller.abort();

    console.log(`Decoded ${seen.size} satellites in 8 seconds:`);
    const sorted = [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [prn, info] of sorted) {
      console.log(`  ${prn}  health=${info.health}  msg=${info.msg}`);
    }

    // Verify constellations
    const bySystem: Record<string, number> = {};
    for (const [prn] of seen) {
      const sys = prn.charAt(0);
      bySystem[sys] = (bySystem[sys] ?? 0) + 1;
    }
    console.log('\nBy constellation:', bySystem);

    expect(seen.size).toBeGreaterThan(0);
    expect(bySystem['G']).toBeGreaterThan(0); // GPS
    expect(bySystem['E']).toBeGreaterThan(0); // Galileo
    expect(bySystem['R']).toBeGreaterThan(0); // GLONASS
    expect(bySystem['C']).toBeGreaterThan(0); // BeiDou
  }, 25000);
});
