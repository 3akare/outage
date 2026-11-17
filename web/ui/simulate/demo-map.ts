// The simulated city the app shows in the browser (ADR 0049, ADR 0052): real areas at their real places, as real
// H3 resolution-8 blocks, with made-up power states. Built by tools/sim/scripts/build-demo-city.mjs from the catalog
// into core/shared/fixtures/demo-city.json; the phone's sample map is generated from the same build. Every cell id starts
// with "sim-", so nothing here can be mistaken for a real cell. Yaba starts with power on: the replay cuts it.
import city from '@outage/shared/fixtures/demo-city.json' with { type: 'json' };
import { cellToBoundary, gridDisk } from 'h3-js';

export type SimState = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED' | 'NO_DATA';
export type SimCell = { id: string; area: string; state: SimState; ring: [number, number][] };
export type SimArea = { slug: string; name: string; centre: string; lat: number; lng: number };

export const SPOT_ID: string = city.spot;
export const SPOT_NEIGHBOURS: readonly string[] = city.spotNeighbours;
export const AREAS: readonly SimArea[] = city.areas.map((a) => ({ slug: a.slug, name: a.name, centre: a.centre, lat: a.lat, lng: a.lng }));
export const CELLS: readonly SimCell[] = city.cells as SimCell[];

/** The middle of a block as [latitude, longitude]. */
export function centreOf(id: string): [number, number] {
  const c = CELLS.find((x) => x.id === id);
  if (!c) return [6.5068, 3.3755];
  return [c.ring.reduce((s, p) => s + p[0], 0) / c.ring.length, c.ring.reduce((s, p) => s + p[1], 0) / c.ring.length];
}

/** Empty blocks around the spot, drawn faintly at street level so the city reads as part of a larger place. */
export function backdropRings(radius = 4): [number, number][][] {
  const used = new Set(CELLS.map((c) => c.id.slice(4)));
  return gridDisk(SPOT_ID.slice(4), radius)
    .filter((h) => !used.has(h))
    .map((h) => cellToBoundary(h).map(([la, ln]) => [+la.toFixed(5), +ln.toFixed(5)] as [number, number]));
}
