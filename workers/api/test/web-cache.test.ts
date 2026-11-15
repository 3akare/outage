import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache, type CacheLike } from '../src/web/site/cache.ts';
import { html, json, NONCE_PLACEHOLDER, type Rendered } from '../src/web/site/headers.ts';

const runs = Number(process.env.FC_NUM_RUNS ?? 100);
const req = (path: string, method = 'GET') => new Request(`https://outage.test${path}`, { method });
const page = (text: string, ttl = 30): Rendered => html(`<p nonce="${NONCE_PLACEHOLDER}">${text}</p>`, ttl);

/** A Cache API test double. Honors nothing about TTL on its own, like the real one honors Cache-Control; tests set `dropAll` to model expiry. */
class FakeCache implements CacheLike {
  readonly map = new Map<string, Response>();
  puts = 0;
  async match(r: Request) {
    return this.map.get(r.url)?.clone();
  }
  async put(r: Request, res: Response) {
    if (r.method !== 'GET') throw new TypeError('put needs GET');
    this.puts++;
    this.map.set(r.url, res.clone());
  }
}

describe('W4 cache ttl', () => {
  it('W4_cache_ttl: isolate fallback serves within the TTL and renders again after it', async () => {
    let t = 1_000_000;
    let renders = 0;
    const cache = new PageCache({ now: () => t });
    const get = () => cache.get(req('/area/yaba'), () => {
      renders++;
      return page(`v${renders}`, 30);
    });
    const first = await get();
    expect(first.headers.get('X-Outage-Cache')).toBe('miss');
    expect(first.headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=30');
    t += 29_999;
    const hit = await get();
    expect(hit.headers.get('X-Outage-Cache')).toBe('isolate');
    expect(await hit.text()).toContain('v1');
    t += 1; // exactly the TTL: stale
    const again = await get();
    expect(again.headers.get('X-Outage-Cache')).toBe('miss');
    expect(await again.text()).toContain('v2');
    expect(renders).toBe(2);
  });

  it('W4_cache_ttl: never serves an entry older than its TTL, for any sequence of times and TTLs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ gap: fc.integer({ min: 0, max: 120_000 }), ttl: fc.constantFrom(5, 30, 3600), path: fc.constantFrom('/a', '/b', '/c') }), { minLength: 1, maxLength: 25 }),
        async (steps) => {
          let t = 0;
          const born = new Map<string, { at: number; ttl: number }>();
          const cache = new PageCache({ now: () => t, maxEntries: 2 });
          for (const s of steps) {
            t += s.gap;
            const res = await cache.get(req(s.path), () => {
              born.set(s.path, { at: t, ttl: s.ttl });
              return page(s.path, s.ttl);
            });
            if (res.headers.get('X-Outage-Cache') === 'isolate') {
              const b = born.get(s.path);
              expect(b).toBeDefined();
              expect(t - (b?.at ?? 0)).toBeLessThan((b?.ttl ?? 0) * 1000);
            }
            expect(cache.size).toBeLessThanOrEqual(2);
          }
        },
      ),
      { numRuns: runs },
    );
  });

  it('W4_cache_ttl: uses the Cache API when present and falls back to the isolate when it throws', async () => {
    const fake = new FakeCache();
    let renders = 0;
    const c1 = new PageCache({ cache: fake });
    await c1.get(req('/'), () => {
      renders++;
      return page('x');
    });
    expect(fake.puts).toBe(1);
    const c2 = new PageCache({ cache: fake }); // a new isolate sees the shared cache
    const hit = await c2.get(req('/'), () => {
      renders++;
      return page('y');
    });
    expect(hit.headers.get('X-Outage-Cache')).toBe('cache-api');
    expect(renders).toBe(1);

    const broken: CacheLike = {
      match: async () => {
        throw new Error('no cache');
      },
      put: async () => {
        throw new Error('no cache');
      },
    };
    const c3 = new PageCache({ cache: broken });
    await c3.get(req('/z'), () => page('z'));
    const h3 = await c3.get(req('/z'), () => page('again'));
    expect(h3.headers.get('X-Outage-Cache')).toBe('isolate');
  });

  it('W4_cache_ttl: only 200 responses with a positive TTL are stored; 5 s pages expire after 5 s', async () => {
    let t = 0;
    const cache = new PageCache({ now: () => t });
    await cache.get(req('/404'), () => ({ ...page('nf'), status: 404 }));
    await cache.get(req('/zero'), () => page('z', 0));
    expect(cache.size).toBe(0);
    await cache.get(req('/short'), () => page('s', 5));
    t = 4_999;
    expect((await cache.get(req('/short'), () => page('s2', 5))).headers.get('X-Outage-Cache')).toBe('isolate');
    t = 5_000;
    expect((await cache.get(req('/short'), () => page('s3', 5))).headers.get('X-Outage-Cache')).toBe('miss');
  });

  it('W4_cache_ttl: each serve of a cached page gets its own nonce, matching header and body', async () => {
    const cache = new PageCache({ cache: new FakeCache() });
    const nonces = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const res = await cache.get(req('/'), () => page('n'));
      const n = /nonce-([^']+)'/.exec(res.headers.get('Content-Security-Policy') ?? '')?.[1] ?? '';
      expect((await res.text()).includes(`nonce="${n}"`)).toBe(true);
      nonces.add(n);
    }
    expect(nonces.size).toBe(3);
  });

  it('W4_cache_ttl: HEAD shares the GET entry, keeps headers, and a query string is part of the key', async () => {
    const cache = new PageCache();
    await cache.get(req('/api/v1/public/cell/x/outages?days=30'), () => json({ a: 1 }, 30));
    const head = await cache.get(req('/api/v1/public/cell/x/outages?days=30', 'HEAD'), () => json({ a: 2 }, 30));
    expect(head.headers.get('X-Outage-Cache')).toBe('isolate');
    expect(await head.text()).toBe('');
    expect(head.headers.get('Content-Type')).toContain('application/json');
    const other = await cache.get(req('/api/v1/public/cell/x/outages?days=7'), () => json({ a: 3 }, 30));
    expect(other.headers.get('X-Outage-Cache')).toBe('miss');
  });

  it('W4_cache_ttl: cached responses carry the cache headers for their class (30 s page, 1 h static)', async () => {
    const cache = new PageCache();
    expect((await cache.get(req('/p'), () => page('p', 30))).headers.get('Cache-Control')).toBe('public, max-age=30, s-maxage=30');
    expect((await cache.get(req('/s'), () => page('s', 3600))).headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
    expect((await cache.get(req('/n'), () => page('n', 0))).headers.get('Cache-Control')).toBe('no-store');
  });

  it('W4_cache_ttl: noindex survives a Cache API round trip', async () => {
    const fake = new FakeCache();
    await new PageCache({ cache: fake }).get(req('/c/x'), () => ({ ...page('c'), noindex: true }));
    const hit = await new PageCache({ cache: fake }).get(req('/c/x'), () => page('other'));
    expect(hit.headers.get('X-Robots-Tag')).toBe('noindex');
  });
});
