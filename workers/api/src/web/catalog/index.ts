// The catalog as the Worker sees it: generated file, filtered to areas a person has checked (W7).
import generated from './catalog.generated.json' with { type: 'json' };
import { type Catalog, type CatalogArea, listedAreas } from './schema.ts';

export const CATALOG = generated as Catalog;

/** Areas shown on the site. Empty until a person fills in `checkedBy` in catalog.source.json and regenerates. */
export const LISTED_AREAS: CatalogArea[] = listedAreas(CATALOG);

export function findArea(slug: string, areas: readonly CatalogArea[] = LISTED_AREAS): CatalogArea | undefined {
  return areas.find((a) => a.slug === slug);
}
