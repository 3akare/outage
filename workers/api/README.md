# workers/api

Cloudflare Worker with Durable Objects. One Worker serves the `/v1/*` ingest API and the public site.

Deploy: see `docs/deploy.md` (token, account ID, GitHub secrets, the `deploy-worker` workflow). The workflow creates `INSTALL_TOKEN_SECRET` once and pushes `FIELD_READ_TOKEN` from a GitHub secret (ADR 0021).

## Area actors (spec: area-cells)

- One `AREA` Durable Object per res-7 parent cell. `AreaActor` is a thin shell over `AreaModel` (`src/area/model.ts`), a pure reducer (`src/area/reducer.ts`) with a SQLite write-behind store (table `area_model`).
- Each request produces an outbox: neighbor notices, member removals, pushes and public-index batches. The actor drains it after every ingest, notice, removal, delete and alarm (`afterChange`).
- Delivery is best effort. A failed public-index batch goes back to the outbox (newest put or remove per scope wins). Neighbor notices and removals are not requeued: notices are idempotent and converge on the next notice (A6), and a missed removal is retried by the install's next move.
- The public view of a scope is published only with 3 or more phones (`"3+"`). The `PublicIndex` object whitelists every field and rejects anything else (A8).
- Delete-my-data removes the install from rows and model, then drains the outbox so the public index and neighbors see the change.
- Pushes are counted and dropped until the alerts-and-light-alarm spec provides a sender (R10.3).

Tests: `npm test -w workers/api`. Properties A1 to A12 are listed in `docs/traceability.md`.

## Home Watch pairing (spec: home-watch, ADR 0009)

One `PairingActor` (binding `PAIRING`, migration `v5`) per two-symbol shard. The shard comes from the station's install id, so offers, pairs and delete-my-data all find the same rows without a table.

| Route | Body | Answers |
|---|---|---|
| `POST /v1/pair/offer` | `{ installId }` (station) | `200 { code, expiresAtMs }`, `409 station_full`, `429` |
| `POST /v1/pair/claim` | `{ installId, code, fcmToken, quietStartMin, quietEndMin, tzOffsetMin, stationName? }` (viewer) | `200 { pairId }`, `404 not_found` for every failed claim, `409 station_full`, `429` |
| `POST /v1/pair/remove` | `{ installId, pairId }` (either side) | `200 { removed: true }`, `404 not_found` |
| `POST /v1/delete` | adds optional `pairIds` (viewer lists its pairs, at most 25) | also removes this install's offers and pairs |

The offer stores only an HMAC of the code (secret `INSTALL_TOKEN_SECRET`). Code layout: shard (2) + offer key tail (2) + secret part (6). Offers and claims use the ingest token bucket per install.
- Cost: `npm run bench -w workers/api` measures startup, ingest and alarm CPU on a local SQLite shim. Results and the 10 ms free-plan comparison are in the ADR 0006 addendum. Small parents (70 phones) fit; 210 or more phones per parent on a cold actor do not, so watch the dashboard CPU time after deploy.

## Field telemetry (spec: field-telemetry)

- `POST /v1/telemetry`: one `DeviceDay` aggregate per install and local day. Install token, strict schema (`parseDeviceDay`), at most 6 uploads per install per hour, last upload wins, duplicates answered `accepted`.
- `GET /v1/admin/field/:day` (`YYYY-MM-DD`): `Authorization: Bearer <FIELD_READ_TOKEN>`. Returns device-days with per-request aliases `D1`, `D2`, ... (sorted install IDs; the map is not stored), silent devices of the last 7 days, outage records that started on that UTC day, and misses. No install ID and no cell. `500 server_not_configured` when the secret is not set.
- `TelemetryActor` (`src/telemetry/`): one SQLite Durable Object named `telemetry`. Tables `device_day`, `outage_record`, `miss_record`. The area actors send their `OUTAGE_RECORD` and `MISS` outputs here after each change (requeued on failure). Rows older than 90 days are pruned by a daily alarm. Delete-my-data (`POST /v1/delete`) also removes the install's `device_day` rows.
- Secret: set the GitHub secret `FIELD_READ_TOKEN` and the deploy workflow pushes it (`docs/deploy.md`), or run `wrangler secret put FIELD_READ_TOKEN` in `workers/api`. Never committed.
