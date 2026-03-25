/**
 * Cloudflare Worker — NTRIP CORS proxy.
 *
 * Proxies NTRIP 2.0 requests from the browser to real NTRIP casters,
 * adding CORS headers so the browser allows the connection.
 *
 * Deployment:
 *   npx wrangler deploy tools/ntrip-proxy-worker.js --name ntrip-proxy
 *
 * Or create a wrangler.toml:
 *   name = "ntrip-proxy"
 *   main = "tools/ntrip-proxy-worker.js"
 *   compatibility_date = "2024-01-01"
 *
 * The browser sends requests to the Worker with:
 *   X-Ntrip-Host: www.euref-ip.be
 *   X-Ntrip-Port: 2101  (optional, defaults to 2101)
 *
 * The Worker strips those headers, connects to the caster, and streams
 * the response back with CORS headers.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── IGS broadcast ephemeris proxy ──────────────────────────────
    const igsBrdc = request.headers.get('X-Igs-Brdc');
    if (igsBrdc) {
      // igsBrdc = "YYYY/DOY" e.g. "2026/001"
      if (!/^\d{4}\/\d{3}$/.test(igsBrdc)) {
        return new Response('X-Igs-Brdc must be YYYY/DOY', {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
        });
      }
      const [yyyy, doy] = igsBrdc.split('/');
      const name = `BRDC00IGS_R_${yyyy}${doy}0000_01D_MN.rnx.gz`;
      const bkgUrl = `https://igs.bkg.bund.de/root_ftp/IGS/BRDC/${yyyy}/${doy}/${name}`;
      try {
        const upstream = await fetch(bkgUrl);
        if (!upstream.ok) {
          return new Response(`BKG returned ${upstream.status}`, {
            status: upstream.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
          });
        }
        const responseHeaders = new Headers(CORS_HEADERS);
        responseHeaders.set('Content-Type', 'application/gzip');
        const cl = upstream.headers.get('Content-Length');
        if (cl) responseHeaders.set('Content-Length', cl);
        return new Response(upstream.body, {
          status: 200,
          headers: responseHeaders,
        });
      } catch (err) {
        return new Response(`Proxy error: ${err.message}`, {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
        });
      }
    }

    // ── NTRIP proxy ─────────────────────────────────────────────────
    const casterHost = request.headers.get('X-Ntrip-Host');
    const casterPort = request.headers.get('X-Ntrip-Port') || '2101';

    if (!casterHost) {
      return new Response('Missing X-Ntrip-Host or X-Igs-Brdc header', {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    }

    // Build the target URL
    const url = new URL(request.url);
    const targetUrl = `http://${casterHost}:${casterPort}${url.pathname}${url.search}`;

    // Forward headers, stripping proxy-specific and forbidden ones
    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers) {
      const lower = key.toLowerCase();
      if (
        lower === 'host' ||
        lower === 'x-ntrip-host' ||
        lower === 'x-ntrip-port' ||
        lower === 'origin' ||
        lower === 'referer' ||
        lower === 'cf-connecting-ip' ||
        lower === 'cf-ray' ||
        lower === 'cf-visitor' ||
        lower === 'cf-ipcountry' ||
        lower === 'cf-worker' ||
        lower.startsWith('x-forwarded-') ||
        lower === 'cdn-loop'
      )
        continue;
      forwardHeaders.set(key, value);
    }

    // Ensure User-Agent is set (some casters require "NTRIP" in UA)
    if (!forwardHeaders.has('User-Agent')) {
      forwardHeaders.set('User-Agent', 'NTRIP GNSSCalc/1.0');
    }

    try {
      const casterRes = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body:
          request.method !== 'GET' && request.method !== 'HEAD'
            ? request.body
            : undefined,
        // Don't follow redirects automatically
        redirect: 'manual',
      });

      // Build response headers: CORS + caster headers
      const responseHeaders = new Headers(CORS_HEADERS);
      for (const [key, value] of casterRes.headers) {
        const lower = key.toLowerCase();
        // Skip hop-by-hop headers
        if (lower === 'transfer-encoding' || lower === 'connection') continue;
        responseHeaders.set(key, value);
      }

      // Stream the response body back
      return new Response(casterRes.body, {
        status: casterRes.status,
        statusText: casterRes.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    }
  },
};
