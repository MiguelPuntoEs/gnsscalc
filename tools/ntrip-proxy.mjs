#!/usr/bin/env node
/**
 * Minimal NTRIP CORS proxy for local development.
 *
 * Usage:  node tools/ntrip-proxy.mjs [port]
 *         Default port: 2102
 *
 * Routes:
 *   GET /                          → proxied to the caster (sourcetable)
 *   GET /<mountpoint>              → proxied to the caster (stream)
 *
 * The target caster is specified via headers:
 *   X-Ntrip-Host: www.euref-ip.be
 *   X-Ntrip-Port: 2101            (optional, defaults to 2101)
 *
 * The proxy strips these headers and forwards everything else to the caster,
 * then streams the response back with CORS headers.
 */

import http from 'node:http';

const PORT = parseInt(process.argv[2] || '2102', 10);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

const server = http.createServer((clientReq, clientRes) => {
  // Handle CORS preflight
  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(204, CORS_HEADERS);
    clientRes.end();
    return;
  }

  const casterHost = clientReq.headers['x-ntrip-host'];
  const casterPort = parseInt(clientReq.headers['x-ntrip-port'] || '2101', 10);

  if (!casterHost) {
    clientRes.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    clientRes.end('Missing X-Ntrip-Host header');
    return;
  }

  // Build headers to forward to caster (strip proxy-specific ones)
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(clientReq.headers)) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'x-ntrip-host' || lower === 'x-ntrip-port' || lower === 'origin' || lower === 'referer') continue;
    forwardHeaders[key] = value;
  }
  // NTRIP casters check User-Agent
  if (!forwardHeaders['user-agent']) {
    forwardHeaders['User-Agent'] = 'NTRIP GNSSCalc/1.0';
  }

  const path = clientReq.url || '/';
  console.log(`→ ${clientReq.method} ${casterHost}:${casterPort}${path}`);

  const proxyReq = http.request(
    {
      hostname: casterHost,
      port: casterPort,
      path,
      method: clientReq.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      console.log(`  ← ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

      // Merge CORS headers with caster response headers
      const responseHeaders = { ...CORS_HEADERS };
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (key.toLowerCase() !== 'transfer-encoding') {
          responseHeaders[key] = value;
        }
      }

      clientRes.writeHead(proxyRes.statusCode || 200, responseHeaders);
      proxyRes.pipe(clientRes);
    }
  );

  proxyReq.on('error', (err) => {
    console.error(`  ✗ ${err.message}`);
    clientRes.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    clientRes.end(`Proxy error: ${err.message}`);
  });

  // Forward request body if any
  clientReq.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`NTRIP CORS proxy listening on http://localhost:${PORT}`);
  console.log('The browser app will use this automatically when running locally.');
});
