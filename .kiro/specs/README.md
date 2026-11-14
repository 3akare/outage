# Specs index

Every feature has `requirements.md`, `design.md` and `tasks.md`. Status: all APPROVED by delegation on 2026-11-14 ("make the right decisions"), except where a note says a human step is open. No application code exists yet.

Build order follows the master brief, Part I. The probe comes first and gates the rest. Exception approved by the human on 2026-11-14: `event-ingest` and `detection-engine` start while the probe waits for the Samsung data, because neither depends on which sensor wins (job or Station-mode receivers). `sensor-android` still waits for the gate (ADR 0013).

| # | Spec | Milestone | Property IDs | Depends on |
|---|---|---|---|---|
| 0 | `feasibility-probe` (Quick Spec) | 1 | PR1 to PR5 | none |
| 1 | `sensor-android` | 1 to 2 | S1 to S8 | probe gate |
| 2 | `event-ingest` | 2 | I1 to I9 | sensor types |
| 3 | `detection-engine` | 2 | P1 to P12, D1 to D6 | ingest port |
| 4 | `area-cells` | 2 | A1 to A12 | engine, ingest |
| 5 | `station-mode` | 2 | T1 to T7 | sensor, ingest |
| 6 | `alerts-and-light-alarm` | 3 | L1 to L12 | sensor, ingest, area-cells |
| 7 | `power-log` | 3 | PL1 to PL9 | sensor, alerts |
| 8 | `home-watch` | 3 | H1 to H8 | station, ingest, alerts |
| 9 | `onboarding` | 3 | O1 to O8 | sensor, ingest, alerts |
| 10 | `web-and-area-pages` | 4 | W1 to W9 | area-cells, engine |
| 11 | `demo-mode` | 4 | DM1 to DM7 | engine, web |
| 12 | `field-telemetry` | 4 | F1 to F8 | sensor, area-cells, onboarding |

Bugfix Specs (`bugfix-YYYYMMDD-<slug>`) are added by the daily field run and by hand.

## Cross-spec amendments (recorded in the amended documents)

| Amendment | Made by | Applies to |
|---|---|---|
| Route events by res-7 parent ("area actor") | `area-cells` | `event-ingest` requirements R7, design overview |
| `DetectionPort` also carries `ARMED` and `DISARMED` | `detection-engine` | `event-ingest` design 9, task 5 |
| `LABEL` event type | `alerts-and-light-alarm` | `sensor-android` design, `event-ingest` wire schema |
| `REPORT` event type (kind `OUT`) | `power-log` | `sensor-android`, `event-ingest`, `area-cells` hint |
| `source` field, `HEARTBEAT_ON_BATTERY` | `station-mode`, `home-watch` | sensor and ingest schemas, station R5.5 |
| No prompt or alarm in Station mode | `alerts-and-light-alarm` | `station-mode` R2.6 |
| `beginSelfTest`, `PlugObserver`, `setDemoSession` | `onboarding`, `demo-mode` | `sensor-android` module API |
| Public index actor | `web-and-area-pages` | `area-cells` publisher |

## What needs the human

- Run Analyze Requirements on each spec. It runs in Kiro IDE and in the Kiro CLI, not in Kiro Web (https://kiro.dev/docs/specs/). Run the Correctness pass in Kiro IDE for `detection-engine`.
- Review ADR 0005 (detection parameters), ADR 0006 and 0007 (sharding, public map floor), ADR 0008 (Firebase and push storage), ADR 0009 (Home Watch pairing data), ADR 0011 (telemetry data).
- Approve new dependencies when a task asks: `com.uber:h3`, Firebase Messaging, Jetpack Compose and Material 3, QR libraries, share-card libraries (ADR 0012).
- Create secrets: `INSTALL_TOKEN_SECRET`, `PROBE_TOKEN`, `FIELD_READ_TOKEN`, `FCM_SERVICE_ACCOUNT` (Firebase service-account key, Wrangler secret); the Firebase project for push; `.kiroignore`.
- Verify facts used in public text: the tariff bands (NERC), the Lagos area centre coordinates, the GridWatch figures.
