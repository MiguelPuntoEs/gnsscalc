/**
 * Cloudflare Worker entry point.
 *
 * - Durable Object (EphemerisCollector): maintains a persistent NTRIP
 *   connection to IGS BCEP00BKG0. The fetch handler awaits the stream
 *   read loop, keeping the DO alive for the entire connection lifetime.
 *   Alarms act as a watchdog — if the stream drops, the alarm reconnects.
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
const KV_FLUSH_INTERVAL_MS = 10_000; // write to KV every 10s
const WATCHDOG_INTERVAL_MS = 30_000; // alarm checks every 30s

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
  private streaming = false;
  private lastKvWrite = 0;
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    if (!this.initialized) await this.initialize();

    // Arm the watchdog alarm
    await this.armWatchdog();

    if (this.streaming) {
      // Already streaming from another fetch — just return
      return new Response('already streaming');
    }

    // Start the persistent stream. This await blocks the fetch handler,
    // keeping the DO alive for the entire stream lifetime.
    console.log('Starting persistent NTRIP stream');
    await this.streamLoop();

    return new Response('stream ended');
  }

  async alarm(): Promise<void> {
    // Watchdog: if we're not streaming, poke ourselves to reconnect
    if (!this.streaming) {
      console.log('Watchdog: stream not active, reconnecting');
      if (!this.initialized) await this.initialize();
      await this.armWatchdog();
      await this.streamLoop();
    } else {
      // Stream is alive, just re-arm
      await this.armWatchdog();
    }
  }

  private async armWatchdog(): Promise<void> {
    const current = await this.state.storage.getAlarm();
    if (!current) {
      await this.state.storage.setAlarm(Date.now() + WATCHDOG_INTERVAL_MS);
    }
  }

  private async initialize(): Promise<void> {
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

  private async streamLoop(): Promise<void> {
    if (this.streaming) return;
    this.streaming = true;

    const controller = new AbortController();

    try {
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

      console.log('Connected to NTRIP stream');
      const reader = res.body.getReader();
      const decoder = new Rtcm3Decoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('NTRIP stream ended (server closed)');
          break;
        }

        const frames = decoder.decode(value);
        for (const frame of frames) {
          const eph = decodeEphemeris(frame);
          if (eph) {
            this.satellites[eph.prn] = eph;
          }
        }

        // Periodic flush to KV
        if (Date.now() - this.lastKvWrite > KV_FLUSH_INTERVAL_MS) {
          await this.flushToKv();
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('NTRIP stream error:', err.message);
      }
    } finally {
      this.streaming = false;
      controller.abort();
      // Final flush
      await this.flushToKv();
      // Re-arm watchdog to reconnect
      await this.state.storage.setAlarm(Date.now() + 2_000);
      console.log('Stream disconnected, watchdog will reconnect in 2s');
    }
  }

  private async flushToKv(): Promise<void> {
    const now = Date.now();
    // Prune stale satellites
    for (const [prn, eph] of Object.entries(this.satellites)) {
      if (now - eph.lastReceived > 30 * 60 * 1000) {
        delete this.satellites[prn];
      }
    }

    const data: ConstellationStatusData = {
      updatedAt: now,
      satellites: this.satellites,
    };
    await this.env.EPHEMERIS_KV.put(KV_KEY, JSON.stringify(data), {
      expirationTtl: KV_TTL_SECONDS,
    });
    this.lastKvWrite = now;
    console.log(`Flushed ${Object.keys(this.satellites).length} satellites to KV`);
  }
}

/* ── Worker fetch handler ─────────────────────────────────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/constellation-status') {
      // Poke the DO to ensure it's alive (fire-and-forget — the DO's
      // fetch blocks for the stream lifetime, we don't want to wait)
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
