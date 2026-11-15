// Public site routes (web-and-area-pages task 8, design section 3). GET and HEAD only (R11.3), no cookie, no login (R1).
// Each uncached page reads the public index at most once (R9.3). Responses go through PageCache (R9.1, R9.2).
// Pure routing with injected dependencies, so Vitest runs it without the Workers runtime.
import { isValidRes8Cell } from '@outage/shared';
import type { PageCache } from './cache.ts';
import { PAGE_TTL_SECONDS, STATIC_TTL_SECONDS } from './cache.ts';
import type { CatalogArea } from './catalog/schema.ts';
import { escapeXml } from './escape.ts';
import { json, methodNotAllowed, type Rendered } from './headers.ts';
import type { IndexReader } from './index-reader.ts';
import type { Site } from './layout.ts';
import {
  type InstallInfo,
  renderAreaPage,
  renderCellPage,
  renderHomePage,
  renderInstallPage,
  renderNotFound,
  renderPrivacyPage,
} from './pages.ts';
import { areaStatus, HISTORY_WINDOW_MS, historyForCells, statusForCells, statusJson } from './status.ts';

export interface WebDeps {
  site: Site;
  install: InstallInfo | null;
  areas: readonly CatalogArea[];
  index: IndexReader;
  cache: PageCache;
  now(): number;
}

const UNAVAILABLE_TTL_SECONDS = 5; // design section 5: an empty or unreachable index is cached for 5 s at most
const DAY_MS = 86_400_000;

const text = (body: string, contentType: string, ttlSeconds: number): Rendered => ({
  status: 200,
  contentType,
  body,
  ttlSeconds,
});

const apiNotFound = (): Rendered => json({ error: 'not_found' }, 0, { status: 404 });
const apiUnavailable = (): Rendered => json({ error: 'unavailable' }, UNAVAILABLE_TTL_SECONDS, { status: 503 });

/** robots.txt (R11.5): area pages and Judge mode allowed; cell pages and the API disallowed. */
export function robotsTxt(site: Site): string {
  return `User-agent: *\nAllow: /\nDisallow: /c/\nDisallow: /api/\nSitemap: ${site.origin}/sitemap.xml\n`;
}

/** sitemap.xml (R10.3, W7): the fixed pages and exactly the catalog areas a person has checked. Never `/c/` pages. */
export function sitemapXml(site: Site, areas: readonly CatalogArea[]): string {
  const paths = [
    '/',
    '/judge',
    '/install',
    '/privacy',
    ...areas.filter((a) => a.checkedBy.trim() !== '').map((a) => `/area/${a.slug}`),
  ];
  const urls = paths.map((p) => `<url><loc>${escapeXml(`${site.origin}${p}`)}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

type Route = { pattern: RegExp; render: (m: RegExpExecArray, url: URL, deps: WebDeps) => Promise<Rendered> | Rendered };

const ROUTES: Route[] = [
  {
    pattern: /^\/$/,
    render: async (_m, _u, d) =>
      renderHomePage({ site: d.site, areas: d.areas, views: await d.index.views(), nowMs: d.now() }),
  },
  {
    pattern: /^\/area\/([a-z0-9-]{1,64})$/,
    render: async (m, _u, d) => {
      const area = d.areas.find((a) => a.slug === m[1]);
      if (!area) return renderNotFound({ site: d.site, areas: d.areas });
      return renderAreaPage({ site: d.site, area, views: await d.index.views(), nowMs: d.now() });
    },
  },
  {
    pattern: /^\/c\/([0-9a-f]{15})$/,
    render: async (m, _u, d) => {
      // An invalid cell gets the 404 page with no hint, and no index read (design section 11).
      if (!isValidRes8Cell(m[1])) return renderNotFound({ site: d.site, areas: d.areas });
      return renderCellPage({ site: d.site, cell: m[1], views: await d.index.views(), nowMs: d.now(), areas: d.areas });
    },
  },
  { pattern: /^\/install$/, render: (_m, _u, d) => renderInstallPage({ site: d.site, install: d.install }) },
  { pattern: /^\/privacy$/, render: (_m, _u, d) => renderPrivacyPage({ site: d.site }) },
  {
    pattern: /^\/robots\.txt$/,
    render: (_m, _u, d) => text(robotsTxt(d.site), 'text/plain; charset=utf-8', STATIC_TTL_SECONDS),
  },
  {
    pattern: /^\/sitemap\.xml$/,
    render: (_m, _u, d) => text(sitemapXml(d.site, d.areas), 'application/xml; charset=utf-8', STATIC_TTL_SECONDS),
  },
  {
    pattern: /^\/api\/v1\/public\/map$/,
    render: async (_m, _u, d) => {
      const views = await d.index.views();
      if (views === null) return apiUnavailable();
      const now = d.now();
      const areas = d.areas.map((a) => ({ slug: a.slug, name: a.name, ...statusJson(areaStatus(a, views, now)) }));
      return json({ areas }, PAGE_TTL_SECONDS);
    },
  },
  {
    pattern: /^\/api\/v1\/public\/area\/([a-z0-9-]{1,64})$/,
    render: async (m, _u, d) => {
      const area = d.areas.find((a) => a.slug === m[1]);
      if (!area) return apiNotFound();
      const views = await d.index.views();
      if (views === null) return apiUnavailable();
      const now = d.now();
      const status = areaStatus(area, views, now);
      const history = status.kind === 'NO_COVERAGE' ? [] : historyForCells(area.cells, views, now);
      return json({ slug: area.slug, name: area.name, ...statusJson(status), history }, PAGE_TTL_SECONDS);
    },
  },
  {
    pattern: /^\/api\/v1\/public\/cell\/([0-9a-f]{15})\/outages$/,
    render: async (m, url, d) => {
      if (!isValidRes8Cell(m[1])) return apiNotFound();
      const raw = Number(url.searchParams.get('days') ?? '30');
      const days = Number.isInteger(raw) ? Math.min(30, Math.max(1, raw)) : 30;
      const views = await d.index.views();
      if (views === null) return apiUnavailable();
      const now = d.now();
      const status = statusForCells([m[1]], views, now);
      // R4.4: a cell with no public scope gives the same answer whether it has no phones or fewer than 3.
      const since = now - Math.min(days * DAY_MS, HISTORY_WINDOW_MS);
      const outages =
        status.kind === 'NO_COVERAGE'
          ? []
          : historyForCells([m[1]], views, now).filter((o) => (o.endMs ?? now) >= since);
      return json({ cell: m[1], days, ...statusJson(status), outages }, PAGE_TTL_SECONDS);
    },
  },
];

/** True for every path the public site owns. Everything else (the ingest API under /v1/) is routed elsewhere. */
export const isWebPath = (pathname: string): boolean => !pathname.startsWith('/v1/');

export async function handleWeb(req: Request, deps: WebDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(); // R11.3
  const url = new URL(req.url);
  for (const r of ROUTES) {
    const m = r.pattern.exec(url.pathname);
    if (m) return deps.cache.get(req, () => r.render(m, url, deps));
  }
  const api = url.pathname.startsWith('/api/');
  return deps.cache.get(req, () => (api ? apiNotFound() : renderNotFound({ site: deps.site, areas: deps.areas })));
}
