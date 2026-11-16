// The street map with the power layer on top (ADR 0053, ADR 0054). MapLibre GL JS (BSD-3-Clause), served from this origin, draws
// OpenFreeMap's "Liberty" street map (OpenStreetMap data, no key). Over it, every block of the simulated city is a
// see-through hexagon coloured by its power state, laid under the street and place names so they stay readable.
// Zoomed out, the map is a globe; zoomed in, a flat street map.
import { AttributionControl, Map as MapLibre } from '/vendor/maplibre-gl/maplibre-gl.mjs';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const LAGOS = [3.42, 6.52];

// The power colours of the hex layer come from the stylesheet's tokens (tokens.json "map", the same on the phone), so
// this file holds no colour of its own. MapLibre needs real colour strings, so they are read once from :root.
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const MAP_COLOURS = {
  NORMAL: token('--map-normal'),
  POSSIBLE: token('--map-possible'),
  CONFIRMED: token('--map-confirmed'),
  RESTORED: token('--map-restored'),
  NO_DATA: token('--map-nodata'),
};
const INK = token('--c-ink');
const PAPER = token('--c-paper');
const DOT = token('--c-focus');
const colourBy = ['match', ['get', 'state'], ...Object.entries(MAP_COLOURS).flat(), MAP_COLOURS.NO_DATA];

/** GeoJSON of the blocks: rings are [lat, lng] in the city file, GeoJSON wants [lng, lat] and a closed ring. */
export function cellsGeoJson(cells, states) {
  return {
    type: 'FeatureCollection',
    features: cells.map((c) => {
      const ring = c.ring.map(([la, ln]) => [ln, la]);
      ring.push(ring[0]);
      return {
        type: 'Feature',
        properties: { id: c.id, area: c.area, state: states[c.id] ?? c.state },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    }),
  };
}

const point = (lngLat) => ({
  type: 'FeatureCollection',
  features: lngLat ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat } }] : [],
});

/**
 * Builds the map in `container`. Returns a small handle: setStates, select, setSpot, flyTo, on('cell'), and the
 * MapLibre map itself. Options: center, zoom, interactive, globe (default true), attribution (default true).
 */
export function createMap(container, city, opts = {}) {
  const map = new MapLibre({
    container,
    style: STYLE_URL,
    center: opts.center ?? LAGOS,
    zoom: opts.zoom ?? 10.5,
    minZoom: 1,
    maxZoom: 18,
    interactive: opts.interactive !== false,
    attributionControl: false,
    cooperativeGestures: opts.cooperative === true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate?.disableRotation();
  if (opts.attribution !== false) map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

  let states = {};
  let selected = null;
  let spot = null;
  const listeners = { cell: [], ready: [] };
  let ready = false;

  map.on('style.load', () => {
    if (opts.globe !== false) map.setProjection({ type: 'globe' });
  });
  map.on('load', () => {
    // Under the first label layer, so street and place names draw on top of the colour.
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addSource('cells', { type: 'geojson', data: cellsGeoJson(city.cells, states), promoteId: 'id' });
    map.addLayer(
      {
        id: 'cells-fill',
        type: 'fill',
        source: 'cells',
        paint: {
          'fill-color': colourBy,
          'fill-opacity': ['case', ['==', ['get', 'state'], 'NO_DATA'], 0.12, ['boolean', ['feature-state', 'hover'], false], 0.5, 0.34],
        },
      },
      firstLabel,
    );
    map.addLayer(
      {
        id: 'cells-line',
        type: 'line',
        source: 'cells',
        paint: {
          'line-color': colourBy,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 13, 1, 16, 2],
          'line-opacity': 0.7,
        },
      },
      firstLabel,
    );
    map.addLayer({
      id: 'cells-selected',
      type: 'line',
      source: 'cells',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 3.5] },
    });
    map.addSource('spot', { type: 'geojson', data: point(spot) });
    map.addLayer({
      id: 'spot-halo',
      type: 'circle',
      source: 'spot',
      paint: { 'circle-radius': 22, 'circle-color': DOT, 'circle-opacity': 0.16 },
    });
    map.addLayer({
      id: 'spot-dot',
      type: 'circle',
      source: 'spot',
      paint: { 'circle-radius': 8, 'circle-color': DOT, 'circle-stroke-color': PAPER, 'circle-stroke-width': 3 },
    });

    let hover = null;
    map.on('mousemove', 'cells-fill', (e) => {
      const id = e.features?.[0]?.id;
      if (hover !== null && hover !== id) map.setFeatureState({ source: 'cells', id: hover }, { hover: false });
      if (id !== undefined) map.setFeatureState({ source: 'cells', id }, { hover: true });
      hover = id ?? null;
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'cells-fill', () => {
      if (hover !== null) map.setFeatureState({ source: 'cells', id: hover }, { hover: false });
      hover = null;
      map.getCanvas().style.cursor = '';
    });
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['cells-fill'] })[0];
      for (const fn of listeners.cell) fn(f ? f.properties.id : null);
    });
    ready = true;
    for (const fn of listeners.ready) fn();
  });

  const refresh = () => {
    if (ready) map.getSource('cells').setData(cellsGeoJson(city.cells, states));
  };

  return {
    map,
    /** Replace the state of some blocks: { id: state }. */
    setStates(next) {
      states = { ...states, ...next };
      refresh();
    },
    states: () => ({ ...Object.fromEntries(city.cells.map((c) => [c.id, c.state])), ...states }),
    select(id) {
      selected = id;
      if (ready) map.setFilter('cells-selected', ['==', ['get', 'id'], selected ?? '']);
    },
    setSpot(lngLat) {
      spot = lngLat;
      if (ready) map.getSource('spot').setData(point(spot));
    },
    flyTo(lngLat, zoom, ms = 2000, padding) {
      map.flyTo({ center: lngLat, zoom, duration: ms, essential: true, ...(padding ? { padding } : {}) });
    },
    on(event, fn) {
      listeners[event].push(fn);
      if (event === 'ready' && ready) fn();
    },
  };
}

/** The middle of a block as [lng, lat]. */
export function cellCentre(cell) {
  const n = cell.ring.length;
  return [cell.ring.reduce((s, p) => s + p[1], 0) / n, cell.ring.reduce((s, p) => s + p[0], 0) / n];
}
