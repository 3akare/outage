// Cache layer (R9): Cache API when present, per-isolate TTL cache as fallback (R9.2).
// Cache API: https://developers.cloudflare.com/workers/runtime-apis/cache/ . put() needs a GET request key, rejects 206 and `Vary: *`,
// and returns 413 when Cache-Control forbids caching. The Cache API is a lower-level store that does not read through and does not
// collapse concurrent requests, which is why the fallback exists: https://developers.cloudflare.com/workers/cache/limitations/
//
// Nonce decision (task 5): the cached body keeps NONCE_PLACEHOLDER and `finalize` writes a fresh nonce into body and CSP header on every
// serve. So no nonce is ever reused across viewers and no hashes are needed. Cost: one string split per serve (microseconds).
//
// Untested here: whether the Cache API actually stores on the deployed domain (R9.2, design section 9). That needs a deploy; see notes.
import { finalize, type Rendered } from './headers.ts';

/** The subset of the Workers Cache that we use. `caches.default` satisfies it. */
export interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export const PAGE_TTL_SECONDS = 30;
export const STATIC_TTL_SECONDS = 3600;
const MAX_ISOLATE_ENTRIES = 200;

type Entry = { rendered: Rendered; storedAtMs: number; expiresAtMs: number };

export type PageCacheOptions = {
  /** `caches.default` in the Worker; null or undefined when the Cache API is unavailable. */
  cache?: CacheLike | null;
  now?: () => number;
  maxEntries?: number;
  /**
   * The deploy's version id (the Worker's version metadata). It is part of every key, so a new deploy never serves pages
   * cached by the one before it. https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/
   */
  version?: string;
};

export type CacheLayer = 'cache-api' | 'isolate' | 'miss';

export class PageCache {
  private readonly cache: CacheLike | null;
  private readonly now: () => number;
  private readonly max: number;
  private readonly store = new Map<string, Entry>();
  private readonly version: string;

  constructor(opts: PageCacheOptions = {}) {
    this.cache = opts.cache ?? null;
    this.now = opts.now ?? Date.now;
    this.max = opts.maxEntries ?? MAX_ISOLATE_ENTRIES;
    this.version = opts.version ?? '';
  }

  /** The cache key: always a GET for the same URL (HEAD shares GET's entry), tagged with the deploy's version. */
  static key(request: Request, version = ''): Request {
    const url = new URL(request.url);
    url.hash = '';
    if (version) url.searchParams.set('__deploy', version);
    return new Request(url.toString(), { method: 'GET' });
  }

  /**
   * Returns the cached response or renders, stores and returns a new one. Only 200 responses with ttl > 0 are stored.
   * A render that returns ttlSeconds 5 (index unavailable) is stored for 5 seconds only.
   */
  async get(request: Request, render: () => Promise<Rendered> | Rendered): Promise<Response> {
    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
    const key = PageCache.key(request, this.version);
    const hit = await this.lookup(key);
    if (hit) return this.respond(hit.rendered, method, hit.layer);
    const rendered = await render();
    if (rendered.status === 200 && rendered.ttlSeconds > 0) await this.store_(key, rendered);
    return this.respond(rendered, method, 'miss');
  }

  private respond(rendered: Rendered, method: string, layer: CacheLayer): Response {
    return finalize({ ...rendered, headers: { ...(rendered.headers ?? {}), 'X-Outage-Cache': layer } }, method);
  }

  private async lookup(key: Request): Promise<{ rendered: Rendered; layer: CacheLayer } | null> {
    if (this.cache) {
      try {
        const res = await this.cache.match(key);
        if (res) {
          const ttl = Number(res.headers.get('X-Outage-Ttl') ?? '0');
          return {
            layer: 'cache-api',
            rendered: {
              status: res.status,
              contentType: res.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
              body: await res.text(),
              ttlSeconds: ttl,
              noindex: res.headers.get('X-Robots-Tag') === 'noindex',
              map: res.headers.get('X-Outage-Map') === '1',
            },
          };
        }
      } catch {
        // Cache API failed: fall through to the isolate cache.
      }
    }
    const url = key.url;
    const entry = this.store.get(url);
    if (entry) {
      if (this.now() < entry.expiresAtMs) return { layer: 'isolate', rendered: entry.rendered };
      this.store.delete(url); // never serve past the TTL (W4)
    }
    return null;
  }

  private async store_(key: Request, rendered: Rendered): Promise<void> {
    const now = this.now();
    if (this.cache) {
      try {
        // Stored body keeps the nonce placeholder. Cache-Control makes the edge expire it after ttl.
        await this.cache.put(
          key,
          new Response(rendered.body, {
            headers: {
              'Content-Type': rendered.contentType,
              'Cache-Control': `public, max-age=${rendered.ttlSeconds}, s-maxage=${rendered.ttlSeconds}`,
              'X-Outage-Ttl': String(rendered.ttlSeconds),
              ...(rendered.noindex ? { 'X-Robots-Tag': 'noindex' } : {}),
              ...(rendered.map ? { 'X-Outage-Map': '1' } : {}),
            },
          }),
        );
      } catch {
        // put() can throw or return 413; the isolate cache below still covers this isolate.
      }
    }
    if (this.store.size >= this.max) {
      // Drop expired entries first, then the oldest.
      for (const [k, v] of this.store) if (v.expiresAtMs <= now) this.store.delete(k);
      while (this.store.size >= this.max) {
        const oldest = this.store.keys().next().value;
        if (oldest === undefined) break;
        this.store.delete(oldest);
      }
    }
    this.store.delete(key.url);
    this.store.set(key.url, { rendered, storedAtMs: now, expiresAtMs: now + rendered.ttlSeconds * 1000 });
  }

  get size(): number {
    return this.store.size;
  }
}
