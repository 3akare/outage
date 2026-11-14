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
