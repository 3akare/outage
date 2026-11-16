---
inclusion: manual
---

# /judge-demo

Check the website the way a judge on an iPhone sees it (ADR 0027, spec `ux-redesign`). The old Judge mode is now the simulation at `/app/simulate`.
1. Open the Worker URL with no login, on a phone-sized viewport (390 x 844). The landing page at `/` says what the product is and has three buttons: Open the app, Watch a blackout, Install on Android.
2. Tap Open the app (`/app`). Home shows a map of areas coloured by state, a feed under it, and a dock with Home, Insights, Settings. Data is real. With no phones it says "No phones reporting here yet".
3. Visit Insights and Settings from the dock. Nothing is stored. Settings items say "In the Android app".
4. Tap Watch a blackout (`/app/simulate`). The banner "Simulated. Not real data." is always visible. Play the five steps: Normal, Your spot only, Possible, Confirmed, Restored. Each step has one plain sentence and the numbers behind the decision.
5. Area page `/area/<slug>`: live status, 30-day history, install link (404 until `checkedBy` is set).
6. Check simulated data never appears on `/app` or in real history.
7. `/judge` redirects to `/app/simulate`.
8. Report each broken screen with a screenshot or text capture.

## Visual check (ux-redesign task 8)

Repeat with `bash web/visual/run.sh` (ADR 0019).

Serve: `cd web && npx wrangler dev` (http://localhost:8787). With the Playwright power, take a screenshot and a snapshot of each URL at **390 x 844** (`browser_resize`) and at **1280 x 800**. Save to `docs/visual/`.

| URL | Check |
|---|---|
| `/` | Headline, three steps, hex picture, three buttons visible without scrolling at 1280 x 800; install button visible at 390 x 844. |
| `/app` | Map, feed and dock (rail at 1280 px). Empty state text when there is no data. |
| `/app/insights`, `/app/settings` | Same dock, active tab marked, content readable. |
| `/app/simulate` | Banner "Simulated. Not real data." at the top in every step; controls (play, pause, restart, 1x 2x 4x) fit the width; explanation shows the numbers. |
| `/app/simulate` offline refresh (ADR 0016) | Load once, confirm `navigator.serviceWorker.ready` resolves, go offline, reload: the page still shows with the banner. |
| `/area/yaba` | Status line, 30-day history, install link; no horizontal scroll. |
| `/c/88589c9861fffff` | Same shape as an area page with no data (W9). |
| `/install`, `/privacy` | Render; install shows link, version, size, checksum if a release is set. |

Pass: no horizontal scroll at 390 px, text at least 16 px, tap targets at least 44 px, no console errors (`browser_console_messages`), no request to another origin (`browser_network_requests`). Size: static HTML pages under 30 KB; app pages under 100 KB transferred (ADR 0027).
