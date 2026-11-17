# ADR 0054: Outage Daylight, a status-first redesign of the website and the app

Status: ACCEPTED (2026-11-16). Asked for by the human: "Redesign the UI for both the web and mobile app. It's trash right now. I want modern... Completely nuke current UI and UX for both the web and the app and rebuild from the ground up." Asked once, the human chose: clean and light in the manner of Apple's apps; the home screen leads with the status of your spot and the map is one tap away; full freedom over the brand; every feature kept. Supersedes ADR 0053 decisions 3 (Google-Maps-style screens), 6 (the wordmark icon) and the system font of ADR 0048. Keeps ADR 0053 decisions 1, 2, 4 and 5 (MapLibre and OpenFreeMap, the hex layer, the map CSP, Insights from the simulated history). Spec: `docs/design/daylight.md`.

## Context
The human rejected four designs in a row (Material 3, the night globe, Hallmark Midnight, the Google Maps copy). The last one put the map first, so the one question people open the app with ("is the power on at my place?") sat in a sheet under a search box and chips that overlapped each other, with toasts on top.

## Decision
1. **Status first.** Four tabs on both platforms: Now, Map, Insights, Settings, with Now as the start. Now is a large title (the area), a status hero (the state's pale tint, the mark tinted in the state's colour, the state in 56 to 64 px bold, how long), how sure (phones and a four-step track On, Maybe, Out, Back), then grouped rows. On a computer the web shows Now beside the live map.
2. **Look.** A grey page (#f5f5f7) with white grouped cards, near-black ink in three steps, primary actions as ink pills, link blue, and colour only for the four power states (a text-safe strong colour, a container tint, a vivid map fill). iOS-style grouped lists with coloured icon tiles in Settings.
3. **Type: Inter** (OFL 1.1) for every word, on an Apple-style scale (display, large title, title 1 to 3, headline, body, callout, subhead, footnote, caption) with tracking per step. The web serves it from its own origin (`web/public/fonts/inter.woff2`, latin, opsz and wght axes); the CSP adds `font-src 'self'`. Android bundles the variable font in `res/font/inter.ttf`.
4. **Icons: Lucide** (ISC), drawn as 1.75 px round strokes, one set in `core/shared/design/icons.json` for both platforms. `tools/icon/lucide.mjs` rebuilds the set from `lucide-static`; `tools/icon/build.mjs` writes the Android vectors.
5. **The mark:** a disc whose left half is solid and right half is a ring, power on and off in one shape. White on an ink (#111113) app icon; ink in the app; `currentColor` on the web. The Mona Sans wordmark (`wordmark.json`) is removed.
6. **Tokens** gain type tracking, link, tile colours and a wider space scale. `tools/tokens/build.mjs` writes `Tokens.Type` for Compose. Charts and the map read colours from tokens (CSS classes and custom properties), never literals.

## Alternatives
1. **Dark, glassy premium.** Offered; the human chose light.
2. **Map first with a status sheet.** Offered; the human chose status first.
3. **System fonts only.** Rejected: the Apple-like feel depends on one tight, modern face on every platform, and Roboto on Android does not give it.

## Consequences
- One extra same-origin request per page (the font, 47 KB, preloaded and cached by the service worker).
- `web/visual/check.mjs` walks the four tabs and opens an area's sheet. Hallmark's `sloplint` reports 0 FAIL on the landing, the app and an area page.
- Android screens are rebuilt in Compose on the same tokens; they are verified by build, unit tests and lint, not yet on a device.
