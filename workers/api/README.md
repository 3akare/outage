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
- Cost: `npm run bench -w workers/api` measures startup, ingest and alarm CPU on a local SQLite shim. Results and the 10 ms free-plan comparison are in the ADR 0006 addendum. Small parents (70 phones) fit; 210 or more phones per parent on a cold actor do not, so watch the dashboard CPU time after deploy.
