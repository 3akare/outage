// SVG map of catalog cells coloured by state (R5, ADR 0010). No tiles, no outside request.
// Boundaries come from h3-js cellToBoundary (returns [lat, lng] pairs): https://uber.github.io/h3-js/#celltoboundary
import { cellToBoundary, cellToLatLng } from 'h3-js';
import type { CatalogArea } from '../catalog/schema.ts';
import { escapeHtml } from '../site/escape.ts';
import type { PublicScopeView } from '../../public-index/public-view.ts';
import { statusForCells } from '../site/status.ts';
import type { PublicStateKey } from '../site/strings.ts';
import { stateText } from '../site/strings.ts';

const WIDTH = 1000;
const PAD = 40;

export type MapArea = Pick<CatalogArea, 'slug' | 'name' | 'centreCell' | 'cells'>;
export type CellStates = ReadonlyMap<string, PublicStateKey | null>;

/** The state of each catalog cell from the scope views that cover it. Only catalog cells are ever included (R5.2). */
export function cellStates(areas: readonly MapArea[], views: readonly PublicScopeView[], nowMs: number): Map<string, PublicStateKey | null> {
  const out = new Map<string, PublicStateKey | null>();
  for (const area of areas) {
    for (const cell of area.cells) {
      if (out.has(cell)) continue;
      const s = statusForCells([cell], views, nowMs);
      out.set(cell, s.kind === 'NO_COVERAGE' ? null : s.kind);
    }
  }
  return out;
}

const r1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * Renders the map. Each cell is a link to the first area that lists it. A cell with no public scope is drawn grey and says so.
 * The `<title>` of each cell carries the area name and the state label, so the map is readable by screen readers (R5.4).
 */
export function renderMap(areas: readonly MapArea[], states: CellStates): string {
  const owner = new Map<string, MapArea>();
  for (const a of areas) for (const c of a.cells) if (!owner.has(c)) owner.set(c, a);
  if (owner.size === 0) return '';

  const rings = new Map<string, [number, number][]>();
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const cell of owner.keys()) {
    const b = cellToBoundary(cell);
    rings.set(cell, b);
    for (const [lat, lng] of b) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const scale = (WIDTH - 2 * PAD) / spanX;
  const height = Math.round(spanY * scale + 2 * PAD);
  const px = (lng: number): number => PAD + (lng - minLng) * k * scale;
  const py = (lat: number): number => PAD + (maxLat - lat) * scale;

  let cellsSvg = '';
  for (const [cell, ring] of rings) {
    const area = owner.get(cell) as MapArea;
    const st = states.get(cell) ?? null;
    const d = `${ring.map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${r1(px(lng))} ${r1(py(lat))}`).join('')}Z`;
    const text = st ? `${area.name}: ${stateText(st).label}` : `${area.name}: no phones here yet`;
    cellsSvg += `<a href="/area/${escapeHtml(area.slug)}"><path d="${d}"${st ? ` data-state="${st}"` : ' class="none"'}><title>${escapeHtml(text)}</title></path></a>`;
  }

  let labels = '';
  for (const area of areas) {
    const [lat, lng] = cellToLatLng(area.centreCell);
    labels += `<text x="${r1(px(lng))}" y="${r1(py(lat) - 16)}" text-anchor="middle" aria-hidden="true">${escapeHtml(area.name)}</text>`;
  }

  return (
    `<svg class="map" role="group" aria-label="Map of areas with their power status. The list below has the same information." viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">` +
    `${cellsSvg}${labels}</svg>`
  );
}
