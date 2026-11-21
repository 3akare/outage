// The catalog as the Worker sees it: the generated file, filtered to areas a person has checked (W7).
import generated from './catalog.generated.json' with { type: 'json' };
import outlines from './outlines.generated.json' with { type: 'json' };
import { type Catalog, type CatalogArea, listedAreas } from './schema.ts';
import type { Outlines } from './build.ts';

export const CATALOG = generated as Catalog;

/** LGA outlines for the SVG map. */
export const LGA_OUTLINES = outlines as unknown as Outlines;

/** Areas shown on the site: the 20 LGAs and 376 wards of Lagos. */
export const LISTED_AREAS: CatalogArea[] = listedAreas(CATALOG);

export function findArea(slug: string, areas: readonly CatalogArea[] = LISTED_AREAS): CatalogArea | undefined {
  return areas.find((a) => a.slug === slug);
}
