# ADR 0055: Remove Home Watch

Status: ACCEPTED (2026-11-21). Ordered by the human: remove the Home Watch feature completely. Supersedes ADR 0009 (pairing and stored links), ADR 0044 (station state in the pairing shard) and ADR 0045 (app screens and the station pair list). Amends the `station-mode` spec (the spare-phone role goes; the sensor work merged by ADR 0032 stays).

## Context
Home Watch let a spare phone charging at home act as a "station", paired by a short code to a viewer phone that showed "Home: power on since ..." and was to get home push alerts. It brought a Durable Object class (`PairingActor`), new stored data (offers, pairs, station state), four Worker routes, a forwarding list in every area actor, a battery heartbeat on the phone, three app screens, an onboarding step and a Home card. The human decided the product is better without it.

## Decision
1. **Gone everywhere.** The app screens, Settings items (Home Watch, Station mode), the Home card, the `STATION_OFFER` onboarding step, the Kotlin `home` package, the Worker `api/home` and `api/pairing` folders, the shared `home.ts` and `pairing.ts`, their fixtures, tests, simulator scenario and the `home-watch` spec. The landing page's Home Watch tile becomes Power Log.
2. **Stored data is deleted, not orphaned.** `wrangler.jsonc` keeps migration `v5` (tags are append-only) and adds `v6` with `deleted_classes: ["PairingActor"]`, which deletes every pairing shard and its SQLite data. Each area actor runs `DROP TABLE IF EXISTS home_watch` when it starts. The app deletes its `home_watch` and `home_watch_pending_delete` preference files at start.
3. **The sensor stays.** `SensorService` is the main sensor on every phone (ADR 0032): its service, heartbeat, manifest entry and permissions are unchanged. Only the battery heartbeat goes: a phone that is not armed now sends nothing on a heartbeat tick.
4. **Old APKs keep working.** Installed builds from before this change may still send two things, and the Worker accepts both and ignores them:
   - `DISARMED` with reason `HEARTBEAT_ON_BATTERY`: accepted as proof of life only (no armed change, no engine input), so old phones neither retry it nor log state changes. A minimal `HEARTBEAT_ON_BATTERY` constant stays in `core/shared/src/ingest.ts` for this.
   - `POST /v1/delete` with an optional `pairIds` array: validated (at most 25 well-formed ids) and dropped, so their delete-my-data still succeeds.
   Their `/v1/pair/*` and `/v1/home/*` calls get `404`, which the old screens already show as "could not reach" or "not found".
5. **Lenient onboarding records.** `OnboardingCodec` reads step names leniently: an unknown step is dropped from skips and step times, and an unknown current step becomes `FINISH`, which `normalize` moves back if consent or the spot is missing. A phone that saved `STATION_OFFER` keeps its progress.
6. **Not touched.** The field telemetry `stationMode` / `mode.stationMs` wire fields (a separate contract), `android/probe` pairing analysis (unrelated: it pairs probe log rows), and the FCM `priority` option.

## Alternatives
1. **Hide the screens, keep the backend.** Rejected: stored pairs and push tokens with no user-facing control would break the privacy rule that people can see and delete what is kept.
2. **Reject the legacy heartbeat and `pairIds`.** Rejected: old phones would retry rejected events or fail delete-my-data.

## Consequences
- One less Durable Object class and four fewer routes. Deploying `v6` deletes all pairing data at once; there is no rollback for it.
- A spare phone still works as an ordinary Outage phone on the map; it just has no paired viewer.
- History stays readable: ADR 0009, 0044 and 0045 and older build-log entries still describe what was built.
