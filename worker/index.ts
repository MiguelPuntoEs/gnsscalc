/**
 * Cloudflare Worker entry point.
 *
 * - Durable Object (EphemerisCollector): maintains a persistent NTRIP connection
 *   to IGS BCEP00BKG0, continuously decodes broadcast ephemeris, and writes
 *   consolidated state to KV every ~10 seconds.
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
const KV_TTL_SECONDS = 300;         // expire if DO stops writing
const KV_WRITE_INTERVAL_MS = 10_000; // flush to KV every 10s
const ALARM_INTERVAL_MS = 10_000;    // keep DO alive

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
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder: Rtcm3Decoder | null = null;
  private abortController: AbortController | null = null;
  private connected = false;
  private lastKvWrite = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    // Kick off on first instantiation
    this.state.blockConcurrencyWhile(async () => {
      await this.ensureAlarm();
    });
  }

  async fetch(_request: Request): Promise<Response> {
    // Any fetch to the DO ensures it's alive and streaming
    await this.ensureAlarm();
    if (!this.connected) {
      this.startStream();
    }
    return new Response('ok');
  }

  async alarm(): Promise<void> {
    // Keep-alive: ensure stream is running, flush to KV, re-arm alarm
    if (!this.connected) {
      this.startStream();
    }

    await this.flushToKv();
    await this.ensureAlarm();
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.state.storage.getAlarm();
    if (!current) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  private startStream(): void {
    if (this.connected) return;
    this.connected = true;
    this.decoder = new Rtcm3Decoder();
    this.abortController = new AbortController();

    const run = async () => {
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
          signal: this.abortController!.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`NTRIP connection failed: ${res.status} ${res.statusText}`);
        }

        this.reader = res.body.getReader();

        while (true) {
          const { done, value } = await this.reader.read();
          if (done) break;

          const frames = this.decoder!.decode(value);
          for (const frame of frames) {
            const eph = decodeEphemeris(frame);
            if (eph) {
              this.satellites[eph.prn] = eph;
            }
          }

          // Flush to KV periodically from the read loop
          if (Date.now() - this.lastKvWrite > KV_WRITE_INTERVAL_MS) {
            await this.flushToKv();
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('NTRIP stream error:', err.message);
        }
      } finally {
        this.connected = false;
        this.reader = null;
        this.decoder = null;
        // Stream dropped — alarm will reconnect
      }
    };

    // Fire and forget — runs in the DO's execution context
    run();
  }

  private async flushToKv(): Promise<void> {
    // Prune satellites not updated in the last 30 minutes
    const now = Date.now();
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
  }
}

/* ── Worker fetch handler ─────────────────────────────────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/constellation-status') {
      // Poke the DO to ensure it's alive and streaming
      const id = env.EPHEMERIS_COLLECTOR.idFromName('singleton');
      const stub = env.EPHEMERIS_COLLECTOR.get(id);
      stub.fetch(new Request('https://dummy/ping')).catch(() => {}); // fire-and-forget

      const raw = await env.EPHEMERIS_KV.get(KV_KEY);
      return new Response(raw ?? JSON.stringify({ updatedAt: 0, satellites: {} }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=10',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Fall through to static assets
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
