---
inclusion: manual
---

# /judge-demo

Check the website the way a judge on an iPhone sees it (ADR 0049, spec `material-redesign`). The app in the browser at `/app/simulate` must match the Android app screen for screen.
1. Open the Worker URL with no login, on a phone-sized viewport (390 x 844). The landing page at `/` says what the product is, offers "Try the app in your browser", and shows download buttons: GitHub always, Google Play and Aptoide only when `PLAY_URL` and `APTOIDE_URL` are set.
2. Tap Try the app (`/app/simulate`). The banner "Simulation · simulated data, not live" is always visible. First run asks Use my location or Not now; Use my location shows the system dialog and lands on the map centred on Yaba.
3. Home: full-screen hex map, top bar with the mark and a Simulated chip, legend chips, zoom and my-spot buttons, a sheet with the spot card. Tap a hex: the cell sheet with Follow.
4. Press Simulate a blackout: on, then maybe (snackbar), then out (heads-up notification, red dotted cells, pulse), then the full-screen Light Alarm. "How sure is Outage?" shows the engine's numbers.
5. Insights and Settings from the bar (Insights, Home, Settings). Compare with the phone: same groups, same words.
6. `/app`, `/app/insights`, `/app/settings` and `/judge` redirect to `/app/simulate`. Area page `/area/<slug>`: live status, history, install link (404 until `checkedBy` is set).
7. Check light and dark mode (system setting) on both.
8. Report each broken screen with a screenshot or text capture.

## Visual check

Repeat with `bash web/visual/run.sh` (ADR 0019). Serve: `cd web && npx wrangler dev` (http://localhost:8787). Screenshot each URL at **390 x 844** and at **1280 x 800**, light and dark. Save to `docs/visual/`.

| URL | Check |
|---|---|
| `/` | Headline, Try the app button and the download buttons visible without scrolling at 1280 x 800; the hero shows the app's Home. |
| `/app/simulate` | Phone frame and guide at 1280 px; full screen at 390 px. Banner in every step; the whole blackout plays; Insights and Settings render. |
| `/app/simulate` offline refresh (ADR 0016) | Load once, go offline, reload: the page still shows with the banner. |
| `/area/yaba`, `/areas`, `/install`, `/privacy` | Shared header with the mark, Material colours, no horizontal scroll. |

Pass: no horizontal scroll at 390 px, tap targets at least 48 px, no console errors, no request to another origin. Size: static pages under 30 KB; the app in the browser under 150 KB with script and stylesheet.
