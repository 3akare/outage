# ADR 0037: Power Log storage in a second SQLite database

Status: accepted (human blanket approval 2026-11-15). Spec: power-log task 2 (R1, design section 4).

## Context
The Power Log needs raw inputs (sensor events, answers, manual taps, cached area outages) kept for at least 400 days (R1.4), offline (R1.5), and erasable (R1.6). The sensor's `outage_sensor.db` is an Outbox: rows are acked and pruned, and its reset rules protect the seq counter. Room is not approved (ADR 0012).

## Decision
- A second database, `outage_log.db`, on plain `SQLiteOpenHelper` (`app/outage/log/LogStore.kt`, `SqliteLogStore`).
- Tables at version 1: `raw_input (id, kind, input_key UNIQUE, device_ms, payload)` and `setting (key, value)`. `payload` is small JSON with numbers and fixed words, never a location.
- Migrations run step by step in `SqliteLogStore.migrate(db, from, to)`; `onCreate` runs every step from 0. Each new version adds a branch; old branches are never edited.
- Duplicates are dropped by `input_key` (events by seq, taps by time). Answers and area outages keep the latest copy.
- `INTERVAL` and `DAY_STAT` from the design are not stored. `TimelineBuilder` and `Stats` rebuild them from `raw_input` on read, which is what PL1 requires anyway. If the 400-day rebuild is slow on a device, a cache table can be added as migration 2.
- `MemoryLogStore` has the same rules for JVM use.

## Alternatives
- Extra tables in `outage_sensor.db`: one file to delete, but prune and corrupt-reset of the Outbox would risk the log. Rejected.
- Room: needs human approval and a new dependency. Rejected.
- Store intervals: needs invalidation when late evidence arrives. Rejected for now.

## Consequences
Stored data on the phone: wall-clock times of the user's own events and taps, and public area outage times. Nothing is uploaded from this database (R1.3). Delete-my-data must call `LogStore.clear()` (task 10).
