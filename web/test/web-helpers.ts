// Test doubles for the web tests. The public index (task 7) is not built, so PublicScopeView values are made here.
import { cellToParent } from 'h3-js';
import { CATALOG } from '../areas/catalog/index.ts';
import type { CatalogArea } from '../areas/catalog/schema.ts';
import type { Site } from '../site/layout.ts';
import type { PublicScopeView } from '../api/public-index/public-view.ts';

export const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
export const HOUR = 3_600_000;

export const SITE: Site = { origin: 'https://outage.test', apkUrl: 'https://github.com/example/outage/releases/download/v1/outage.apk' };

const lga = (slug: string): CatalogArea => {
  const area = CATALOG.areas.find((a) => a.slug === slug && a.kind === 'lga');
  if (!area) throw new Error(`no LGA ${slug}`);
  return area;
};

/** A test area with the given cells, for tests that need cells of their own. */
export const testArea = (slug: string, name: string, cells: string[]): CatalogArea => ({
  slug,
  name,
  kind: 'lga',
  lga: null,
  alt: [],
  centreCell: cells[0] as string,
  tzOffsetMin: 60,
  country: 'NG',
  source: 'https://example.test/source',
  checkedBy: 'test person 2026-11-20',
  cells,
});

export const MAINLAND = lga('lagos-mainland');
export const IKEJA = lga('ikeja');
export const AREAS: CatalogArea[] = [MAINLAND, IKEJA];

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
