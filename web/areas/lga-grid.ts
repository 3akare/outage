// The hex grid of all of Lagos for the maps: every land hex (H3 resolution 8) as thin lines. Each edge shared by two hexes is
// drawn once. Built once per Worker instance and cached, because the 4,968 cells never change between deploys.
import { cellToBoundary } from 'h3-js';
import { json, type Rendered } from '../site/headers.ts';
import { CATALOG } from './catalog/index.ts';
import { lgasOf } from './catalog/schema.ts';

export const LGA_GRID_PATH = '/lga-grid.json';

/** One edge: [lng, lat] of both ends, rounded to 5 decimals (about 1 m). */
export type GridEdge = [[number, number], [number, number]];

export interface LgaGridGeoJson {
  type: 'FeatureCollection';
  /** How many hexes the grid covers. */
  cells: number;
  features: {
    type: 'Feature';
    properties: Record<string, never>;
    geometry: { type: 'MultiLineString'; coordinates: [number, number][][] };
  }[];
}

const r5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/** The distinct hex edges of [cells], in the order first met. */
export function gridEdges(cells: Iterable<string>): GridEdge[] {
  const seen = new Set<string>();
  const out: GridEdge[] = [];
  for (const cell of cells) {
    const ring = cellToBoundary(cell, true).map(([lng, lat]): [number, number] => [
      r5(lng as number),
      r5(lat as number),
    ]);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i] as [number, number];
      const b = ring[(i + 1) % ring.length] as [number, number];
      const ka = `${a[0]},${a[1]}`;
      const kb = `${b[0]},${b[1]}`;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b]);
    }
  }
  return out;
}

/** Every land cell of the 20 LGAs, each once. */
export function lagosCells(): string[] {
  return [...new Set(lgasOf(CATALOG.areas).flatMap((a) => a.cells))];
}

export function buildLgaGrid(cells: readonly string[]): LgaGridGeoJson {
  return {
    type: 'FeatureCollection',
    cells: cells.length,
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: gridEdges(cells) } },
    ],
  };
}

let cached: Rendered | undefined;
export const renderLgaGrid = (): Rendered => (cached ??= json(buildLgaGrid(lagosCells()), 86400));
