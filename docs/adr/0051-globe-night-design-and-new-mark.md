# ADR 0051: A real rotating globe, one dark design, and a new mark

Status: ACCEPTED (2026-11-24). Asked for by the human: "Use an actual globe that rotates", "I hate the UI", "remove the Material skill", "the logo is hideous". Spec: `.kiro/specs/material-redesign/` (tasks 8 to 11, properties GL1 to GL4). Supersedes ADR 0048 decisions 1, 2, 4, 6 (the Material 3 tonal scheme, light mode, the `material-3` skill) and 7 (the three-colour ring mark), and the flat hex map of ADR 0022 and ADR 0050 decision 2. Keeps the token pipeline, the icon pipeline and the patterns that keep colour from being the only signal.

## Context
The Material 3 redesign looked like a stock Material app: a flat green hex blob on a blank background. The human wanted a real globe, like Google Earth, that turns, and a stronger look overall. The `material-3` skill was removed at the human's request and must not be reinstalled.

## Decision
1. **The map is a globe.** An orthographic projection drawn on a canvas, the same maths on both platforms (`web/ui/globe/globe.ts`, `android/.../map/GlobeMath.kt` and `ui/Globe.kt`). It turns by itself when nobody touches it, follows a drag, zooms with a pinch or the wheel, and flies down to a place with a dip out and back in, like a maps app. Far away the city is a beacon in its worst state; close up the power blocks are drawn on the sphere with the existing state patterns (hatch for possible, glowing red for out, outline for back, dashed for no data), a faint grid of empty blocks around them, the area names and a "you are here" dot.
2. **Land is real geography with no tile server.** Natural Earth 1:50m land (public domain), sampled into about 8,100 dots on an equal-area grid every 1.2 degrees, packed as int16 pairs in `core/shared/geo/land-dots.json` (43 KB); the Lagos coast from Natural Earth 1:10m in `core/shared/geo/lagos-coast.json`. `tools/geo/build.mjs` regenerates the dots (it needs `world-atlas` and `topojson-client` installed outside the repository, `npm i --no-save`). The web inlines the data in `/globe.js`; the Android build copies it into assets. No request to another origin, no API key, no cost.
3. **One dark design.** `tokens.json` now holds one palette (`colors`, `map`) in deep blues with white for actions and colour only for the four power states and the mark. No light mode. CSS names are `--c-*`, `--map-*`, `--t-*`, `--r-*`, `--s-*`; Kotlin `Tokens.Colors` and `Tokens.Map`. Panels over the globe are translucent glass. The web pages use a space background.
4. **First run over the globe.** On both platforms the welcome text sits on the lower half while the Earth turns above it; "Use my location" flies down to the spot.
5. **The landing hero is the globe** (`canvas[data-globe=hero]`, the page's only script).
6. **The mark:** a white power ring, open at the top, whose stem is a yellow charging bolt, on deep navy. Flat, no gradient, one geometry in `tools/icon/build.mjs` for the adaptive icon, the in-app mark, the web header and the favicon.
7. **Tests:** GL1 to GL4 (`GlobeMathTest`): the point under the camera is the centre, the far side is hidden and north is up, flights start and end on their cameras and take the short way round, taps hit the right block, drag never tips over the pole, dots fade at street level, and the data is shared. Web tests check the globe script, the 21 simulated blocks and no request elsewhere.

## Alternatives
1. **MapLibre, Cesium or Google Maps 3D.** Rejected: dependencies or API keys, tile requests to other origins, and cost past free tiers.
2. **WebGL with textures.** Rejected: a texture image is large and a second renderer to keep in step on Android; the dot globe draws fast on a 2D canvas on both platforms.
3. **Country outlines instead of dots.** Rejected: clipping polygons at the horizon is fiddly in two languages; dots need no clipping.
4. **Keep light mode.** Rejected: the globe and the power colours read best on dark, and one palette halves the checking.

## Consequences
- The phone and the web draw the same Earth from the same files; a change to either renderer must be made in both.
- `/globe.js` is about 58 KB (mostly the dot grid), cached for a day; the app in the browser stays under 200 KB with everything.
- Compose screens are still not screenshot-tested in the cloud session (no emulator); the globe maths is unit-tested.
