# workers/api

Cloudflare Worker with Durable Objects. One Worker serves the `/v1/*` ingest API and the public site.

## Area actors (spec: area-cells)

- One `AREA` Durable Object per res-7 parent cell. `AreaActor` is a thin shell over `AreaModel` (`src/area/model.ts`), a pure reducer (`src/area/reducer.ts`) with a SQLite write-behind store (table `area_model`).
- Each request produces an outbox: neighbor notices, member removals, pushes and public-index batches. The actor drains it after every ingest, notice, removal, delete and alarm (`afterChange`).
- Delivery is best effort. A failed public-index batch goes back to the outbox (newest put or remove per scope wins). Neighbor notices and removals are not requeued: notices are idempotent and converge on the next notice (A6), and a missed removal is retried by the install's next move.
- The public view of a scope is published only with 3 or more phones (`"3+"`). The `PublicIndex` object whitelists every field and rejects anything else (A8).
- Delete-my-data removes the install from rows and model, then drains the outbox so the public index and neighbors see the change.
- Pushes are counted and dropped until the alerts-and-light-alarm spec provides a sender (R10.3).

Tests: `npm test -w workers/api`. Properties A1 to A12 are listed in `docs/traceability.md`.

## Field telemetry (spec: field-telemetry)

- `POST /v1/telemetry`: one `DeviceDay` aggregate per install and local day. Install token, strict schema (`parseDeviceDay`), at most 6 uploads per install per hour, last upload wins, duplicates answered `accepted`.
- `GET /v1/admin/field/:day` (`YYYY-MM-DD`): `Authorization: Bearer <FIELD_READ_TOKEN>`. Returns device-days with per-request aliases `D1`, `D2`, ... (sorted install IDs; the map is not stored), silent devices of the last 7 days, outage records that started on that UTC day, and misses. No install ID and no cell. `500 server_not_configured` when the secret is not set.
- `TelemetryActor` (`src/telemetry/`): one SQLite Durable Object named `telemetry`. Tables `device_day`, `outage_record`, `miss_record`. The area actors send their `OUTAGE_RECORD` and `MISS` outputs here after each change (requeued on failure). Rows older than 90 days are pruned by a daily alarm. Delete-my-data (`POST /v1/delete`) also removes the install's `device_day` rows.
- Secret: `wrangler secret put FIELD_READ_TOKEN` (run in `workers/api`). Never committed.
