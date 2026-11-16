# ADR 0042: REPORT event and the manual-report hint

Status: accepted (human blanket approval 2026-11-15). Spec: power-log task 1 (R7.4, R7.5).

## Context
"Power is out" taps must reach the area actor so area-cells R8 (manual-report hint) has a count. The engine needs k >= 3 drops to confirm, so a report can only raise a hint. The area reducer passed `manualInstalls: 0` until now.

## Decision
- New wire event `REPORT` with one extra field `kind`, which must be `OUT`. Same required fields as `LABEL`, `confidence` must be `HIGH`, no other field is allowed. "Power is back" is never uploaded.
- The Worker routes it like a detection-class event (prompt, no write-behind state). The area actor stores it as an ordinary detection row.
- The reducer keeps a `reports` list (install, cell, event time) for 10 minutes. A report never moves membership and never reaches an engine as an event. For each scope, `manualInstalls` is the count of distinct installs with a report in the scope's cells; `manualHint` still ignores a count of 1 (area-cells R8.2).
- Delete-my-data removes the install's reports.
- No new stored data beyond install ID, cell and event time for 10 minutes in the actor memory and state rows. `reports` loads as empty from states saved before this change.

## Alternatives
- Count reports in SQL on read: needs a new query path in the reducer, which is pure. Rejected.
- Feed reports to the engine as pseudo events: the engine would need new rules and a threshold change. Rejected.

## Consequences
One more event type on the wire (Kotlin `WireType.REPORT`, `WireEvent.kind`). Fixture `packages/shared/fixtures/ingest/event-report.json`.
