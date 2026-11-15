---
inclusion: manual
---

# /judge-demo

Run Judge mode end to end and check every screen:
1. Open the Worker URL with no login, on a phone-sized viewport.
2. Judge mode appears from the first screen. Replay is labeled "Simulated replay".
3. Walk the five states: Normal, Your spot only, Possible, Confirmed, Restored.
4. Unplug test: simulated neighbors are labeled and drop within 2 s; Confirmed shows on the device.
5. Area page: live status, 30-day history, install link.
6. Check simulated data never appears in real history.
7. Report each broken screen with a screenshot or text capture.

## Visual check (web-and-area-pages task 11)

Repeat with `bash workers/api/visual/run.sh` (ADR 0019).

Serve: `cd workers/api && npx wrangler dev` (http://localhost:8787). With the Playwright power, resize to 390 x 844 (`browser_resize`), then for each URL take a screenshot and a snapshot:

| URL | Check |
|---|---|
| `/` | Install button visible. |
| `/judge` | Banner "Simulated replay" at the top; all five states in the steps; controls (play, pause, restart, 1x 2x 4x) work and fit the width; explanation panel shows the numbers; "Your spot only" step labeled simulated; "not live" line present. |
| `/judge` with scripts off | Same content readable (everything is server-rendered). |
| `/judge` offline refresh (ADR 0016) | Load once, confirm `navigator.serviceWorker.ready` resolves, go offline (`context.setOffline(true)` in `browser_run_code_unsafe`), reload: the last page still shows with the banner. Only `/judge` is cached. |
| `/area/yaba` | Status line, 30-day history, install link; no horizontal scroll (`document.documentElement.scrollWidth <= 390`). |
| `/c/88589c9861fffff` | Same shape as an area page with no data (W9: no-phones and fewer-than-3 look the same). |
| `/install`, `/privacy` | Render; install shows link, version, size, checksum if a release is set. |

Pass: no horizontal scroll at 390 px, text at least 16 px, tap targets at least 44 px, no console errors (`browser_console_messages`), no request to another origin (`browser_network_requests`). Size budget: every HTML page under 30 KB (test `R4 size budget` in `workers/api/test/web-routes.test.ts`).
