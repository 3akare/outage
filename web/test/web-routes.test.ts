import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PageCache } from '../site/cache.ts';
import type { CatalogArea } from '../areas/catalog/schema.ts';
import type { IndexReader } from '../api/public-index/reader.ts';
import type { PublicScopeView } from '../api/public-index/public-view.ts';
import { handleWeb, isWebPath, robotsTxt, sitemapXml, type WebDeps } from '../routes.ts';
import { NUM_RUNS } from './runs.ts';
import { CATALOG } from '../areas/catalog/index.ts';
import { AREAS, cellView, confirmedNow, IKEJA, NOW, SITE, MAINLAND } from './web-helpers.ts';

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
    const res = await handleWeb(get(`/c/${MAINLAND.cells[0]}`), deps([]).d);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('<meta name="robots" content="noindex">');
  });
});

describe('task 8 routes and JSON APIs', () => {
  it('R11.3 only GET and HEAD: every other method gets 405 with Allow, on every path', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      for (const path of ['/', '/area/lagos-mainland', '/api/v1/public/map', '/nope']) {
        const res = await handleWeb(get(path, method), deps([]).d);
        expect(res.status).toBe(405);
        expect(res.headers.get('allow')).toBe('GET, HEAD');
      }
    }
    const head = await handleWeb(get('/area/lagos-mainland', 'HEAD'), deps([]).d);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('R4 size budget: every public HTML page is under 30 KB, app pages under 100 KB in total (ADR 0027)', async () => {
    const { d } = deps([cellView(MAINLAND.cells[0] as string, confirmedNow())]);
    const paths = ['/', '/areas', '/install', '/privacy', '/area/lagos-mainland', `/c/${MAINLAND.cells[0]}`, '/judge', '/app/simulate'];
    for (const path of paths) {
      const res = await handleWeb(get(path), d);
      const bytes = new TextEncoder().encode(await res.text()).length;
      expect(bytes, path).toBeLessThan(30 * 1024);
    }
  });

  it('R1.1 R3 routes render, unknown slugs and invalid cells get the 404 page without reading the index', async () => {
    const { d, reads } = deps([cellView(MAINLAND.cells[0] as string, confirmedNow())]);
    const area = await handleWeb(get('/area/lagos-mainland'), d);
    expect(area.status).toBe(200);
    expect(await area.text()).toContain('Is there power in Lagos Mainland right now?');
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
    const first = await handleWeb(get('/area/lagos-mainland'), d);
    expect(first.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30');
    expect(reads()).toBe(1);
    const second = await handleWeb(get('/area/lagos-mainland'), d);
    expect(second.headers.get('x-outage-cache')).toBe('isolate');
    expect(reads()).toBe(1);
  });

  it('R1.2 JSON APIs: map, area and cell outages; counts and install IDs never appear', async () => {
    const cell = MAINLAND.cells[0] as string;
    const v = cellView(cell, {
      ...confirmedNow(),
      history30d: [{ startMs: NOW - 3_600_000, endMs: null, level: 'CONFIRMED', precision: 'CELL' }],
    });
    const { d } = deps([v]);
    const map = (await (await handleWeb(get('/api/v1/public/map'), d)).json()) as {
      areas: { slug: string; state: string | null }[];
    };
    expect(map.areas.find((a) => a.slug === 'lagos-mainland')?.state).toBe('CONFIRMED');
    expect(map.areas.find((a) => a.slug === 'ikeja')?.state).toBeNull();
    const area = (await (await handleWeb(get('/api/v1/public/area/lagos-mainland'), d)).json()) as {
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
    const page = await handleWeb(get('/area/lagos-mainland'), d);
    expect(page.headers.get('cache-control')).toBe('public, max-age=5, s-maxage=5');
    expect((await handleWeb(get('/api/v1/public/map'), d)).status).toBe(503);
  });

  it('routing: the ingest API under /v1/ is not a web path', () => {
    expect(isWebPath('/v1/events')).toBe(false);
    expect(isWebPath('/')).toBe(true);
    expect(isWebPath('/api/v1/public/map')).toBe(true);
  });
});

describe('ADR 0056 LGA and ward pages, sitemap and search', () => {
  const full = () => deps([], { areas: CATALOG.areas }).d;

  it('the sitemap lists the 20 LGA pages and every ward page', () => {
    const xml = sitemapXml(SITE, CATALOG.areas);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] as string).filter((l) => l.includes('/area/'));
    expect(locs).toHaveLength(396);
    for (const lga of CATALOG.areas.filter((a) => a.kind === 'lga')) expect(locs).toContain(`${SITE.origin}/area/${lga.slug}`);
    expect(locs).toContain(`${SITE.origin}/area/ikeja-alade`);
  });

  it('an LGA page lists its wards and a ward page links back to its LGA', async () => {
    const lga = await (await handleWeb(get('/area/ikeja'), full())).text();
    expect(lga).toContain('Wards in Ikeja');
    expect(lga).toContain('<a href="/area/ikeja-alade">Alade</a>');
    const ward = await (await handleWeb(get('/area/ikeja-alade'), full())).text();
    expect(ward).toContain('Is there power in Alade, Ikeja right now?');
    expect(ward).toContain('<a href="/area/ikeja">Ikeja</a>');
  });

  it('/areas lists the 20 LGAs and finds an LGA or a ward by name', async () => {
    const home = await (await handleWeb(get('/areas'), full())).text();
    expect(home.match(/<li><a href="\/area\/[a-z-]+">[^<]+<\/a>: /g)).toHaveLength(20);
    const byLga = await (await handleWeb(get('/areas?q=surulere'), full())).text();
    expect(byLga).toContain('<h2>Search results</h2>');
    expect(byLga).toContain('<a href="/area/surulere">Surulere</a>');
    const byWard = await (await handleWeb(get('/areas?q=alade%20ikeja'), full())).text();
    expect(byWard).toContain('<a href="/area/ikeja-alade">Alade, Ikeja</a>');
    expect(await (await handleWeb(get('/areas?q=zzzqq'), full())).text()).toContain('No place with that name');
  });

  it('/api/v1/public/search returns names for an LGA and a ward, and nothing for an empty query', async () => {
    const find = async (q: string) => (await (await handleWeb(get(`/api/v1/public/search?q=${encodeURIComponent(q)}`), full())).json()) as { results: { slug: string; kind: string }[] };
    expect((await find('ikeja')).results[0]).toMatchObject({ slug: 'ikeja', kind: 'lga' });
    expect((await find('alade')).results.map((r) => r.slug)).toContain('ikeja-alade');
    expect((await find('')).results).toEqual([]);
  });

  it('/api/map.json defaults to the 20 LGAs, with one cell for each of the 4968 hexes', async () => {
    const res = await handleWeb(get('/api/map.json'), full());
    const body = (await res.json()) as { areas: unknown[]; cells: unknown[] };
    expect(body.areas).toHaveLength(20);
    expect(body.cells).toHaveLength(4968);
  });
});
