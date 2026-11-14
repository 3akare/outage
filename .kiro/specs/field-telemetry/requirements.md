# Requirements: field-telemetry

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

Field telemetry measures how well Outage works on real phones: how much of the charging time each phone is armed, how long a replug takes to be noticed, how often the alarm rings when it should, and how often the engine raises a false alarm or misses a real outage. It produces a daily Markdown report in `docs/field/`, and a scheduled job reads it, opens a Bugfix Spec for each new failure, and saves good real outages as replay fixtures.

Telemetry is opt-in and holds no location.

## Glossary

- **Device-day**: one phone's aggregates for one local day.
- **Armed ratio**: armed time divided by charging time on a detection plug.
- **Restore delay**: the time from a plug-in to the Sensor noticing it (`schedulingDelayMs`), and the time from the first replug of an outage to its restore decision.
- **False alarm**: a Confirmed outage whose labeled drops are all "No".
- **Miss**: a "Yes" label whose unplug is covered by no Possible or Confirmed outage.
- **Failure signature**: a short key for one kind of failure on one kind of device.
- **Gate**: the milestone numbers: armed ratio at least 90%, restore delay p95 at most 60 seconds.

## Requirements

### R1 Opt-in and privacy
1. THE app SHALL upload telemetry only when the user has turned on "Share anonymous diagnostics" (see `onboarding` R4.5).
2. THE telemetry SHALL contain no location, cell, name, phone number or model name.
3. THE telemetry SHALL contain only: install ID, the local day as a date, maker family, Android major version, mode, and counters and numbers described below.
4. THE user SHALL be able to turn it off and SHALL be able to delete uploaded telemetry through delete-my-data.
5. THE Worker SHALL keep device-day rows for 90 days.
6. THE field report SHALL name devices only as aliases (`D1`, `D2`, ...).

### R2 Device-day aggregate
1. THE app SHALL compute one aggregate per device per local day on the phone from the Sensor's telemetry.
2. THE aggregate SHALL include: charging ms on detection plug, armed ms, mode shares (normal and station), gap count and a histogram of gap lengths by reason, scheduling delay samples for `JOB` and `RECEIVER` sources (capped), replug-to-ring samples, prompts shown, answers yes and no, alarms rung, alarms expected, writes failed, standby bucket counts, battery exemption state, stop-reason counts.
3. THE aggregate SHALL be at most 8 KiB.
4. THE app SHALL upload at most one aggregate per device-day and SHALL send a closing aggregate for a day after local midnight.
5. THE upload SHALL be idempotent per (install ID, day).

### R3 Collection
1. THE Worker SHALL accept `POST /v1/telemetry` with the install token and a strict schema, and SHALL answer duplicates as accepted.
2. THE Worker SHALL store aggregates in a single telemetry actor and SHALL keep no event rows there.
3. THE Worker SHALL rate-limit uploads per install.
4. THE Worker SHALL reject any field not in the schema.

### R4 Metrics
1. THE report SHALL compute per device and per maker-and-Android class: armed ratio, gap count and p50 and p95 gap length by reason, scheduling delay p50 and p95 by source, replug-to-ring p50 and p95, prompts per day, alarm rate (rung over expected), and write failures.
2. THE report SHALL compute, over the day: the number of Confirmed outages, false alarms, misses and inconclusive outages (no labels).
3. THE report SHALL mark each gate with pass, fail or "not enough data" (fewer than 20 samples for a p95).
4. THE percentile method SHALL be nearest-rank.
5. THE armed ratio of a station SHALL be reported separately from normal mode.

### R5 False alarms and misses
1. THE area actor SHALL record, per outage, counts of labels: yes, no, unlabeled among eligible drops. The record SHALL hold counts only.
2. THE report SHALL classify an outage as a false alarm when it was Confirmed, it has at least one label, and all labels are "No".
3. THE report SHALL classify an outage as confirmed-true when it has at least one "Yes".
4. THE report SHALL classify the rest as inconclusive.
5. THE report SHALL list each miss with the number of armed phones in its scope at the time, without any identifier.

### R6 Daily report file
1. THE system SHALL produce `docs/field/YYYY-MM-DD.md` for each day with data.
2. THE file SHALL contain: devices table by alias, gates table, metric tables, outage list, false alarms, misses, new failures, fixture candidates, and the parameter values in use (from `params.ts`).
3. THE file SHALL be Markdown only and contain no install ID, cell or location.
4. THE report generator SHALL be a pure function from the day's JSON to Markdown, so it is testable.
5. THE file SHALL link each new failure to its Bugfix Spec.

### R7 Scheduled run
1. A Kiro Web Schedule SHALL run at 07:00 West Africa Time (06:00 UTC) each day and run the `/field-test` procedure.
2. THE repo SHALL record the schedule's name, time and prompt in `.kiro/schedules/field-test.md`.
3. THE scheduled run SHALL fetch the previous day's aggregate JSON from the Worker with a read token, generate the report, commit it to `main` on its own commit, and follow the rules in R8 and R9.
4. IF the fetch fails, THEN THE run SHALL write a short note in `docs/field/` saying so and SHALL open no Bugfix Spec for that failure alone.
5. THE read token SHALL be a Wrangler secret on the Worker and a secret in the scheduled job's environment, never committed.

### R8 Failures and Bugfix Specs
1. THE report generator SHALL derive failure signatures from these checks: armed ratio below 90% (and below 50% as critical), scheduling delay p95 above 60 seconds, an alarm expected and not rung, a false alarm, a miss with enough armed phones, write failures, foreground service start blocked, and an upload gap longer than a day for an opted-in device.
2. A signature SHALL be `check:maker:androidMajor:mode`.
3. THE run SHALL compare signatures with `docs/field/failures.json`.
4. FOR each new signature, THE run SHALL create a Bugfix Spec under `.kiro/specs/bugfix-YYYYMMDD-<slug>/` with the current behavior, the expected behavior, and the behavior to keep unchanged, and SHALL add the signature to `failures.json` with a link.
5. THE run SHALL NOT open a second spec for a known signature, and SHALL add a count and the latest date to it.
6. THE run SHALL NOT patch code. It only files specs.

### R9 Fixtures
1. WHEN an outage was recorded by 2 or more devices and was Confirmed, THE report SHALL list it as a fixture candidate.
2. THE scheduled run SHALL NOT commit a fixture. A fixture needs the sanitizer and the owner's approval (`demo-mode` R6).
3. THE candidate entry SHALL give the outage's day, device count and the command to export it.

### R10 Gate summary
1. THE report SHALL state, at the top, whether the milestone-1 gate (armed ratio at least 90% on at least one phone, restore delay p95 at most 60 seconds, Tecno or Infinix working after battery exemption) is met, not met or not measurable yet.
2. THE report SHALL state the kill criterion status (armed ratio below 50% on every phone even with exemption and the fallback).

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | "False alarms and misses from labels" had no definition. | R5. |
| G2 | Telemetry could leak location or identity. | R1. |
| G3 | "Restore delay" can mean two things. | R4.1 reports both. |
| G4 | A scheduled agent needs a secret to read server data. | R7.5. |
| G5 | "Opens a Bugfix Spec for any new failure" could create duplicates every day. | R8.2 to R8.5. |
| G6 | Fixtures from the field contain homes. | R9.2 and `demo-mode` sanitizer. |
| G7 | A p95 from few samples is misleading. | R4.3. |
| G8 | Station armed time and normal armed time differ. | R4.5. |
| G9 | The report must be reproducible. | R6.4. |
| G10 | The scheduled run could patch code unreviewed. | R8.6. |
| G11 | Aggregates per device must be small and capped for the free tier. | R2.3, R3. |
| G12 | Timezone of the 07:00 job. | R7.1. |

## Decisions (2026-11-14)

| Item | Value |
|---|---|
| Aggregate size cap | 8 KiB |
| Retention | 90 days |
| Minimum samples for a p95 | 20 |
| Schedule | 06:00 UTC daily (07:00 West Africa Time) |
| Diagnostics default | off in public builds, on in field-test builds |
| Failure signature | `check:maker:androidMajor:mode` |

- Telemetry stores new data on the server (device-day aggregates keyed by install ID). The human should confirm this per the stored-data rule; ADR 0011 records it.
- The read token and how the scheduled job receives it must be confirmed in Kiro Web (secret support). If the schedule cannot hold a secret, the human runs `/field-test` by hand and the repo still holds the procedure.
