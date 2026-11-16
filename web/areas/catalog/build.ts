// Pure catalog build: source (named points) -> generated catalog (cells). No I/O; the CLI is generate.mjs.
// h3-js API (latLngToCell, gridDisk): https://uber.github.io/h3-js/#latlngtocell , https://uber.github.io/h3-js/#griddisk
import { gridDisk, latLngToCell } from 'h3-js';
import type { Catalog, CatalogSource } from './schema.ts';

const CELL_RESOLUTION = 8;

export function buildCatalog(source: CatalogSource): Catalog {
  return {
    areas: source.areas.map((a) => {
      const centreCell = latLngToCell(a.lat, a.lng, CELL_RESOLUTION);
      const others = gridDisk(centreCell, a.rings)
        .filter((c) => c !== centreCell)
        .sort();
      return {
        slug: a.slug,
        name: a.name,
        centreCell,
        rings: a.rings,
        tzOffsetMin: a.tzOffsetMin,
        country: a.country,
        source: a.source,
        checkedBy: a.checkedBy,
        cells: [centreCell, ...others],
      };
    }),
  };
}
