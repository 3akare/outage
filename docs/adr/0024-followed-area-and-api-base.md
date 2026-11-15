# ADR 0024: Followed area slug on the phone and a build-time Worker address

Status: ACCEPTED 2026-11-15, under the blanket approval.

## Context
The Area map sheet offers "Follow this area" (app-map-insights R3.3). The app also needs to know the Worker address to load `/api/map.json`, but the Worker may not be deployed yet.

## Decision
- Store the followed area as a catalog slug (for example `yaba`) in SharedPreferences `followed_area`. It holds no cell id, no coordinates and no device id. Delete-my-data clears it (registered in `DeleteRegistry`).
- Add `BuildConfig.API_BASE`, empty by default, set with `-PoutageApiBase=https://...`. Empty means the labelled demo map. No secret is involved; the address is public.

## Alternatives
1. Store the cell id. Rejected: it narrows the user to a few streets for no benefit.
2. Hard-code the workers.dev address. Rejected: it changes per account and would break forks.

## Consequences
- A stored-data change recorded per `privacy.md`. Nothing leaves the phone.
- Release builds must pass `-PoutageApiBase` once the Worker is live, or the app keeps showing the Simulated demo map.
