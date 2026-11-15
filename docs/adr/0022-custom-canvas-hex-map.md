# ADR 0022: The app map is a custom Compose Canvas of H3 hexagons

Status: ACCEPTED (2026-11-15), under the blanket approval.

## Context
The Android app must be the full experience, so the Area screen needs a real map of outages, not text. The website is only for judges on iPhone and for search. Budget is zero. Privacy rules say a viewer's location must not leak, and ADR 0007 and ADR 0010 already chose a tile-free map for the web page.

A normal map library loads street tiles from a server. The tile server sees the viewer's IP address and the area they look at. That is a location leak to a third party.

## Decision
- Draw the map ourselves on a Jetpack Compose `Canvas`: one hexagon per H3 resolution 8 cell, coloured by state, with pan, pinch zoom, double-tap zoom, recentre, a legend and a tap sheet.
- No basemap, no tile server, no map library, no API key. No new Gradle dependency, so `.kiro/approved-dependencies.json` needs no change.
- Hex outlines come from the Worker's public map JSON (spec `app-map-insights`, design section 3), built from `cellToBoundary` as ADR 0010 does. The phone needs no H3 library to draw.
- Area names from the catalog label the map. Pattern and glyph show state, so colour is not the only signal.

## Alternatives
1. **MapLibre Native with OpenFreeMap or Protomaps tiles.** Best looking, free licences. Rejected: tile requests tell a third party where the user looks; the SDK adds several MB to the APK; offline use needs a tile pack download; and it adds a dependency and a service to approve.
2. **osmdroid with OpenStreetMap tiles.** Rejected: the OSM tile usage policy does not allow heavy app use from the public servers, it leaks the viewer to OSM, and the library is in maintenance mode.
3. **Google Maps SDK.** Rejected: needs an API key and billing account, sends location to Google, and fails the zero-cost rule.
4. **Pre-rendered image of the city.** Rejected: cannot zoom or recolour, and still needs a source for the image.
5. **Bundle a vector basemap file in the APK.** Possible later. Rejected for now: large file, licence and update work, and it adds nothing to the core question "does this area have power".

## Consequences
- The map has no streets. A user finds places through area names, the outline of their own spot, and the list view. This is the trade-off we accept for privacy, cost and APK size.
- Works offline from the last cached JSON.
- We own gesture and hit-test code, so the maths is pure Kotlin with property tests (AM2 to AM4).
- If a basemap is wanted later, a bundled static vector layer can sit under the hexes without changing the data flow. It needs a new ADR and approval.
- The new `/api/map.json` route returns the same public data as the web map, so the privacy floor (3 phones) is enforced once, in the Worker.
- Spec: `.kiro/specs/app-map-insights/`. Related: ADR 0007, ADR 0010, ADR 0023.
