import { cellToBoundary, cellToLatLng } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { CATALOG, LGA_OUTLINES } from '../areas/catalog/index.ts';
import { lgasOf } from '../areas/catalog/schema.ts';
import { buildLgaGeoJson } from '../areas/lga-geojson.ts';
import { buildLgaGrid, type LgaGridGeoJson, lagosCells, renderLgaGrid } from '../areas/lga-grid.ts';
import { areaStates, renderMap } from '../areas/map-svg.ts';
import { renderHomePage } from '../areas/pages.ts';
import { NOW, SITE } from './web-helpers.ts';

const NAMES = [
  'Agege',
  'Ajeromi-Ifelodun',
  'Alimosho',
  'Amuwo-Odofin',
  'Apapa',
  'Badagry',
  'Epe',
  'Eti-Osa',
  'Ibeju-Lekki',
  'Ifako-Ijaiye',
  'Ikeja',
  'Ikorodu',
  'Kosofe',
  'Lagos Island',
  'Lagos Mainland',
  'Mushin',
  'Ojo',
  'Oshodi-Isolo',
  'Shomolu',
  'Surulere',
];
const LGAS = lgasOf(CATALOG.areas);

describe('all 20 local governments are on every map', () => {
  it('the catalog holds exactly the 20 LGAs', () => {
    expect(LGAS.map((a) => a.name).sort()).toEqual([...NAMES].sort());
  });

  it('the /areas SVG draws a path and a label for each of the 20, and its view box holds every outline point', () => {
    const svg = renderMap(LGAS, LGA_OUTLINES, areaStates(LGAS, [], NOW));
    expect(svg.split(/<path (?!class="grid")/).length - 1).toBe(20);
    for (const n of NAMES) expect(svg).toContain(`>${n}</text>`);
    const [w, h] = (/viewBox="0 0 (\d+) (\d+)"/.exec(svg) as RegExpExecArray).slice(1).map(Number) as [number, number];
    for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
      for (const [, x, y] of (m[1] as string).matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
        expect(Number(x)).toBeGreaterThanOrEqual(0);
        expect(Number(x)).toBeLessThanOrEqual(w);
        expect(Number(y)).toBeGreaterThanOrEqual(0);
        expect(Number(y)).toBeLessThanOrEqual(h);
      }
    }
  });

  it('the /areas page shows the map and a link for each of the 20', () => {
    const page = renderHomePage({ site: SITE, areas: CATALOG.areas, views: [], nowMs: NOW }).body;
    for (const n of NAMES) expect(page).toContain(`>${n}</text>`);
    for (const a of LGAS) expect(page).toContain(`href="/area/${a.slug}"`);
  });

  it('the street-map outlines hold 20 named features and the box covers every point, Epe and Badagry included', () => {
    const geo = buildLgaGeoJson(new Map(LGAS.map((a) => [a.slug, a.name])), LGA_OUTLINES);
    expect(geo.features.map((f) => f.properties.name).sort()).toEqual([...NAMES].sort());
    const [w, s, e, n] = geo.bbox;
    for (const f of geo.features) {
      for (const poly of f.geometry.coordinates) {
        for (const [lng, lat] of poly[0] as [number, number][]) {
          expect(lng).toBeGreaterThanOrEqual(w);
          expect(lng).toBeLessThanOrEqual(e);
          expect(lat).toBeGreaterThanOrEqual(s);
          expect(lat).toBeLessThanOrEqual(n);
        }
      }
    }
    expect(w).toBeLessThan(2.8); // Badagry
    expect(e).toBeGreaterThan(4.3); // Epe and Ibeju-Lekki
  });

  it('the view box covers the centre of every cell of every LGA', () => {
    const geo = buildLgaGeoJson(new Map(LGAS.map((a) => [a.slug, a.name])), LGA_OUTLINES);
    const [w, s, e, n] = geo.bbox;
    for (const a of LGAS) {
      for (const c of a.cells) {
        const [lat, lng] = cellToLatLng(c);
        expect(lng, `${a.name} ${c}`).toBeGreaterThanOrEqual(w - 0.01);
        expect(lng, `${a.name} ${c}`).toBeLessThanOrEqual(e + 0.01);
        expect(lat, `${a.name} ${c}`).toBeGreaterThanOrEqual(s - 0.01);
        expect(lat, `${a.name} ${c}`).toBeLessThanOrEqual(n + 0.01);
      }
    }
  });
});

describe('the hex grid of all of Lagos', () => {
  it('holds all 4,968 land hexes, with each shared edge drawn once', () => {
    const cells = lagosCells();
    expect(cells.length).toBe(4968);
    const grid = buildLgaGrid(cells);
    expect(grid.cells).toBe(4968);
    const lines = (grid.features[0] as LgaGridGeoJson['features'][number]).geometry.coordinates;
    const key = (a: number[], b: number[]) => [`${a}`, `${b}`].sort().join('|');
    const drawn = new Set(lines.map((l) => key(l[0] as number[], l[1] as number[])));
    expect(drawn.size).toBe(lines.length);
    expect(lines.length).toBeLessThan(6 * 4968);
    const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
    for (const c of cells) {
      const ring = cellToBoundary(c, true).map(([lng, lat]) => [r5(lng as number), r5(lat as number)]);
      for (let i = 0; i < ring.length; i++) {
        expect(drawn.has(key(ring[i] as number[], ring[(i + 1) % ring.length] as number[])), c).toBe(true);
      }
    }
  });

  it('is served at /lga-grid.json and the /areas SVG draws it as one extra path', () => {
    const body = JSON.parse(renderLgaGrid().body as string) as LgaGridGeoJson;
    expect(body.cells).toBe(4968);
    const svg = renderMap(LGAS, LGA_OUTLINES, areaStates(LGAS, [], NOW));
    expect(svg.split('<path class="grid"').length - 1).toBe(1);
  });
});
