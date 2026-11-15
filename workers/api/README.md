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

## Home Watch pairing (spec: home-watch, ADR 0009)

One `PairingActor` (binding `PAIRING`, migration `v4`) per two-symbol shard. The shard comes from the station's install id, so offers, pairs and delete-my-data all find the same rows without a table.

| Route | Body | Answers |
|---|---|---|
| `POST /v1/pair/offer` | `{ installId }` (station) | `200 { code, expiresAtMs }`, `409 station_full`, `429` |
| `POST /v1/pair/claim` | `{ installId, code, fcmToken, quietStartMin, quietEndMin, tzOffsetMin, stationName? }` (viewer) | `200 { pairId }`, `404 not_found` for every failed claim, `409 station_full`, `429` |
| `POST /v1/pair/remove` | `{ installId, pairId }` (either side) | `200 { removed: true }`, `404 not_found` |
| `POST /v1/delete` | adds optional `pairIds` (viewer lists its pairs, at most 25) | also removes this install's offers and pairs |

The offer stores only an HMAC of the code (secret `INSTALL_TOKEN_SECRET`). Code layout: shard (2) + offer key tail (2) + secret part (6). Offers and claims use the ingest token bucket per install.
