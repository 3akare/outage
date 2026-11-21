# web

Cloudflare Worker with Durable Objects. One Worker serves the `/v1/*` API that the phone calls and the whole website: landing page, web copy of the app, judge simulation and public area pages.

Deploy: see `docs/deploy.md` (token, account ID, GitHub secrets, the `deploy-worker` workflow). The workflow creates `INSTALL_TOKEN_SECRET` once and pushes `FIELD_READ_TOKEN` from a GitHub secret (ADR 0021).

## Source layout

One Worker, one deploy. `worker.ts` is the entry: it routes `/v1/*` to `api/ingest/`, everything else through `routes.ts` (the URL table), and exports the five Durable Object classes. Tests stay flat in `test/`, named after the folder they cover (`area-*.test.ts`, `web-*.test.ts`).

| Folder | What it holds |
|---|---|
| `api/` | Everything the phone and the pages call. No HTML in here |
| `api/ingest/` | Phone-to-server API: request handlers, install token, event time, rate limits, write budget, armed state, the detection port |
| `api/area/` | `AreaActor` Durable Object (`actor.ts`, `core.ts`, `store.ts`) and the pure area logic (reducer, scope, members, neighbors, links, hints, pushes, view, field) |
| `api/alerts/` | Follows, push planning and the Firebase sender |
| `api/registry/` | `RegistryActor`: revoked installs and daily usage counters; `revocation.ts` is the isolate cache |
| `api/telemetry/` | `TelemetryActor`: field-test device-days, outage and miss records |
| `api/public-index/` | `PublicIndex` Durable Object: the public scope views that the website reads (`public-view.ts` is the shape) |
| `api/map/` | `/api/map.json` (`map-json.ts`): real data for the web app and the phone map |
| `landing/` | `/` landing page |
| `ui/app/` | `/app.css`, the one stylesheet for every page (Outage Daylight, ADR 0054) (`design.ts`, tokens in `tokens.gen.ts`); `/app`, `/app/insights`, `/app/settings` redirect to `/app/simulate` (ADR 0049) |
| `ui/simulate/` | `/app/simulate`, the Android app in the browser on a simulated city (`simulate.ts`, `demo-map.ts`); `replay.ts` serves `/api/v1/public/judge/replay`, `/judge-sw.js` and the `/judge` redirect |
| `areas/` | `/areas`, `/area/<slug>`, `/c/<cell>`, `/install`, `/privacy`, the 404 page (`pages.ts`) and their SVG map (`map-svg.ts`) |
| `areas/catalog/` | The 20 Lagos LGAs and 376 wards (built from `core/shared/fixtures/places`) and its generator |
| `site/` | Shared page parts: headers and CSP nonce, cache, HTML escaping, layout, state strings, status derivation, icons (`icons.ts`), the mark and favicon (`brand.ts`, `logo.gen.ts`) |
| `config.ts`, `env.ts` | Limits and batch sizes; the Worker's bindings |

## Area actors (spec: area-cells)

- One `AREA` Durable Object per res-7 parent cell. `AreaActor` is a thin shell over `AreaModel` (`api/area/model.ts`), a pure reducer (`api/area/reducer.ts`) with a SQLite write-behind store (table `area_model`).
- Each request produces an outbox: neighbor notices, member removals, pushes and public-index batches. The actor drains it after every ingest, notice, removal, delete and alarm (`afterChange`).
- Delivery is best effort. A failed public-index batch goes back to the outbox (newest put or remove per scope wins). Neighbor notices and removals are not requeued: notices are idempotent and converge on the next notice (A6), and a missed removal is retried by the install's next move.
- The public view of a scope is published only with 3 or more phones (`"3+"`). The `PublicIndex` object whitelists every field and rejects anything else (A8).
- Delete-my-data removes the install from rows and model, then drains the outbox so the public index and neighbors see the change.
- Pushes are counted and dropped until the alerts-and-light-alarm spec provides a sender (R10.3).
- Cost: `npm run bench -w web` measures startup, ingest and alarm CPU on a local SQLite shim. Results and the 10 ms free-plan comparison are in the ADR 0006 addendum. Small parents (70 phones) fit; 210 or more phones per parent on a cold actor do not, so watch the dashboard CPU time after deploy.

Tests: `npm test -w web`. Properties A1 to A12 are listed in `docs/traceability.md`.

## Removed: Home Watch (ADR 0055)

Home Watch (a spare phone as a paired "station") was removed. Migration `v6` deletes the `PairingActor` class and its storage; area actors drop their `home_watch` table on start. For installed older APKs the Worker still accepts and ignores a `pairIds` list on `POST /v1/delete` and a `DISARMED` heartbeat with reason `HEARTBEAT_ON_BATTERY`. The `/v1/pair/*` and `/v1/home/*` routes answer `404`.

## Field telemetry (spec: field-telemetry)

- `POST /v1/telemetry`: one `DeviceDay` aggregate per install and local day. Install token, strict schema (`parseDeviceDay`), at most 6 uploads per install per hour, last upload wins, duplicates answered `accepted`.
- `GET /v1/admin/field/:day` (`YYYY-MM-DD`): `Authorization: Bearer <FIELD_READ_TOKEN>`. Returns device-days with per-request aliases `D1`, `D2`, ... (sorted install IDs; the map is not stored), silent devices of the last 7 days, outage records that started on that UTC day, and misses. No install ID and no cell. `500 server_not_configured` when the secret is not set.
- `TelemetryActor` (`api/telemetry/`): one SQLite Durable Object named `telemetry`. Tables `device_day`, `outage_record`, `miss_record`. The area actors send their `OUTAGE_RECORD` and `MISS` outputs here after each change (requeued on failure). Rows older than 90 days are pruned by a daily alarm. Delete-my-data (`POST /v1/delete`) also removes the install's `device_day` rows.
- Secret: set the GitHub secret `FIELD_READ_TOKEN` and the deploy workflow pushes it (`docs/deploy.md`), or run `wrangler secret put FIELD_READ_TOKEN` in `web`. Never committed.

## Ingest and the install token (spec: event-ingest)

`POST /v1/register` returns an install id and a signed token. `POST /v1/events` takes batches (strict schema in `core/shared`), is idempotent per install and seq, and bounds event time by the phone's elapsed clock. `POST /v1/delete` removes everything tied to an install.

One human step before the first deploy: set the token signing secret once.

```
npx wrangler secret put INSTALL_TOKEN_SECRET
```

The `deploy-worker` workflow also creates it once (ADR 0021). Free-tier usage from a local load run has not been recorded yet. It needs a person to run `web/bench` against `wrangler dev`.
