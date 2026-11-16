# ADR 0053: A Google-Maps-style app on MapLibre and OpenFreeMap, a wordmark, and Insights from a simulated history

Status: ACCEPTED (2026-11-16). Asked for by the human: "Nuke the entire website and app UI… I basically want Google Maps with translucent layered grids (hex) on top that show the light… useful graphs and insights… use a real map package." The human chose MapLibre with OpenFreeMap, a wordmark-only icon, all four Insights groups, and the landing plus the full app in the browser. Spec: `.kiro/specs/material-redesign/` (tasks 13 and 14). Supersedes ADR 0051 (the globe and the mark), ADR 0052 decisions 2 to 4 (Midnight, Mona Sans, the Hallmark landing) and ADR 0022 (no basemap). Keeps ADR 0052 decision 5 (the city at real Lagos places).

## Context
The human rejected three designs in a row (Material 3, the night globe, Hallmark Midnight) and asked for a map that works like Google Maps, with a real map package and charts that answer real questions about power.

## Decision
1. **A real map package.** Web: MapLibre GL JS 6.16.0 (BSD-3-Clause), copied from `node_modules` into `web/public/vendor/` by `web/scripts/vendor-maplibre.mjs` at build and served by Workers Static Assets from our own origin. Android: MapLibre Native `org.maplibre.gl:android-sdk:13.7.1`. Both draw OpenFreeMap's "Liberty" style (`https://tiles.openfreemap.org/styles/liberty`): OpenStreetMap data, no key, no limits, attribution shown. The web is a globe when zoomed out and a flat street map when zoomed in; Android is flat (MapLibre Native's globe is only in preview builds).
2. **The power layer** is the H3 resolution-8 blocks as a GeoJSON source: a see-through fill (about 40%) and a stronger outline in the state colour, laid under the first label layer so street and place names stay readable; a tap opens the area; the spot is a blue dot.
3. **Google-Maps-style screens.** A floating search box (with the wordmark) and filter chips over the map, round map buttons, a side panel on a computer and a bottom sheet on a phone, the bar Insights, Home, Settings. White surfaces, one blue (`#1b6ef3`), the four power colours, the system font (Roboto on Android). Hallmark's Midnight and Mona Sans are gone.
4. **The CSP** of map pages (the landing and `/app/simulate`) adds `connect-src https://tiles.openfreemap.org` and `img-src blob:`; MapLibre's worker is same-origin. Every other page keeps the same-origin rule. The privacy page says the tile server sees the browser's IP address, as any website does.
5. **Insights from a simulated history.** `build-demo-city.mjs` adds six weeks of outages per area (deterministic, evening peak, weekday heavier) and a made-up NERC tariff band per area (A 20 h, B 16 h, C 12 h, D 8 h a day). The history is laid on the calendar so its last day is yesterday with its weekday kept. Insights show: hours of power per day for 30 days against the band's promise; a weekday by hour heatmap of how often the power is off; the areas ranked by hours of power over 7 or 30 days with each promise marked; hours without power per week; the outage log with the longest outage and the median time until power returns. The sums are `web/public/js/data.js` and `AreaHistory.kt`, tested on both sides.
6. **Icon: the wordmark** "outage" in white on blue, from real Mona Sans 800 outlines stored once in `core/shared/design/wordmark.json` (OFL 1.1; the font file itself is no longer shipped), inside the adaptive icon's 66 dp safe circle.

## Alternatives
1. **Google Maps SDKs.** Rejected: the web needs a billing account and both need a key.
2. **Keep the hand-drawn globe.** Rejected by the human.
3. **Load MapLibre from a CDN.** Rejected: scripts stay same-origin; only map data comes from OpenFreeMap.

## Consequences
- Map pages depend on OpenFreeMap being up; the hexes and the panel still work without tiles, and the service worker keeps the app's own files offline.
- `web/public/vendor/` is not committed; `wrangler dev` and `deploy` run the copy.
- Android screens are unverified on a device (task 7).
