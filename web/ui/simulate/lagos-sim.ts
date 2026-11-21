// Every place the simulation can run on (ADR 0060): all 20 Lagos LGAs, all 376 wards and all 4,968 land hexes (H3 resolution 8).
// Built once from the catalog and cached, because the places never change between deploys. The page's script reads it at
// /lagos-sim.json. A hex is one array: [H3 index, latitude, longitude, then six corner offsets] with every number in
// 1e-5 degrees (about 1 m), the offsets counted from the middle. That keeps the file near 400 KB raw, and it compresses well.
import { cellToBoundary, cellToLatLng } from 'h3-js';
import { CATALOG } from '../../areas/catalog/index.ts';
import { lgasOf, wardsOf } from '../../areas/catalog/schema.ts';
import { json, type Rendered } from '../../site/headers.ts';

export const LAGOS_SIM_PATH = '/lagos-sim.json';

export type LagosSim = {
  /** [slug, name, indexes into `cells`] for each LGA. */
  lgas: [string, string, number[]][];
  /** [slug, name, index into `lgas`, indexes into `cells`] for each ward. */
  wards: [string, string, number, number[]][];
  /** [H3 index, lat, lng, then 6 pairs of (lat, lng) offsets], numbers in 1e-5 degrees. */
  cells: (string | number)[][];
};

const e5 = (n: number): number => Math.round(n * 1e5);

export function buildLagosSim(): LagosSim {
  const lgas = lgasOf(CATALOG.areas);
  const order: string[] = [...new Set(lgas.flatMap((l) => l.cells))];
  const at = new Map(order.map((id, i) => [id, i]));
  const idx = (cells: string[]): number[] => cells.map((c) => at.get(c) as number);
  const cells = order.map((id) => {
    const [la, ln] = cellToLatLng(id) as [number, number];
    const cla = e5(la);
    const cln = e5(ln);
    const offsets = cellToBoundary(id).flatMap(([bla, bln]) => [e5(bla as number) - cla, e5(bln as number) - cln]);
    return [id, cla, cln, ...offsets];
  });
  const wards: LagosSim['wards'] = [];
  lgas.forEach((l, li) => {
    for (const w of wardsOf(CATALOG.areas, l.slug)) wards.push([w.slug, w.name, li, idx(w.cells)]);
  });
  return { lgas: lgas.map((l) => [l.slug, l.name, idx(l.cells)]), wards, cells };
}

let cached: Rendered | undefined;
export const renderLagosSim = (): Rendered => (cached ??= json(buildLagosSim(), 86400));
