// The street map with the power layer on top (ADR 0053, ADR 0054). MapLibre GL JS (BSD-3-Clause), served from this
// origin, draws OpenFreeMap's "Liberty" street map (OpenStreetMap data, no key). Over it, every simulated block is a
// see-through hexagon coloured by power, laid under the street and place names so they stay readable. Zoomed out it is
// a globe; zoomed in, a flat street map.
import { AttributionControl, Map as MapLibre } from '/vendor/maplibre-gl/maplibre-gl.mjs';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// The power colours of the hex layer (tokens.json "map", the same on the phone).
export const MAP_COLOURS = {
  NORMAL: '#22a559',
  POSSIBLE: '#f5a524',
  CONFIRMED: '#e5484d',
  RESTORED: '#0ea5b7',
  NO_DATA: '#9aa0a6',
};
const colourBy = ['match', ['get', 'state'], ...Object.entries(MAP_COLOURS).flat(), MAP_COLOURS.NO_DATA];

/** GeoJSON of blocks: each is { id, ring: [lat, lng][] }; GeoJSON wants [lng, lat] and a closed ring. */
export function cellsGeoJson(cells, states) {
  return {
    type: 'FeatureCollection',
    features: cells.map((c) => {
      const ring = c.ring.map(([la, ln]) => [ln, la]);
      ring.push(ring[0]);
      return {
        type: 'Feature',
        properties: { id: c.id, state: states[c.id] ?? 'NO_DATA' },
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
 * Builds the map in `container`. Returns a handle: setCells, setStates, select, setSpot, flyTo, on('cell' | 'ready'),
 * placeNear (the nearest place name in the street map's own labels), and the MapLibre map itself.
 */
export function createMap(container, opts = {}) {
  const map = new MapLibre({
    container,
    style: STYLE_URL,
    center: opts.center ?? [12, 12],
    zoom: opts.zoom ?? 1.5,
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

  let cells = [];
  let states = {};
  let spot = null;
  let ready = false;
  const listeners = { cell: [], ready: [] };

  map.on('style.load', () => {
    if (opts.globe !== false) map.setProjection({ type: 'globe' });
  });
  map.on('load', () => {
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addSource('cells', { type: 'geojson', data: cellsGeoJson(cells, states), promoteId: 'id' });
    map.addLayer(
      {
        id: 'cells-fill',
        type: 'fill',
        source: 'cells',
        paint: {
          'fill-color': colourBy,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, ['==', ['get', 'state'], 'NO_DATA'], 0.08, ['==', ['get', 'state'], 'NORMAL'], 0.1, 0.4],
          'fill-opacity-transition': { duration: 400 },
          'fill-color-transition': { duration: 400 },
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
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 13, 0.9, 16, 1.6],
          'line-opacity': ['case', ['==', ['get', 'state'], 'NORMAL'], 0.35, ['==', ['get', 'state'], 'NO_DATA'], 0.25, 0.85],
        },
      },
      firstLabel,
    );
    map.addLayer({
      id: 'cells-selected',
      type: 'line',
      source: 'cells',
      filter: ['==', ['get', 'id'], ''],
      paint: { 'line-color': '#0b0d12', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 15, 3] },
    });
    map.addSource('spot', { type: 'geojson', data: point(spot) });
    map.addLayer({
      id: 'spot-halo',
      type: 'circle',
      source: 'spot',
      paint: { 'circle-radius': 22, 'circle-color': '#1b6ef3', 'circle-opacity': 0.14 },
    });
    map.addLayer({
      id: 'spot-dot',
      type: 'circle',
      source: 'spot',
      paint: { 'circle-radius': 7.5, 'circle-color': '#1b6ef3', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
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
      for (const fn of listeners.cell) fn(f ? f.properties.id : null, e.lngLat);
    });
    ready = true;
    for (const fn of listeners.ready) fn();
  });

  const refresh = () => {
    if (ready) map.getSource('cells').setData(cellsGeoJson(cells, states));
  };

  return {
    map,
    setCells(next, nextStates) {
      cells = next;
      states = { ...nextStates };
      refresh();
    },
    setStates(next) {
      states = { ...states, ...next };
      refresh();
    },
    states: () => ({ ...states }),
    select(id) {
      if (ready) map.setFilter('cells-selected', ['==', ['get', 'id'], id ?? '']);
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
    /** The nearest neighbourhood, suburb, town or city name in the loaded street map, or null. */
    placeNear(lngLat) {
      if (!ready) return null;
      const rank = { neighbourhood: 0, quarter: 0, suburb: 1, hamlet: 2, village: 2, town: 3, city: 4 };
      let best = null;
      for (const f of map.querySourceFeatures('openmaptiles', { sourceLayer: 'place' })) {
        const name = f.properties['name:latin'] || f.properties.name;
        const cls = f.properties.class;
        if (!name || !(cls in rank) || f.geometry.type !== 'Point') continue;
        const [x, y] = f.geometry.coordinates;
        const km = Math.hypot((x - lngLat[0]) * 111 * Math.cos((y * Math.PI) / 180), (y - lngLat[1]) * 111);
        if (km > 6) continue;
        const score = km + rank[cls] * 1.5;
        if (!best || score < best.score) best = { name, score };
      }
      return best?.name ?? null;
    },
  };
}
