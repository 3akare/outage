# ADR 0049: The website is a landing page and the app in the browser

Status: ACCEPTED (2026-11-24). Asked for by the human: the web has a landing page with links to Aptoide, Google Play and a direct GitHub download, and "a simulation that mirrors the Android app one-on-one" for judges who cannot install it. Spec: `.kiro/specs/material-redesign/`. Supersedes ADR 0027 decision 2 (the real-data replica at `/app`) and the single-hexagon player of ADR 0029; keeps ADR 0029's replay data and service worker.

## Context
ADR 0027 split the web into a landing page, a real-data replica at `/app` and a separate simulation at `/app/simulate`. With few phones reporting, the replica is mostly grey, and the simulation showed one hexagon with dots, which does not look like the app. A judge without an Android phone met two half-apps and neither was the real thing.

## Decision
1. **`/app/simulate` is the Android app in the browser**, screen for screen: first run with the location question and a simulated system permission dialog, Home as a full-screen hex map with a search-style top bar, legend chips, zoom and "my spot" buttons and a draggable sheet (spot card, feed), the cell sheet with Follow, Insights (Light Score, tiles, hours per day against the band's promise, supply promise check), Settings (the same groups and items as the phone), the heads-up notification at a confirmed cut and the full-screen Light Alarm at restore. Navigation bar: Insights, Home, Settings (ADR 0050).
2. **One simulated city**, `web/ui/simulate/demo-map.ts`: the same 21 blocks, four areas and starting states as the phone's sample map (`DemoAreaMap.kt`), except Yaba, which starts with power on. Cell ids start with `sim-`.
3. **The blackout is the existing replay** (`core/shared/fixtures/replay.json`, built by `tools/sim` from the real engine) played on the spot and its neighbours, with the engine's numbers under "How sure is Outage?". The page reads only `/api/v1/public/judge/replay` and never the public index (W6, MD5). A banner says "Simulation · simulated data, not live" on every screen, and the app's own top bar carries a Simulated chip.
4. **On a wide screen** the app sits in a phone frame with a short guide beside it; on a phone it fills the screen.
5. **`/app`, `/app/insights` and `/app/settings` redirect (301) to `/app/simulate`.** Real public data stays on the area pages and in `/api/map.json`, which the phone reads.
6. **Landing page** (`web/landing/landing.ts`): the pitch, "Try the app in your browser", and download buttons. Google Play and Aptoide appear only when `PLAY_URL` and `APTOIDE_URL` are set (Worker vars, unset until the listings exist); GitHub always appears and links the APK (`APK_URL`) or the releases page. The hero picture is the app's own Home screen, drawn by the same code as the simulation. No script.
7. **Size and safety:** pages carry no inline style attribute (the CSP never allows one), load nothing from another origin (links out are fine), and the app with its script and stylesheet stays under 150 KB (MD7).

## Alternatives
1. **Keep the real-data replica and add a second, richer simulation.** Rejected: two web apps to keep in step with the phone, and the replica is empty until phones report.
2. **Run the Android app in the browser (an emulator in a page).** Rejected: no free service, heavy, and it would need real data.
3. **Official store badge images.** Rejected: images from other origins and trademark artwork; plain buttons with a generic glyph and the store name instead.

## Consequences
- A judge on an iPhone sees the whole product in one place, with the real engine's numbers.
- The phone and the web copy must change together; the Kiro steering `judge-demo.md` lists what to compare.
- People who bookmarked `/app` land on the simulation, which is clearly labelled.
