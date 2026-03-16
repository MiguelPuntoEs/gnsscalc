/**
 * Main site Worker (gnsscalc)
 *
 * Serves static assets and proxies /api/constellation-status to the
 * ephemeris Worker via a service binding. The ephemeris Worker is
 * deployed independently so site deploys don't restart the DO.
 */

interface Env {
  ASSETS: Fetcher;
  EPHEMERIS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/constellation-status') {
      return env.EPHEMERIS.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
