import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock Service Worker globals ---

type FetchListener = (event: MockFetchEvent) => void;

let fetchListener: FetchListener;
let _installListener: (event: {
  waitUntil: (p: Promise<unknown>) => void;
}) => void;
let _activateListener: (event: {
  waitUntil: (p: Promise<unknown>) => void;
}) => void;

const cacheStore = new Map<string, Map<string, Response>>();

const mockCache = {
  put: vi.fn((req: Request | string, res: Response) => {
    const key = typeof req === 'string' ? req : req.url;
    const cacheName = 'gnsscalc-v1';
    if (!cacheStore.has(cacheName)) cacheStore.set(cacheName, new Map());
    cacheStore.get(cacheName)!.set(key, res);
    return Promise.resolve();
  }),
  addAll: vi.fn(() => Promise.resolve()),
  match: vi.fn((req: Request | string): Promise<Response | undefined> => {
    const key = typeof req === 'string' ? req : req.url;
    for (const cache of cacheStore.values()) {
      if (cache.has(key)) return Promise.resolve(cache.get(key)!);
    }
    return Promise.resolve(undefined);
  }),
};

const mockCaches = {
  open: vi.fn(() => Promise.resolve(mockCache)),
  match: vi.fn((req: Request | string): Promise<Response | undefined> => {
    const key = typeof req === 'string' ? req : req.url;
    for (const cache of cacheStore.values()) {
      if (cache.has(key)) return Promise.resolve(cache.get(key)!);
    }
    return Promise.resolve(undefined);
  }),
  keys: vi.fn(() => Promise.resolve([...cacheStore.keys()])),
  delete: vi.fn((name: string) => {
    cacheStore.delete(name);
    return Promise.resolve(true);
  }),
};

class MockFetchEvent {
  request: Request;
  private _responded = false;
  private _response: Promise<Response> | null = null;

  constructor(request: Request) {
    this.request = request;
  }

  respondWith(response: Promise<Response> | Response) {
    this._responded = true;
    this._response =
      response instanceof Response ? Promise.resolve(response) : response;
  }

  get responded() {
    return this._responded;
  }

  async getResponse(): Promise<Response | null> {
    if (!this._responded) return null;
    return this._response;
  }
}

function makeRequest(
  url: string,
  opts: { mode?: string; method?: string; destination?: string } = {},
): Request {
  const req = new Request(url, { method: opts.method ?? 'GET' });
  Object.defineProperty(req, 'mode', { value: opts.mode ?? 'cors' });
  Object.defineProperty(req, 'destination', { value: opts.destination ?? '' });
  return req;
}

// Set up the global mocks before loading the SW
Object.assign(globalThis, {
  self: {
    addEventListener: (type: string, handler: (...args: unknown[]) => void) => {
      if (type === 'fetch') fetchListener = handler as FetchListener;
      if (type === 'install')
        _installListener = handler as typeof _installListener;
      if (type === 'activate')
        _activateListener = handler as typeof _activateListener;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  },
  caches: mockCaches,
});

// Store original fetch so we can restore it
const originalFetch = globalThis.fetch;

// Load the service worker (registers listeners via self.addEventListener)
// @ts-expect-error -- plain JS service worker, no type declarations
await import('../../../public/sw.js');

describe('Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    // Re-assign mock implementations
    mockCache.put = vi.fn((req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      if (!cacheStore.has('gnsscalc-v1'))
        cacheStore.set('gnsscalc-v1', new Map());
      cacheStore.get('gnsscalc-v1')!.set(key, res);
      return Promise.resolve();
    });
    mockCache.addAll = vi.fn(() => Promise.resolve());
    mockCache.match = vi.fn((req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      for (const cache of cacheStore.values()) {
        if (cache.has(key)) return Promise.resolve(cache.get(key)!);
      }
      return Promise.resolve(undefined);
    });
    mockCaches.open = vi.fn(() => Promise.resolve(mockCache));
    mockCaches.match = mockCache.match;
    mockCaches.keys = vi.fn(() => Promise.resolve([...cacheStore.keys()]));
    mockCaches.delete = vi.fn((name: string) => {
      cacheStore.delete(name);
      return Promise.resolve(true);
    });
  });

  describe('fetch handler — never returns null', () => {
    it('ignores non-GET requests', () => {
      const req = makeRequest('https://example.com/api', { method: 'POST' });
      const event = new MockFetchEvent(req);
      fetchListener(event);
      expect(event.responded).toBe(false);
    });

    it('ignores localhost requests', () => {
      const req = makeRequest('http://localhost:3000/');
      const event = new MockFetchEvent(req);
      fetchListener(event);
      expect(event.responded).toBe(false);
    });

    it('navigation: returns network response on success', async () => {
      const networkResponse = new Response('<html></html>', { status: 200 });
      globalThis.fetch = vi.fn(() => Promise.resolve(networkResponse));

      const req = makeRequest('https://gnsscalc.com/', { mode: 'navigate' });
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      globalThis.fetch = originalFetch;
    });

    it('navigation: returns cached response when network fails', async () => {
      // Pre-populate cache
      const cachedResponse = new Response('<html>cached</html>', {
        status: 200,
      });
      cacheStore.set(
        'gnsscalc-v1',
        new Map([['https://gnsscalc.com/', cachedResponse]]),
      );

      globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));

      const req = makeRequest('https://gnsscalc.com/', { mode: 'navigate' });
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      globalThis.fetch = originalFetch;
    });

    it('navigation: returns 503 when network fails and no cache (not null)', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));

      const req = makeRequest('https://gnsscalc.com/', { mode: 'navigate' });
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(503);

      globalThis.fetch = originalFetch;
    });

    it('assets (style/font/image): returns 503 when network fails and no cache (not null)', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));

      const req = makeRequest(
        'https://fonts.googleapis.com/css2?family=Inter',
        { destination: 'style' },
      );
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(response).toBeInstanceOf(Response);
      expect(response!.status).toBe(503);

      globalThis.fetch = originalFetch;
    });

    it('assets (font): returns cached response when network fails', async () => {
      const cachedFont = new Response('font-data', { status: 200 });
      cacheStore.set(
        'gnsscalc-v1',
        new Map([
          ['https://fonts.gstatic.com/s/inter/v1/font.woff2', cachedFont],
        ]),
      );

      globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));

      const req = makeRequest(
        'https://fonts.gstatic.com/s/inter/v1/font.woff2',
        { destination: 'font' },
      );
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      globalThis.fetch = originalFetch;
    });

    it('_astro assets: serves from cache first', async () => {
      const cachedAsset = new Response('cached-js', { status: 200 });
      cacheStore.set(
        'gnsscalc-v1',
        new Map([['https://gnsscalc.com/_astro/chunk.abc123.js', cachedAsset]]),
      );

      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response('network-js')),
      );

      const req = makeRequest('https://gnsscalc.com/_astro/chunk.abc123.js');
      const event = new MockFetchEvent(req);
      fetchListener(event);

      const response = await event.getResponse();
      expect(response).not.toBeNull();
      expect(await response!.text()).toBe('cached-js');

      globalThis.fetch = originalFetch;
    });
  });
});
