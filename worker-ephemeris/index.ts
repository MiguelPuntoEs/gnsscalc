/**
 * Ephemeris Collector Worker (gnsscalc-ephemeris)
 *
 * Deployed independently from the main site. Maintains a persistent NTRIP
 * connection via a Durable Object and serves satellite data on demand.
 *
 * The main site Worker (gnsscalc) calls this via a service binding, so
 * site deploys never restart the DO or interrupt the NTRIP stream.
 */

import { Rtcm3Decoder, decodeEphemeris, type EphemerisInfo } from 'gnss-js';

/* ── Config ───────────────────────────────────────────────────── */

const NTRIP_PROXY = 'https://ntrip-proxy.gnsscalc.com';
const CASTER_HOST = 'products.igs-ip.net';
const CASTER_PORT = 2101;
const MOUNTPOINT = 'BCEP00BKG0';

/* ── Types ────────────────────────────────────────────────────── */

interface Env {
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
  private lastEphReceived = 0;
  private consecutiveFailures = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    // Always arm the alarm to ensure the stream starts/restarts
    await this.state.storage.setAlarm(Date.now() + 100);

    const data: ConstellationStatusData = {
      updatedAt: this.lastEphReceived,
      satellites: this.satellites,
    };

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  async alarm(): Promise<void> {
    console.log('Alarm: starting NTRIP stream');
    const connected = await this.streamLoop();

    if (connected) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s max
    const delay = Math.min(2_000 * 2 ** this.consecutiveFailures, 60_000);
    console.log(
      `Alarm: stream ended, re-arming in ${delay / 1000}s (failures: ${this.consecutiveFailures})`,
    );
    await this.state.storage.setAlarm(Date.now() + delay);
  }

  /** Returns true if the stream connected successfully. */
  private async streamLoop(): Promise<boolean> {
    const controller = new AbortController();
    let connected = false;

    try {
      const headers: Record<string, string> = {
        'Ntrip-Version': 'Ntrip/2.0',
        'User-Agent': 'NTRIP GNSSCalc/1.0',
        'X-Ntrip-Host': CASTER_HOST,
        'X-Ntrip-Port': String(CASTER_PORT),
        Authorization:
          'Basic ' +
          btoa(`${this.env.NTRIP_USERNAME}:${this.env.NTRIP_PASSWORD}`),
      };

      const res = await fetch(`${NTRIP_PROXY}/${MOUNTPOINT}`, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`NTRIP ${res.status} ${res.statusText}`);
      }

      console.log('Connected to NTRIP stream');
      connected = true;
      const reader = res.body.getReader();
      const decoder = new Rtcm3Decoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('Stream ended (server closed)');
          break;
        }

        const frames = decoder.decode(value);
        for (const frame of frames) {
          const eph = decodeEphemeris(frame);
          if (eph) {
            this.satellites[eph.prn] = eph;
            this.lastEphReceived = Date.now();
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('NTRIP stream error:', err.message);
      }
    } finally {
      controller.abort();
    }

    return connected;
  }
}

/* ── Worker fetch handler ─────────────────────────────────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/constellation-status') {
      const id = env.EPHEMERIS_COLLECTOR.idFromName('singleton');
      const stub = env.EPHEMERIS_COLLECTOR.get(id);
      return stub.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
