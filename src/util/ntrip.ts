/**
 * NTRIP client library — supports both NTRIP 1.0 and 2.0 protocols.
 *
 * NTRIP (Networked Transport of RTCM via Internet Protocol) streams GNSS
 * correction data from a caster to clients over HTTP.
 *
 * Protocol differences:
 *  - NTRIP 1.0: ICY-style responses, no chunked encoding, User-Agent starts with "NTRIP"
 *  - NTRIP 2.0: Standard HTTP/1.1, chunked transfer encoding, Ntrip-Version header
 *
 * Since browsers can't connect directly to NTRIP casters (CORS), all requests
 * are proxied through a lightweight endpoint (e.g. Cloudflare Worker).
 */

/* ================================================================== */
/*  Re-exports from sub-modules                                        */
/* ================================================================== */

export { Rtcm3Decoder, BitReader, type Rtcm3Frame } from './rtcm3-decoder';
export { type EphemerisInfo, decodeEphemeris } from './rtcm3-ephemeris';
export { type StationMeta, createStationMeta } from './rtcm3-station';
export {
  type StreamStats, type MessageTypeStats, type SatCn0, type SignalCn0,
  RTCM3_MESSAGE_NAMES, createStreamStats, updateStreamStats, rtcm3Constellation,
} from './rtcm3-stats';

/* ================================================================== */
/*  Public types                                                       */
/* ================================================================== */

export type NtripVersion = '1.0' | '2.0';

/** A STR (stream) entry from the sourcetable. */
export interface NtripStream {
  type: 'STR';
  mountpoint: string;
  identifier: string;
  format: string;
  formatDetails: string;
  carrier: number;          // 0=No, 1=L1, 2=L1+L2
  navSystem: string;        // e.g. "GPS+GLO+GAL+BDS"
  network: string;
  country: string;
  latitude: number;
  longitude: number;
  nmea: number;             // 0=No, 1=Yes
  solution: number;         // 0=Single, 1=Network
  generator: string;
  compression: string;
  authentication: string;   // N=None, B=Basic, D=Digest
  fee: string;              // N=No, Y=Yes
  bitrate: number;
  misc: string;
}

/** A CAS (caster) entry from the sourcetable. */
export interface NtripCaster {
  type: 'CAS';
  host: string;
  port: number;
  identifier: string;
  operator: string;
  nmea: number;
  country: string;
  latitude: number;
  longitude: number;
  fallbackHost: string;
  fallbackPort: number;
  misc: string;
}

/** A NET (network) entry from the sourcetable. */
export interface NtripNetwork {
  type: 'NET';
  identifier: string;
  operator: string;
  authentication: string;
  fee: string;
  webUrl: string;
  streamUrl: string;
  registrationUrl: string;
  misc: string;
}

export type SourcetableEntry = NtripStream | NtripCaster | NtripNetwork;

export interface Sourcetable {
  streams: NtripStream[];
  casters: NtripCaster[];
  networks: NtripNetwork[];
  raw: string;
}

export interface NtripConnectionInfo {
  host: string;
  port: number;
  mountpoint?: string;
  username?: string;
  password?: string;
  version: NtripVersion;
}

/* ================================================================== */
/*  Sourcetable parser                                                 */
/* ================================================================== */

function parseStreamEntry(fields: string[]): NtripStream | null {
  if (fields.length < 19) return null;
  return {
    type: 'STR',
    mountpoint: fields[1] ?? '',
    identifier: fields[2] ?? '',
    format: fields[3] ?? '',
    formatDetails: fields[4] ?? '',
    carrier: parseInt(fields[5] ?? '0') || 0,
    navSystem: fields[6] ?? '',
    network: fields[7] ?? '',
    country: fields[8] ?? '',
    latitude: parseFloat(fields[9] ?? '0') || 0,
    longitude: parseFloat(fields[10] ?? '0') || 0,
    nmea: parseInt(fields[11] ?? '0') || 0,
    solution: parseInt(fields[12] ?? '0') || 0,
    generator: fields[13] ?? '',
    compression: fields[14] ?? '',
    authentication: fields[15] ?? 'N',
    fee: fields[16] ?? 'N',
    bitrate: parseInt(fields[17] ?? '0') || 0,
    misc: fields[18] ?? '',
  };
}

function parseCasterEntry(fields: string[]): NtripCaster | null {
  if (fields.length < 12) return null;
  return {
    type: 'CAS',
    host: fields[1] ?? '',
    port: parseInt(fields[2] ?? '0') || 0,
    identifier: fields[3] ?? '',
    operator: fields[4] ?? '',
    nmea: parseInt(fields[5] ?? '0') || 0,
    country: fields[6] ?? '',
    latitude: parseFloat(fields[7] ?? '0') || 0,
    longitude: parseFloat(fields[8] ?? '0') || 0,
    fallbackHost: fields[9] ?? '',
    fallbackPort: parseInt(fields[10] ?? '0') || 0,
    misc: fields[11] ?? '',
  };
}

function parseNetworkEntry(fields: string[]): NtripNetwork | null {
  if (fields.length < 9) return null;
  return {
    type: 'NET',
    identifier: fields[1] ?? '',
    operator: fields[2] ?? '',
    authentication: fields[3] ?? '',
    fee: fields[4] ?? '',
    webUrl: fields[5] ?? '',
    streamUrl: fields[6] ?? '',
    registrationUrl: fields[7] ?? '',
    misc: fields[8] ?? '',
  };
}

/** Parse the full sourcetable text returned by a caster. */
export function parseSourcetable(text: string): Sourcetable {
  const streams: NtripStream[] = [];
  const casters: NtripCaster[] = [];
  const networks: NtripNetwork[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line === 'ENDSOURCETABLE') continue;

    const fields = line.split(';');
    const entryType = fields[0]?.toUpperCase();

    if (entryType === 'STR') {
      const entry = parseStreamEntry(fields);
      if (entry) streams.push(entry);
    } else if (entryType === 'CAS') {
      const entry = parseCasterEntry(fields);
      if (entry) casters.push(entry);
    } else if (entryType === 'NET') {
      const entry = parseNetworkEntry(fields);
      if (entry) networks.push(entry);
    }
  }

  return { streams, casters, networks, raw: text };
}

/* ================================================================== */
/*  NTRIP fetch helpers                                                */
/* ================================================================== */

/** CORS proxy URL (Cloudflare Worker). */
const PROXY_URL = 'https://ntrip-proxy.gnsscalc.com';

function buildAuthHeader(username?: string, password?: string): string | null {
  if (!username) return null;
  return 'Basic ' + btoa(`${username}:${password ?? ''}`);
}

/**
 * Build headers for a proxied NTRIP request.
 *
 * The proxy expects:
 *   X-Ntrip-Host / X-Ntrip-Port  – target caster
 * and forwards all other headers (Ntrip-Version, Authorization, …) as-is.
 */
function ntripHeaders(info: NtripConnectionInfo): Record<string, string> {
  const headers: Record<string, string> = {
    'Ntrip-Version': info.version === '2.0' ? 'Ntrip/2.0' : 'Ntrip/1.0',
    'User-Agent': 'NTRIP GNSSCalc/1.0',
    'X-Ntrip-Host': info.host,
    'X-Ntrip-Port': String(info.port),
  };
  const auth = buildAuthHeader(info.username, info.password);
  if (auth) headers['Authorization'] = auth;
  return headers;
}

/**
 * Fetch through the CORS proxy.
 */
async function ntripFetch(path: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
  const url = `${PROXY_URL}${path}`;
  try {
    return await fetch(url, { headers, signal });
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    throw new Error(
      `Could not reach the NTRIP proxy: ${err.message ?? 'The service may be temporarily unavailable.'}`
    );
  }
}

/**
 * Fetch the sourcetable from an NTRIP caster.
 *
 * NTRIP 1.0: GET / with User-Agent starting with "NTRIP"
 *   Response: "SOURCETABLE 200 OK\r\n..." (non-standard HTTP)
 *
 * NTRIP 2.0: Standard HTTP GET / with Ntrip-Version header
 *   Response: HTTP/1.1 200 OK with Content-Type: gnss/sourcetable
 */
export async function fetchSourcetable(
  info: NtripConnectionInfo,
  signal?: AbortSignal,
): Promise<Sourcetable> {
  const headers = ntripHeaders(info);
  const res = await ntripFetch('/', headers, signal);

  if (res.status === 401) {
    throw new Error('Authentication required. Please provide valid credentials.');
  }
  if (!res.ok) {
    throw new Error(`Caster returned ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  return parseSourcetable(text);
}

/* ================================================================== */
/*  Stream connection                                                  */
/* ================================================================== */

export interface NtripStreamConnection {
  /** Async iterator of raw data chunks from the mountpoint. */
  reader: ReadableStreamDefaultReader<Uint8Array>;
  /** Abort the connection. */
  abort: () => void;
}

/**
 * Connect to an NTRIP mountpoint and return a stream reader.
 *
 * NTRIP 1.0 response: "ICY 200 OK\r\n" followed by raw binary data
 * NTRIP 2.0 response: Standard HTTP/1.1 200, possibly chunked, Content-Type: gnss/data
 */
export async function connectToMountpoint(
  info: NtripConnectionInfo & { mountpoint: string },
  signal?: AbortSignal,
): Promise<NtripStreamConnection> {
  const headers = ntripHeaders(info);

  const controller = new AbortController();
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  const res = await ntripFetch(`/${info.mountpoint}`, headers, combinedSignal);

  if (res.status === 401) {
    throw new Error('Authentication required for this mountpoint.');
  }
  if (res.status === 404) {
    throw new Error(`Mountpoint "/${info.mountpoint}" not found on caster.`);
  }
  if (!res.ok) {
    throw new Error(`Caster returned ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('No response body — streaming not supported by this browser.');
  }

  return {
    reader: res.body.getReader(),
    abort: () => controller.abort(),
  };
}
