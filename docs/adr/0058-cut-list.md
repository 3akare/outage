# ADR 0058: Cut list

Status: ACCEPTED (2026-11-21). Supersedes ADR 0020 (tariff band config) and ADR 0038 (Freezer Guard alarms). Amends ADR 0039 (power log wiring: no band, no Freezer Guard) and ADR 0057 (no band picker on History).

## Context
The owner asked to finish the app and cut what is not core. The core is: Sensor, Now, Map, Light Alarm, area alerts, Charger test, Judge mode and History. Several features sat beside the core, each with its own screens, settings, strings and tests. They add weight and need claims care (the promise check compares a phone's log with an official promise).

## Decision
These are cut, in the Android app and in the browser demo:
1. **Freezer Guard.** The `freezer` package, its screen, its alarm receiver, the Settings row, the `SCHEDULE_EXACT_ALARM` permission and its strings.
2. **Tariff band and promise check.** `BandConfig`, `bands.json`, the band picker on History, the promise line on the 30-day bars, the band row and promise marker on Now, `Stats.promise` and its text. History keeps hours, outages and the Light Score.
3. **The diagnostics settings screen.** The opt-in stays: the person still chooses it when they first run the app, the daily upload still needs that opt-in, and Delete my data still clears it. Only the extra screen to flip it later is gone.
4. **Area Insights in the browser demo.** The Insights tab, its charts file (`charts.js`), the heat map, ranking and weekly sums, the Insights tile on the website and the Insights link in the area sheet. The old address `/app/insights` still redirects.
5. **Browser demo Settings rows that only said "On the phone this opens...".** Your spot, Tariff band, Freezer Guard, Keep Outage running, Notifications, Share anonymous diagnostics, Language, About and privacy. The demo keeps Light Alarm, Replay a blackout and Delete my data.

## Alternatives
1. **Hide them behind a flag.** Rejected: dead code that still needs tests and review.
2. **Cut only the screens, keep the logic.** Rejected: nothing would call it.
3. **Keep the band and promise check.** Rejected: it needs NERC figures kept current, and the claims rules make it the riskiest copy in the app.

## Consequences
- Less code, fewer strings and one less special permission.
- A person who chose the diagnostics opt-in cannot switch it off from Settings. Delete my data clears it. If this matters, a switch can return later as one row.
- The demo city data still has a made-up `band` per area. Nothing shows it.
- Old links to Freezer Guard and Diagnostics open the "Coming soon" screen or Settings, never a crash.
