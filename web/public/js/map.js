// The street map with the power layer on top (ADR 0053, ADR 0054). MapLibre GL JS (BSD-3-Clause), served from this origin, draws
// OpenFreeMap's "Liberty" street map (OpenStreetMap data, no key). Over it, every block of the simulated city is a
// see-through hexagon coloured by its power state, laid under the street and place names so they stay readable.
// It opens on Lagos (LAGOS_BOUNDS); zoomed out as far as it goes it is a globe, zoomed in a flat street map.
import { AttributionControl, Map as MapLibre } from '/vendor/maplibre-gl/maplibre-gl.mjs';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const LAGOS = [3.42, 6.52];
/** The box that holds all 20 local governments, [[west, south], [east, north]]. Every map starts here, so the first frame is
 * Lagos and never the world, even if /lga-outlines.json is slow or fails. A test (web/test/lga-geojson.test.ts) checks it still holds the served outlines. */
export const LAGOS_BOUNDS = [[2.7, 6.36], [4.37, 6.71]];
/** Nobody needs to zoom out further than this: it still shows all of Lagos State and some of the coast. */
export const MIN_ZOOM = 7;

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
    // Lagos from the first frame. Only a caller that asks for a centre on purpose gets one.
    ...(opts.center ? { center: opts.center, zoom: opts.zoom ?? 10.5 } : { bounds: LAGOS_BOUNDS, fitBoundsOptions: { padding: opts.fitPadding ?? 24 } }),
    minZoom: MIN_ZOOM,
    maxZoom: 18,
    interactive: opts.interactive !== false,
    attributionControl: false,
    cooperativeGestures: opts.cooperative === true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  map.touchZoomRotate?.disableRotation();
  window.__outageMap = map; // read-only handle for the visual check (web/visual/check.mjs)
  if (opts.attribution !== false) map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

  let states = {};
  let selected = null;
  let spot = null;
  const listeners = { cell: [], ready: [] };
  let ready = false;
  // The 20 local governments: outlines and names on the street map, and the box that holds all of them.
  let lgaBox = null;
  const lgaData = fetch('/lga-outlines.json').then((r) => r.json()).catch(() => null);
  // Every land hex of Lagos as thin lines (one MultiLineString, shared edges once), under the LGA borders and names.
  const gridData = fetch('/lga-grid.json').then((r) => r.json()).catch(() => null);
  const showLagos = (ms, padding) => {
    const box = lgaBox ? [[lgaBox[0], lgaBox[1]], [lgaBox[2], lgaBox[3]]] : LAGOS_BOUNDS;
    const pad = typeof padding === 'number' ? padding : { top: 24, bottom: 24, left: 24, right: 24, ...(padding ?? {}) };
    map.fitBounds(box, { padding: pad, duration: ms, animate: ms > 0, essential: true });
  };

  map.on('style.load', () => {
    if (opts.globe !== false) map.setProjection({ type: 'globe' });
  });
  map.on('load', () => {
    // The box given to the constructor is fitted before the page has laid the container out on some phones, which left the
    // map zoomed far out. Fit again now that the size is known (no animation).
    if (!opts.center) showLagos(0, opts.fitPadding);
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
    gridData.then((grid) => {
      if (!grid || !map.getStyle() || map.getSource('lagos-grid')) return;
      map.addSource('lagos-grid', { type: 'geojson', data: grid });
      map.addLayer(
        {
          id: 'lagos-grid-line',
          type: 'line',
          source: 'lagos-grid',
          minzoom: 6,
          paint: { 'line-color': INK, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 11, 0.8, 14, 1.2], 'line-opacity': 0.4 },
        },
        map.getLayer('lga-line') ? 'lga-line' : 'cells-selected',
      );
    });
    lgaData.then((lgas) => {
      if (!lgas || !map.getStyle()) return;
      lgaBox = lgas.bbox;
      map.addSource('lgas', { type: 'geojson', data: lgas });
      map.addLayer(
        { id: 'lga-line', type: 'line', source: 'lgas', paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': 0.55, 'line-dasharray': [3, 2] } },
        'cells-selected',
      );
      map.addLayer({
        id: 'lga-label',
        type: 'symbol',
        source: 'lgas',
        maxzoom: 12,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-allow-overlap': false },
        paint: { 'text-color': INK, 'text-halo-color': PAPER, 'text-halo-width': 1.5 },
      });
      if (opts.fitLagos) showLagos(0, opts.fitPadding);
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
    /** Shows all 20 local governments at once. */
    showLagos,
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
