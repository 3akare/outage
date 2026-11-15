# ADR 0025: INTERNET permission, `/api/map.json`, and a real Insights source

Status: ACCEPTED 2026-11-15, under the blanket approval. Responds to the review of `work/app-map-insights`.

## Context
The live Area map could not work: the manifest had no `INTERNET` permission (the socket call threw and `MapHttp` returned null), and the Worker had no `/api/map.json` route. Insights only had a demo source, so a build with the Worker address set still showed invented outages.

## Decision
- Add the normal permission `android.permission.INTERNET` (no prompt). The app makes one kind of request: `GET {API_BASE}/api/map.json?city=...` to the project's own Worker. No tiles, fonts or analytics.
- Add the Worker route `GET /api/map.json` (`workers/api/src/web/map-json.ts`). It reuses the public index, so every view already means 3 or more phones. A catalog cell with no view is `NO_DATA` with no times or history. The JSON has no count and no device id. Types are in `packages/shared/src/map.ts` and the fixture is `packages/shared/fixtures/map/map.json`, read by Vitest and by the Kotlin `MapContractTest`.
- Insights: with `-PoutageApiBase` set, `InsightsSources.choose` returns `PowerLogInsightsSource`, which is never simulated. Until the Power Log timeline exists it reads `PowerLogTimeline.None` and the screen shows its empty state. With a blank base the labelled demo stays.

## Alternatives
1. Re-serialise the parsed map before caching (review issue 5). Not done: the Worker test forbids `members`, `phones` and count keys in the output, and the cache is app-private (`allowBackup=false`). Revisit if the schema ever gains counts.
2. Make the parser reject cells with no `members`. Rejected: the Worker never sends counts by design, so every cell would be dropped. The floor is tested where it is applied, at the Worker.
3. Keep demo Insights when the base is set. Rejected: a real user could mistake invented outages for their own.

## Consequences
- A new capability (network) is declared in the manifest. Stored data is unchanged.
- The `city` query value is echoed after validation (`^[a-z0-9-]{1,32}$`). The catalog has one city today, so it is not a filter.
- The empty Insights state stays until the Power Log timeline lands (power-log tasks), then it replaces `PowerLogTimeline.None`.
