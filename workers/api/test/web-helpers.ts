// Test doubles for the web tests. The public index (task 7) is not built, so PublicScopeView values are made here.
import { cellToParent } from 'h3-js';
import { buildCatalog } from '../src/web/catalog/build.ts';
import type { CatalogArea } from '../src/web/catalog/schema.ts';
import type { Site } from '../src/web/site/layout.ts';
import type { PublicScopeView } from '../src/public-index/public-view.ts';

export const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
export const HOUR = 3_600_000;

export const SITE: Site = { origin: 'https://outage.test', apkUrl: 'https://github.com/example/outage/releases/download/v1/outage.apk' };

const sourceArea = (slug: string, name: string, lat: number, lng: number) => ({
  slug,
  name,
  lat,
  lng,
  rings: 2,
  tzOffsetMin: 60,
  country: 'NG',
  source: 'https://example.test/source',
  checkedBy: 'test person 2026-11-20',
});

export const AREAS: CatalogArea[] = buildCatalog({
  areas: [sourceArea('yaba', 'Yaba', 6.5068, 3.3755), sourceArea('ikeja', 'Ikeja', 6.6016, 3.3516)],
}).areas;
export const YABA = AREAS[0] as CatalogArea;
export const IKEJA = AREAS[1] as CatalogArea;

export function view(over: Partial<PublicScopeView> & Pick<PublicScopeView, 'boundary'>): PublicScopeView {
  return { scopeKind: 'CELL', precision: 'CELL', status: 'NORMAL', history30d: [], phones: '3+', ...over };
}

export const cellView = (cell: string, over: Partial<PublicScopeView> = {}): PublicScopeView => view({ boundary: [cell], ...over });
export const parentView = (cell: string, over: Partial<PublicScopeView> = {}): PublicScopeView =>
  view({ scopeKind: 'PARENT', precision: 'COARSE', boundary: [cellToParent(cell, 7)], ...over });

export const confirmedNow = (since = NOW - HOUR): Partial<PublicScopeView> => ({
  status: 'CONFIRMED',
  openOutage: { startMs: since, level: 'CONFIRMED', precision: 'CELL' },
});

export function bodyOf(r: { body: string }): string {
  return r.body.split('__OUTAGE_NONCE__').join('NONCE');
}
