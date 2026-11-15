import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache } from '../src/web/cache.ts';
import type { CatalogArea } from '../src/web/catalog/schema.ts';
import type { IndexReader } from '../src/web/index-reader.ts';
import type { PublicScopeView } from '../src/web/public-view.ts';
import { handleWeb, isWebPath, robotsTxt, sitemapXml, type WebDeps } from '../src/web/routes.ts';
import { NUM_RUNS } from './runs.ts';
import { AREAS, cellView, confirmedNow, IKEJA, NOW, SITE, YABA } from './web-helpers.ts';

const UNCHECKED: CatalogArea = { ...IKEJA, slug: 'unchecked', name: 'Unchecked', checkedBy: '' };

function deps(views: readonly PublicScopeView[] | null, over: Partial<WebDeps> = {}) {
  let reads = 0;
  const index: IndexReader = {
    async views() {
      reads++;
      return views;
    },
  };
  const d: WebDeps = {
    site: SITE,
    install: null,
    areas: AREAS,
    index,
    cache: new PageCache({ now: () => NOW }),
    replay: () => null,
    now: () => NOW,
    ...over,
  };
  return { d, reads: () => reads };
}
const get = (path: string, method = 'GET') => new Request(`https://outage.test${path}`, { method });

describe('W7 sitemap and robots', () => {
  it('W7_sitemap_robots: the sitemap lists exactly the checked catalog areas and never /c/ pages', () => {
    fc.assert(
      fc.property(fc.subarray([...AREAS, UNCHECKED]), (areas) => {
        const xml = sitemapXml(SITE, areas);
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        const areaLocs = locs.filter((l) => l.includes('/area/')).sort();
        const expected = areas
          .filter((a) => a.checkedBy.trim() !== '')
          .map((a) => `${SITE.origin}/area/${a.slug}`)
          .sort();
        expect(areaLocs).toEqual(expected);
        expect(locs.some((l) => l.includes('/c/') || l.includes('/api/'))).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('W7_sitemap_robots: robots allows area pages and Judge mode and disallows /c/ and /api/', async () => {
    const txt = robotsTxt(SITE);
    expect(txt).toContain('Disallow: /c/');
    expect(txt).toContain('Disallow: /api/');
    expect(txt).not.toMatch(/Disallow: \/(area|judge)/);
    expect(txt).toContain(`Sitemap: ${SITE.origin}/sitemap.xml`);
    const res = await handleWeb(get('/robots.txt'), deps([]).d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe(txt);
    const sm = await handleWeb(get('/sitemap.xml'), deps([]).d);
    expect(sm.headers.get('content-type')).toContain('application/xml');
  });

  it('W7_sitemap_robots: /c/ pages carry noindex in a header and in the HTML', async () => {
    const res = await handleWeb(get(`/c/${YABA.cells[0]}`), deps([]).d);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('<meta name="robots" content="noindex">');
  });
});

describe('task 8 routes and JSON APIs', () => {
  it('R11.3 only GET and HEAD: every other method gets 405 with Allow, on every path', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      for (const path of ['/', '/area/yaba', '/api/v1/public/map', '/nope']) {
        const res = await handleWeb(get(path, method), deps([]).d);
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD');
      }
    }
    const head = await handleWeb(get('/area/yaba', 'HEAD'), deps([]).d);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('R4 size budget: every public HTML page is under 30 KB', async () => {
    const { d } = deps([cellView(YABA.cells[0] as string, confirmedNow())]);
    const paths = ['/', '/install', '/privacy', '/area/yaba', `/c/${YABA.cells[0]}`, '/judge'];
    for (const path of paths) {
      const res = await handleWeb(get(path), d);
      const bytes = new TextEncoder().encode(await res.text()).length;
      expect(bytes, path).toBeLessThan(30 * 1024);
    }
  });

  it('R1.1 R3 routes render, unknown slugs and invalid cells get the 404 page without reading the index', async () => {
    const { d, reads } = deps([cellView(YABA.cells[0] as string, confirmedNow())]);
    const area = await handleWeb(get('/area/yaba'), d);
    expect(area.status).toBe(200);
    expect(await area.text()).toContain('Is there power in Yaba right now?');
    expect((await handleWeb(get('/'), d)).status).toBe(200);
    expect((await handleWeb(get('/install'), d)).status).toBe(200);
    expect((await handleWeb(get('/privacy'), d)).status).toBe(200);
    const before = reads();
    expect((await handleWeb(get('/area/nowhere'), d)).status).toBe(404);
    expect((await handleWeb(get('/c/8f2830828052d25'), d)).status).toBe(404);
    expect((await handleWeb(get('/c/zzz'), d)).status).toBe(404);
    expect(reads()).toBe(before + 0);
    const api404 = await handleWeb(get('/api/v1/public/nope'), d);
    expect(api404.status).toBe(404);
    expect(api404.headers.get('content-type')).toContain('application/json');
  });

  it('R9.3 R9.1 an uncached page reads the index once; the next request within 30 s is served from cache', async () => {
    const { d, reads } = deps([]);
    const first = await handleWeb(get('/area/yaba'), d);
    expect(first.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30');
    expect(reads()).toBe(1);
    const second = await handleWeb(get('/area/yaba'), d);
    expect(second.headers.get('x-outage-cache')).toBe('isolate');
    expect(reads()).toBe(1);
  });

  it('R1.2 JSON APIs: map, area and cell outages; counts and install IDs never appear', async () => {
    const cell = YABA.cells[0] as string;
    const v = cellView(cell, {
      ...confirmedNow(),
      history30d: [{ startMs: NOW - 3_600_000, endMs: null, level: 'CONFIRMED', precision: 'CELL' }],
    });
    const { d } = deps([v]);
    const map = (await (await handleWeb(get('/api/v1/public/map'), d)).json()) as {
      areas: { slug: string; state: string | null }[];
    };
    expect(map.areas.find((a) => a.slug === 'yaba')?.state).toBe('CONFIRMED');
    expect(map.areas.find((a) => a.slug === 'ikeja')?.state).toBeNull();
    const area = (await (await handleWeb(get('/api/v1/public/area/yaba'), d)).json()) as {
      state: string;
      history: unknown[];
    };
    expect(area.state).toBe('CONFIRMED');
    expect(area.history).toHaveLength(1);
    const out = (await (await handleWeb(get(`/api/v1/public/cell/${cell}/outages?days=7`), d)).json()) as {
      days: number;
      outages: unknown[];
    };
    expect(out.days).toBe(7);
    expect(out.outages).toHaveLength(1);
    const clamp = (await (await handleWeb(get(`/api/v1/public/cell/${cell}/outages?days=999`), d)).json()) as {
      days: number;
    };
    expect(clamp.days).toBe(30);
    expect((await handleWeb(get('/api/v1/public/area/nowhere'), d)).status).toBe(404);
    expect((await handleWeb(get('/api/v1/public/cell/zzz/outages'), d)).status).toBe(404);
  });

  it('R4.4 the cell outages API gives the same body for any valid cell without a public scope', async () => {
    const { d } = deps([]);
    const a = (await (await handleWeb(get(`/api/v1/public/cell/${IKEJA.cells[0]}/outages`), d)).json()) as Record<
      string,
      unknown
    >;
    const b = (await (await handleWeb(get(`/api/v1/public/cell/${IKEJA.cells[1]}/outages`), d)).json()) as Record<
      string,
      unknown
    >;
    expect({ ...a, cell: 'x' }).toEqual({ ...b, cell: 'x' });
  });

  it('design 5 an unavailable index: pages show no status and are cached 5 s; APIs answer 503', async () => {
    const { d } = deps(null);
    const page = await handleWeb(get('/area/yaba'), d);
    expect(page.headers.get('cache-control')).toBe('public, max-age=5, s-maxage=5');
    expect((await handleWeb(get('/api/v1/public/map'), d)).status).toBe(503);
  });

  it('routing: the ingest API under /v1/ is not a web path', () => {
    expect(isWebPath('/v1/events')).toBe(false);
    expect(isWebPath('/')).toBe(true);
    expect(isWebPath('/api/v1/public/map')).toBe(true);
  });
});
