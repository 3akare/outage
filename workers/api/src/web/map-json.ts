// GET /api/map.json builder (app-map-insights task 1, ADR 0022). Pure: the clock is an input.
// Boundaries: https://uber.github.io/h3-js/#celltoboundary (returns [lat, lng] pairs).
// Every view in the public index already means 3 or more phones (`phones: '3+'`, ADR 0007), so a cell with no view is
// NO_DATA with no times and no history, and the output never carries a count.
import type { MapCellJson, MapJson } from '@outage/shared';
import { cellToBoundary } from 'h3-js';
import type { CatalogArea } from './catalog/schema.ts';
import type { PublicScopeView } from './public-view.ts';
import { historyForCells, statusForCells } from './status.ts';

export const DEFAULT_CITY = 'lagos';
const CITY = /^[a-z0-9-]{1,32}$/;

/** A city slug from the query, or the default. The catalog holds one city today, so the value is echoed, not filtered. */
export const cityFrom = (raw: string | null): string => (raw !== null && CITY.test(raw) ? raw : DEFAULT_CITY);

export function buildMapJson(
  city: string,
  areas: readonly CatalogArea[],
  views: readonly PublicScopeView[],
  nowMs: number,
): MapJson {
  const owner = new Map<string, string>();
  for (const a of areas) for (const c of a.cells) if (!owner.has(c)) owner.set(c, a.slug);
  const cells: MapCellJson[] = [];
  for (const [id, area] of owner) {
    const status = statusForCells([id], views, nowMs);
    const ring = cellToBoundary(id) as [number, number][];
    if (status.kind === 'NO_COVERAGE') {
      cells.push({ id, area, state: 'NO_DATA', sinceMs: null, restoredMs: null, history30d: [], ring });
      continue;
    }
    const history = historyForCells([id], views, nowMs).map((o) => ({
      startMs: o.startMs,
      endMs: o.endMs,
      level: o.level,
    }));
    cells.push({
      id,
      area,
      state: status.kind,
      sinceMs: status.kind === 'RESTORED' ? null : (status.sinceMs ?? null),
      restoredMs: status.kind === 'RESTORED' ? (status.sinceMs ?? null) : null,
      history30d: history,
      ring,
    });
  }
  return {
    city,
    generatedMs: nowMs,
    simulated: false,
    areas: areas.map((a) => ({ slug: a.slug, name: a.name, centreCell: a.centreCell, cells: [...a.cells] })),
    cells,
  };
}
