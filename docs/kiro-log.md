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

## 2026-11-14 detection-engine spec
- Wrote `.kiro/specs/detection-engine/` requirements (R1 to R17, EARS, 16-item gap table, IDE steps), design (pipeline flowchart, full sweep algorithm, data model ER diagram, two sequence diagrams, numerics, settling, error table, properties P1 to P12 plus D1 to D6 mapped to named tests, generators) and tasks (18 tasks, 8 waves, dependency graph).
- Wrote ADR 0005 with every parameter the brief left open, and a computed table of the minimum drops k for Possible and Confirmed at n = 3 to 100 under the prior. The numbers came from a script run in the sandbox.
- Core design decision: decisions are a pure function of the retained event set, not of arrival order. This gives P3, P4 and P8 by construction. A late event joins the set and the sweep reruns.
- Gaps the brief had: weight undefined, conservative prior without a value, EMA unsuited to order independence, P8 clashing with an hour-of-day baseline, restore delay circular with restores, state events missing from the ingest port. All resolved or flagged in the spec.
- Amended `event-ingest` design section 9 and task 5: the port now carries `ARMED` and `DISARMED`.
- Fixed two of my own errors before commit: a sloppy horizon constant, and a performance target of 50 ms that contradicted the 10 ms free-plan CPU limit.
- Not done and cannot be done in Kiro Web: Analyze Requirements and the Correctness (property-based testing) pass. Task 15 and the "IDE steps" section tell the human what to run in Kiro IDE.
- Needs human attention: ADR 0005 values (thresholds) and the P8 reading.

## 2026-11-14 area-cells spec
- Wrote `.kiro/specs/area-cells/` requirements (R1 to R14, 15-item gap table), design (architecture flowchart, scope-selection flowchart, link, notice and scheduling sequence diagrams, public-view type, ER data model, error table, properties A1 to A12) and tasks (12 tasks, 7 waves, dependency graph). Wrote ADR 0006 (sharding, scope and link rules) and ADR 0007 (public map privacy floor of 3 members).
- Docs verified: H3 resolution table (res 8 about 0.74 km², res 7 about 5.16 km², 7 children) and the `h3-js` function list. H3 startup cost on the Worker is unmeasured and is task 2.
- Two problems with the brief's wording, fixed in the spec: (1) "fewer than 3 armed sensors" taken literally turns a cell sparse during an outage, since every phone has dropped, so "armed" for scope selection means armed in the last 24 h and open outages keep their scope; (2) per-cell Durable Objects would double requests for sparse cells, so actors are per res-7 parent.
- Amended `event-ingest` requirements R7 and design overview for parent routing. Detection engine spec unchanged.
- Cross-parent linking deferred. Manual-report hint threshold (2 reporters in 10 min) is a starting value pending the report feature.
- Human attention: ADR 0007's floor of 3 members, ADR 0006's manual-report value.

## 2026-11-14 alerts-and-light-alarm spec
- Wrote `.kiro/specs/alerts-and-light-alarm/` requirements (R1 to R11, 15-item gap table), design (architecture flowchart, alarm state diagram, ring-path and push-sending sequence diagrams, subscription ER model, pure PushPlanner, error and risk tables, properties L1 to L12) and tasks (9 tasks, 5 waves). Wrote ADR 0008.
- Docs verified: Android 14 full-screen intent limits and `canUseFullScreenIntent`, `SCHEDULE_EXACT_ALARM` denied by default, Expo push limits (100 per request, 600 per second, 4 KiB, missing channel means not displayed) and the FCM v1 requirement on Android. Sources: developer.android.com Android 14 behavior pages, docs.expo.dev push pages.
- Design decisions that follow from the docs: the alarm is event-driven (no exact alarm) and entirely native so it works offline with the app closed; alarm audio plays directly so it rings even when notification permission is denied; full-screen intent is only an optional layer.
- Amended: `sensor-android` design (LABEL event), `event-ingest` design (LABEL wire type), `station-mode` requirements (no prompt or alarm in Station mode).
- Human attention: Firebase project and FCM v1 key (external service, needs approval); subscription storage including quiet windows (stored-data change); optional `EXPO_ACCESS_TOKEN`.
