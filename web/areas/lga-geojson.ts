// The 20 LGA outlines as GeoJSON for the street maps (landing page, simulation). One feature per LGA, with its name, plus
// the box that holds every LGA so a map can open with all of Lagos in view.
import { CATALOG, LGA_OUTLINES } from './catalog/index.ts';
import type { Outlines } from './catalog/build.ts';
import { lgasOf } from './catalog/schema.ts';
import { json, type Rendered } from '../site/headers.ts';

export const LGA_GEOJSON_PATH = '/lga-outlines.json';

export interface LgaGeoJson {
  type: 'FeatureCollection';
  /** [west, south, east, north] over every outline point. */
  bbox: [number, number, number, number];
  features: {
    type: 'Feature';
    properties: { slug: string; name: string };
    geometry: { type: 'MultiPolygon'; coordinates: [number, number][][][] };
  }[];
}

export function buildLgaGeoJson(names: ReadonlyMap<string, string>, outlines: Outlines): LgaGeoJson {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const features: LgaGeoJson['features'] = [];
  for (const [slug, name] of names) {
    const polys = (outlines[slug] ?? []).filter((p) => p.length > 2);
    if (polys.length === 0) continue;
    const coordinates = polys.map((poly) => {
      const ring = poly.map(([lat, lng]): [number, number] => [lng, lat]);
      for (const [lng, lat] of ring) {
        w = Math.min(w, lng);
        e = Math.max(e, lng);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
      const first = ring[0] as [number, number];
      const last = ring[ring.length - 1] as [number, number];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
      return [ring];
    });
    features.push({ type: 'Feature', properties: { slug, name }, geometry: { type: 'MultiPolygon', coordinates } });
  }
  return { type: 'FeatureCollection', bbox: [w, s, e, n], features };
}

export const renderLgaGeoJson = (): Rendered =>
  json(buildLgaGeoJson(new Map(lgasOf(CATALOG.areas).map((a) => [a.slug, a.name])), LGA_OUTLINES), 3600);
