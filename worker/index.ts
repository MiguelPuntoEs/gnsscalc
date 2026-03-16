/**
 * Cloudflare Worker entry point.
 *
 * - Durable Object (EphemerisCollector): wakes every 10s via alarm,
 *   connects to IGS BCEP00BKG0, reads ephemeris for ~8s, flushes to KV,
 *   then re-arms the alarm. This gives near-continuous coverage without
 *   requiring a persistent connection (which DOs can't sustain across
 *   handler boundaries).
 * - GET /api/constellation-status: reads KV and returns JSON.
 * - Everything else falls through to static assets.
 */

import { Rtcm3Decoder } from '../src/util/rtcm3-decoder';
import { decodeEphemeris } from '../src/util/rtcm3-ephemeris';
import type { EphemerisInfo } from '../src/util/rtcm3-ephemeris';

/* ── Config ───────────────────────────────────────────────────── */

const NTRIP_PROXY = 'https://ntrip-proxy.gnsscalc.com';
const CASTER_HOST = 'products.igs-ip.net';
const CASTER_PORT = 2101;
const MOUNTPOINT = 'BCEP00BKG0';
const KV_KEY = 'constellation-status';
const KV_TTL_SECONDS = 300;
const READ_DURATION_MS = 8_000;    // read stream for 8s per alarm cycle
const ALARM_INTERVAL_MS = 2_000;   // pause 2s between cycles (so ~8s on, 2s off)

/* ── Types ────────────────────────────────────────────────────── */

interface Env {
  ASSETS: Fetcher;
  EPHEMERIS_KV: KVNamespace;
  EPHEMERIS_COLLECTOR: DurableObjectNamespace;
  NTRIP_USERNAME: string;
  NTRIP_PASSWORD: string;
}

export interface ConstellationStatusData {
  updatedAt: number;
  satellites: Record<string, EphemerisInfo>;
}

/* ── Durable Object: EphemerisCollector ───────────────────────── */

export class EphemerisCollector implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private satellites: Record<string, EphemerisInfo> = {};
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    // Ensure alarm loop is running
    if (!this.initialized) {
      await this.initialize();
    }
    const current = await this.state.storage.getAlarm();
    if (!current) {
      await this.state.storage.setAlarm(Date.now() + 100);
    }
    return new Response('ok');
  }

  async alarm(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.collectAndFlush();
    } catch (err: any) {
      console.error('Ephemeris collection error:', err.message);
    }

    // Re-arm alarm for next cycle
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  private async initialize(): Promise<void> {
    // Load existing state from KV on first wake
    try {
      const raw = await this.env.EPHEMERIS_KV.get(KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ConstellationStatusData;
        this.satellites = parsed.satellites;
        console.log(`Loaded ${Object.keys(this.satellites).length} satellites from KV`);
      }
    } catch { /* start fresh */ }
    this.initialized = true;
  }

  private async collectAndFlush(): Promise<void> {
    const controller = new AbortController();
    const headers: Record<string, string> = {
      'Ntrip-Version': 'Ntrip/2.0',
      'User-Agent': 'NTRIP GNSSCalc/1.0',
      'X-Ntrip-Host': CASTER_HOST,
      'X-Ntrip-Port': String(CASTER_PORT),
      'Authorization': 'Basic ' + btoa(`${this.env.NTRIP_USERNAME}:${this.env.NTRIP_PASSWORD}`),
    };

    const res = await fetch(`${NTRIP_PROXY}/${MOUNTPOINT}`, {
      headers,
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`NTRIP ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new Rtcm3Decoder();
    const deadline = Date.now() + READ_DURATION_MS;
    let newCount = 0;

    try {
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;

        const frames = decoder.decode(value);
        for (const frame of frames) {
          const eph = decodeEphemeris(frame);
          if (eph) {
            this.satellites[eph.prn] = eph;
            newCount++;
          }
        }
      }
    } finally {
      reader.cancel();
      controller.abort();
    }

    // Prune stale satellites (not updated in 30 min)
    const now = Date.now();
    for (const [prn, eph] of Object.entries(this.satellites)) {
      if (now - eph.lastReceived > 30 * 60 * 1000) {
        delete this.satellites[prn];
      }
    }

    // Write to KV
    const data: ConstellationStatusData = {
      updatedAt: now,
      satellites: this.satellites,
    };
    await this.env.EPHEMERIS_KV.put(KV_KEY, JSON.stringify(data), {
      expirationTtl: KV_TTL_SECONDS,
    });

    console.log(`Collected ${newCount} ephemeris, ${Object.keys(this.satellites).length} total satellites`);
  }
}

/* ── Worker fetch handler ─────────────────────────────────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/constellation-status') {
      // Poke the DO to ensure it's alive
      const id = env.EPHEMERIS_COLLECTOR.idFromName('singleton');
      const stub = env.EPHEMERIS_COLLECTOR.get(id);
      stub.fetch(new Request('https://dummy/ping')).catch(() => {});

      const raw = await env.EPHEMERIS_KV.get(KV_KEY);
      return new Response(raw ?? JSON.stringify({ updatedAt: 0, satellites: {} }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=10',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
