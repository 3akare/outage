// SVG map of the LGAs coloured by state (R5, ADR 0010, ADR 0056). One outline per LGA from lagos-geo.json, not one path per hex,
// so the page stays small. No tiles, no outside request.
import { cellToLatLng } from 'h3-js';
import type { PublicScopeView } from '../api/public-index/public-view.ts';
import { escapeHtml } from '../site/escape.ts';
import { areaStatus } from '../site/status.ts';
import type { PublicStateKey } from '../site/strings.ts';
import type { Outlines } from './catalog/build.ts';
import type { CatalogArea } from './catalog/schema.ts';
import { gridEdges } from './lga-grid.ts';

const WIDTH = 1000;
const PAD = 40;

export type MapArea = Pick<CatalogArea, 'slug' | 'name' | 'centreCell' | 'cells'>;
/** The state of each area by slug. Null means no public view covers it. */
export type AreaStates = ReadonlyMap<string, PublicStateKey | null>;

/** The state of each area from the scope views that cover its cells. */
export function areaStates(
  areas: readonly MapArea[],
  views: readonly PublicScopeView[],
  nowMs: number,
): Map<string, PublicStateKey | null> {
  const out = new Map<string, PublicStateKey | null>();
  for (const area of areas) {
    const s = areaStatus(area, views, nowMs);
    out.set(area.slug, s.kind === 'NO_COVERAGE' ? null : s.kind);
  }
  return out;
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * Renders the map as a picture only. An LGA with no public view is drawn grey. The outlines are not links (many LGAs are
 * smaller than the 44 px tap size) and the SVG is hidden from screen readers. The list of LGA links under it has the same
 * names and states (R5.4).
 */
export function renderMap(areas: readonly MapArea[], outlines: Outlines, states: AreaStates): string {
  const drawn = areas.filter((a) => (outlines[a.slug] ?? []).length > 0);
  if (drawn.length === 0) return '';

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const a of drawn) {
    for (const poly of outlines[a.slug] ?? []) {
      for (const [lat, lng] of poly) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
    }
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = (WIDTH - 2 * PAD) / spanX;
  const height = Math.round(spanY * scale + 2 * PAD);
  const px = (lng: number): number => PAD + (lng - minLng) * k * scale;
  const py = (lat: number): number => PAD + (maxLat - lat) * scale;

  let shapes = '';
  for (const area of drawn) {
    const st = states.get(area.slug) ?? null;
    const d = (outlines[area.slug] ?? [])
      .map((poly) => `${poly.map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${r1(px(lng))} ${r1(py(lat))}`).join('')}Z`)
      .join('');
    shapes += `<path d="${d}"${st ? ` data-state="${st}"` : ' class="none"'}></path>`;
  }

  // The hex grid: every shared edge once, as one path of short relative strokes.
  let grid = '';
  for (const [[ax, ay], [bx, by]] of gridEdges(drawn.flatMap((a) => a.cells))) {
    const x = px(ax);
    const y = py(ay);
    grid += `M${r1(x)} ${r1(y)}l${r1(px(bx) - x)} ${r1(py(by) - y)}`;
  }
  if (grid) shapes += `<path class="grid" d="${grid}"></path>`;

  let labels = '';
  for (const area of drawn) {
    const [lat, lng] = cellToLatLng(area.centreCell);
    labels += `<text x="${r1(px(lng))}" y="${r1(py(lat))}" text-anchor="middle" aria-hidden="true">${escapeHtml(area.name)}</text>`;
  }

  return (
    `<svg class="map" aria-hidden="true" focusable="false" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `${shapes}${labels}</svg>`
  );
}
