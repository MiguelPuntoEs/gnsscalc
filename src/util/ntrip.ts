/**
 * App-specific NTRIP wrappers that bind the proxy URL.
 * Types and pure functions should be imported directly from gnss-js/ntrip or gnss-js/rtcm3.
 */

import {
  fetchSourcetable as _fetchSourcetable,
  connectToMountpoint as _connectToMountpoint,
} from 'gnss-js/ntrip';
import type {
  NtripConnectionInfo,
  Sourcetable,
  NtripStreamConnection,
} from 'gnss-js/ntrip';

/** CORS proxy URL (Cloudflare Worker). */
const PROXY_URL = 'https://ntrip-proxy.gnsscalc.com';

export async function fetchSourcetable(
  info: NtripConnectionInfo,
  signal?: AbortSignal,
): Promise<Sourcetable> {
  return _fetchSourcetable(PROXY_URL, info, signal);
}

export async function connectToMountpoint(
  info: NtripConnectionInfo & { mountpoint: string },
  signal?: AbortSignal,
): Promise<NtripStreamConnection> {
  return _connectToMountpoint(PROXY_URL, info, signal);
}
