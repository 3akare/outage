# ADR 0024: Followed area slug on the phone and a build-time Worker address

Status: ACCEPTED 2026-11-15, under the blanket approval.

## Context
The Area map sheet offers "Follow this area" (app-map-insights R3.3). The app also needs to know the Worker address to load `/api/map.json`, but the Worker may not be deployed yet.

## Decision
- Store the followed area as a catalog slug (for example `yaba`) in SharedPreferences `followed_area`. It holds no cell id, no coordinates and no device id. Delete-my-data clears it (registered in `DeleteRegistry`).
- Add `BuildConfig.API_BASE`, set with `-PoutageApiBase=https://...`. Empty means the labelled demo map. No secret is involved; the address is public.
- Update 2026-11-21 (Worker live): `apps/android/gradle.properties` now defaults `outageApiBase` to `https://outage-api.bakaredavid007.workers.dev`, so CI, release and local builds show live data. Demo stays reachable with `-PoutageApiBase=` (empty), which `AreaMapSources.choose` and `InsightsSources.choose` turn into the labelled demo sources. A fork passes its own address.

## Alternatives
1. Store the cell id. Rejected: it narrows the user to a few streets for no benefit.
2. Hard-code the workers.dev address in Kotlin. Rejected: it would break forks. A Gradle property default can be overridden, so the update above uses that.

## Consequences
- A stored-data change recorded per `privacy.md`. Nothing leaves the phone.
- Builds now point at the live Worker by default. If the server has no data the Area screen shows its empty state or the last cached map, not demo data; demo needs the empty override.
