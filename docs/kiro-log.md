# Kiro log

Each entry says what was done and which spec, steering, hook, skill or agent shaped it.

## 2026-11-14 Steering foundation
- Created 15 steering files in `.kiro/steering/`: always (product, tech, structure, privacy, definition-of-done), fileMatch (event-time, android-background, detection, testing, copy), auto (gridwatch-lessons, demo-mode), manual (release, field-test, judge-demo, which become `/release`, `/field-test`, `/judge-demo`).
- `detection.md` references `packages/detection/README.md` with `#[[file:...]]`.
- Added `AGENTS.md` in `packages/detection/` and `modules/outage-sensor/`.
- Shaped by: master brief Part D.
- Open: `.kiroignore` write was denied by a permission rule. The human must create it (see below).
- Verified against https://kiro.dev/docs/steering/ that `fileMatchPattern` accepts an array.
- Note: AGENTS.md files in subdirectories are always loaded and ignore inclusion modes.

## 2026-11-14 sensor-android requirements and design
- Wrote `.kiro/specs/sensor-android/requirements.md` (R1 to R12, EARS) with a gap analysis and four open questions. The analysis was done by reading the brief. Kiro's Analyze Requirements tool is IDE-only and still has to be run on this file.
- Wrote `.kiro/specs/sensor-android/design.md`: state machine, three Mermaid sequence diagrams, stop decision table, SQLite data model, error handling, sensor properties S1 to S8 mapped to tests.
- Wrote `docs/adr/0001-sensor-job-timeout.md` (proposed) and the first `docs/traceability.md`.
- Docs verified: `JobParameters` stop reasons and the warning against relying on them, `BatteryManager` plug constants. Job time limit and delay figures come from community sources and are marked for probe confirmation.
- Shaped by: master brief Part F (sensor-android), `android-background.md`, `event-time.md`, `privacy.md` steering.
- Not done: `tasks.md`, because the brief requires human review of requirements and design first.

## 2026-11-14 sensor-android decisions and tasks
- Human delegated the open decisions. Resolved OQ1 to OQ4 and the plug-state re-read question in `requirements.md` and `design.md` section 12. ADR 0001 set to accepted for the probe only.
- Wrote `.kiro/specs/sensor-android/tasks.md`: 12 tasks in 7 waves with real dependencies and a Mermaid graph.
- Decisions kept inside the brief: no new dependency (JUnit4), no threshold change, no stored-data change.
- Follow-ups created: specs `station-mode`, `event-ingest` (must carry `timeQuality`), `detection-engine` (decide `LOW` confidence weighting).

## 2026-11-14 event-ingest spec
- Wrote `.kiro/specs/event-ingest/` requirements (R1 to R13, EARS, 11-item gap table), design (flowchart, four sequence diagrams, SQLite data model, error table, properties I1 to I9) and tasks (11 tasks, 7 waves, dependency graph).
- Wrote ADR 0002 (free-tier write budget: detection events written through, armed state write-behind) and ADR 0003 (server-signed install tokens against faked crowds).
- Docs verified: Durable Objects free-plan limits (100k requests, 100k rows written, SQLite-only) and Workers Free limits (10 ms CPU) from developers.cloudflare.com. These drove the write-behind design and the "no schema library" rule.
- Cross-spec effects: sensor `LOST` events are never uploaded; area-cells must expire armed state by `last_seen_ms`; detection decisions must hold counts only so delete-my-data keeps history valid.
- Human action needed before deploy: `wrangler secret put INSTALL_TOKEN_SECRET`. Task 9 revocation list stores hashed IDs for 30 days, so it needs your confirmation per the "changing what data is stored" rule.
- Analyze Requirements (IDE only) not yet run on this spec.

## 2026-11-14 station-mode spec
- Wrote `.kiro/specs/station-mode/` requirements (R1 to R10, 10-item gap table), design (flowchart, state amendments, three sequence diagrams, components, data changes, properties T1 to T7) and tasks (8 tasks, 6 waves). Wrote ADR 0004.
- Key finding: a spare phone at 100% would report a power cut as `BATTERY_FULL` under the sensor rule, so Station mode observes plug state directly through a receiver driver and keeps the Job as backup.
- Docs verified: `specialUse` foreground type has no runtime prerequisite, `dataSync` has a 6 h/24 h cap on Android 15 targets, and `BOOT_COMPLETED` cannot launch the restricted types (`specialUse` is not one). Source: developer.android.com service-types and Android 15 behavior-changes pages.
- Fixed an inconsistency found during writing: ingest's 15-minute state-event wait would delay heartbeats past the 30-minute offline rule, so Station mode shortens it to the heartbeat interval.
- Amended `sensor-android` design to point at the Station inputs. Event `source` field amends the ingest wire schema (task 1).
- Not changed: detection thresholds, stored personal data, dependencies.
