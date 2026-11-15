# ADR 0027: Web = landing, app replica, simulation (vanilla JS, same Worker)

Status: ACCEPTED (2026-11-22), under the blanket approval. Spec: `.kiro/specs/ux-redesign/`. Revises the 30 KB page limit of `web-and-area-pages` R4 and replaces Judge mode (ADR 0015, 0016).

## Context
The website is for judges who have no Android phone. It showed text pages and a "Judge mode" nobody understood, with no landing page and no map on the front. Judges need to see what the product is, see the real app experience with real data, and watch a blackout happen without waiting for one.

## Decision
1. **Three parts on the existing Worker, no second site:**
   - `/` landing page: headline, three steps, a small hex picture, three buttons (Open the app, Watch a blackout, Install on Android).
   - `/app`, `/app/insights`, `/app/settings`: a replica of the app with the same dock, map and look. It reads `/api/map.json` and public status. Real data only. Empty state: "No phones reporting here yet".
   - `/app/simulate`: the simulation, visibly separate (fixed banner "Simulated. Not real data."). It plays the recorded replay (ADR 0015) with a plain sentence for each step.
2. **`/judge` redirects (301) to `/app/simulate`.** The word "Judge mode" is dropped from the UI. `judge-sw.js` stays for offline reload of the simulation (ADR 0016), with its cache path changed to `/app/simulate`.
3. **Vanilla JavaScript, no framework, no build step** beyond the Worker bundle. The map is SVG drawn from the JSON in the browser (the server also renders it so scripts-off works). One small script file served from the Worker, nonce or `'self'` under the CSP.
4. **CSP stays strict:** `default-src 'none'`, `script-src 'self'` (a same-origin file, no inline), `style-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`, `worker-src 'self'`. No other origin, no tile, font or analytics service (ADR 0010, 0022).
5. **Size budget:** HTML under 30 KB stays for landing, area and install pages. App and simulation pages may use up to 100 KB over the wire in total (HTML, CSS, JS, replay), checked by test.
6. **No viewer tracking, no cookies, no storage** on the replica. Settings there are explanations, labelled "In the Android app".
7. **Simulated and real never share a page.** The replica never loads the replay; the simulation never loads `/api/map.json`.

## Alternatives
1. **A framework (React, Svelte, Preact).** Faster to build components. Rejected: a build step, a dependency to approve, and a larger payload for three screens.
2. **A separate static site on Cloudflare Pages.** Nicer authoring. Rejected: a second deploy and origin, against "same Worker" in `product.md`.
3. **Leaflet with OpenStreetMap tiles.** Real streets. Rejected: leaks viewers to a third party and breaks ADR 0010 and 0022.
4. **Keep Judge mode, rename it.** Least work. Rejected: the page was a text walkthrough, not a product view.
5. **One page with a simulation toggle.** Rejected: risks real and simulated data mixing.

## Consequences
- Judges land on something that explains itself, then reach the real replica or the simulation in one tap.
- Every page must pass the no-other-origin test (UX4).
- The R4 size test changes: 30 KB per page for static pages, 100 KB total transfer for app pages.
- `/judge` links in docs and steering are updated; the old route keeps working through the redirect.
