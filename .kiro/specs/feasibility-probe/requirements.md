# Requirements: feasibility-probe (Quick Spec)

Status: Quick Spec, generated without approval gates as the brief allows for this one throwaway probe. Dated 2026-11-14. Design in `design.md`, tasks in `tasks.md`. The probe code is throwaway and lives in `tools/probe/`; delete it after the gate is decided. The numbers and ADRs it produces are not throwaway.

## Introduction

Milestone 1 asks one question before anything else is built: does the charging-constraint job sensor work well enough on real phones, including Tecno and Infinix? The probe is a small native Kotlin Android app (plain Views, no libraries beyond the platform, built by GitHub Actions) with a minimal sensor, one Worker endpoint that stores raw events, and a debug screen. It measures the numbers the gate needs and settles the open questions in ADR 0001, ADR 0004 and the alert and alarm specs.

## Gate (from the brief, Part I milestone 1)

- Armed time divided by charging time is at least 90% on at least one phone.
- Plug-in to job-start delay has p95 of at most 60 seconds.
- Tecno or Infinix works after battery exemption.

IF the gate fails, THEN stop, write an ADR with options (fallback: foreground service in Station mode), and ask the human. The kill criterion (armed below 50% on every phone, even with exemption and the fallback) means stop and rethink the sensor.

## Requirements

### R1 Minimal sensor
1. THE probe SHALL schedule one JobScheduler job with the charging constraint and keep it running while charging.
2. ON every `onStartJob` and `onStopJob`, THE probe SHALL log: monotonic time, wall time, stop reason (Android 12+), battery percent, plug type, battery status, standby bucket, whether the app is exempt from battery optimization, and the job id.
3. ON every `onStopJob`, THE probe SHALL reschedule the job immediately and log the time between the stop and the next start.
4. THE probe SHALL NOT classify events. It records raw facts.

### R2 Reference logger
1. THE probe SHALL run a foreground service with dynamic power-connected and power-disconnected receivers as the time reference, and log each broadcast with monotonic and wall time and the plug state read at that moment and one second later.
2. THE reference logger SHALL be switchable off, to measure the job alone.

### R3 Raw event store
1. THE probe SHALL upload events in batches to one Worker endpoint that stores them as rows with a tester-chosen device alias, maker, Android version, and the raw fields.
2. THE endpoint SHALL require a probe token held as a Wrangler secret.
3. THE endpoint SHALL offer an export of all rows as JSON, protected by the same token.
4. THE probe SHALL keep events on the phone if the network is down and SHALL support exporting them from the phone as a file.

### R4 Debug screen
1. THE debug screen SHALL show: sensor on or off, current plug and battery, job state, counters of starts, stops, stop reasons, gaps, and the last 50 log lines.
2. THE screen SHALL have buttons for start and stop, upload now, export file, clear, "mark note" (a free text with the time), and a reference-logger switch.
3. THE screen SHALL show the live armed ratio since the session start.

### R5 Analysis
1. A script SHALL read the exported JSON and compute the measurements below, with nearest-rank percentiles.
2. THE script SHALL write `docs/probe/YYYY-MM-DD-<alias>.md` per device and a combined summary.

### R6 Measurements
THE probe SHALL measure, per device and condition:

| ID | Measurement | Purpose |
|---|---|---|
| M1 | Armed time divided by charging time over at least 12 hours, screen off | Gate: at least 90% |
| M2 | Plug-in to job-start delay over 20 replugs: p50, p95 | Gate: p95 at most 60 s |
| M3 | Job behaviour at 100% battery while plugged: does it stop, with which reason, and do power broadcasts still arrive | `sensor-android` R3.2, ADR 0004 |
| M4 | The same device before and after battery exemption, and with autostart or background settings changed (Tecno, Infinix, itel, Samsung, Xiaomi where available) | Gate and OEM guide |
| M5 | Job timeout frequency and the gap between stop and next start | ADR 0001 |
| M6 | Unplug to `onStopJob` delay (against the reference logger), and whether the plug state at the stop equals the plug state one second later | Plug-state re-read question |
| M7 | Power broadcast delay and reliability with the screen off and the phone idle for 30 minutes (Doze), and at 100% | ADR 0004, Station mode |
| M8 | Whether a job with the charging constraint can be expedited, and what happens | ADR 0001 option 2 |
| M9 | Whether alarm audio can be started from the job process on replug, with the screen off and the app closed | `alerts-and-light-alarm` risks |
| M10 | Time from plug-in to job start after at least 30 minutes idle (Doze exit on plug) | `alerts-and-light-alarm` risks |
| M11 | Plug type reported for a wall charger, a USB port of a computer, wireless charging and a power bank | `sensor-android` R6 |
| M12 | Whether `canUseFullScreenIntent` is true on the sideloaded build, on each Android 14 or newer phone | `alerts-and-light-alarm` R3.9 |
| M13 | Phone to Worker request round trip time over mobile data and Wi-Fi | Upload latency bias in `event-ingest` |
| M14 | Whether the sticky battery intent reports the same plug and level as `BatteryManager` properties at each stop | Facts check |

### R7 Safety and privacy
1. THE probe SHALL collect no location, microphone or personal data.
2. THE probe SHALL be installed only by the human on their own phones.
3. THE probe data SHALL contain a tester alias, never a name or phone number.
4. THE Worker endpoint SHALL be removed after the gate decision, and the token rotated or deleted.

### R8 Output
1. THE probe SHALL end with `docs/probe/summary.md` (all devices and conditions) and an ADR `docs/adr/0013-feasibility-gate.md` that states the gate result and the chosen path.
2. THE ADR SHALL update ADR 0001 and ADR 0004 with the measured facts, and list any new decision for the human.
3. THE probe SHALL record the exact phones, Android versions and dates.

## Decisions
- Use the human's phones; the matrix is whatever is available. The summary lists coverage gaps honestly.
- The probe uses `tools/probe/android`, `tools/probe/worker` and `tools/probe/analyze`. These are outside the monorepo layout on purpose, since they are throwaway.
- New dependencies: none beyond the toolchain approved by ADR 0012 (Kotlin, Gradle, the Android Gradle plugin) and Wrangler, TypeScript and Vitest for the Worker and the analysis. The Android code uses only platform classes (`SQLiteOpenHelper`, `HttpURLConnection`, `JobScheduler`, plain Views).
