// Pure catalog build: the Lagos places file (ADR 0056) -> generated catalog. No I/O; the CLI is generate.mjs.
import type { Catalog, CatalogArea, PlacesSource } from './schema.ts';

const CHECKED_BY = 'GRID3 NGA Operational Wards v4.0, accepted in ADR 0056';

/** LGA outlines for the map: slug -> polygons -> [lat, lng] points. From lagos-geo.json. */
export type Outlines = Record<string, [number, number][][]>;

export function buildCatalog(places: PlacesSource): Catalog {
  const lgaName = new Map(places.lgas.map((l) => [l.slug, l.name]));
  const common = { tzOffsetMin: 60, country: 'NG', source: places.source.url, checkedBy: CHECKED_BY };
  const lgas: CatalogArea[] = places.lgas.map((l) => ({
    slug: l.slug,
    name: l.name,
    kind: 'lga',
    lga: null,
    alt: [],
    centreCell: l.centreCell,
    ...common,
    cells: [l.centreCell, ...l.cells.filter((c) => c !== l.centreCell)],
  }));
  const wards: CatalogArea[] = places.wards.map((w) => ({
    slug: w.slug,
    name: `${w.name}, ${lgaName.get(w.lga) ?? w.lga}`,
    kind: 'ward',
    lga: w.lga,
    alt: w.alt,
    centreCell: w.anchor,
    ...common,
    // A ward smaller than a hex has no hex of its own: its anchor hex stands for it.
    cells: w.cells.length ? [w.anchor, ...w.cells.filter((c) => c !== w.anchor)] : [w.anchor],
  }));
  return { areas: [...lgas, ...wards] };
}

/** LGA outlines only. Ward outlines and hex rings stay out of the Worker (ADR 0056, bundle size). */
export function buildOutlines(geo: { lgas: Record<string, number[][][]> }, places: PlacesSource): Outlines {
  const out: Outlines = {};
  for (const l of places.lgas) out[l.slug] = (geo.lgas[l.slug] ?? []) as [number, number][][];
  return out;
}
