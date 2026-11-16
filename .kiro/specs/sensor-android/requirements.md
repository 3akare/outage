# Requirements: sensor-android

Status: APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). Open questions resolved below. Design in `design.md`, tasks in `tasks.md`.

## Introduction

The Sensor is the `sensor` package of the native Kotlin app (`android/outage`, ADR 0012). It watches whether a phone is charging and emits events when charging stops or resumes. When grid power dies, every charging phone in an area stops charging at once. The Sensor turns that into timestamped events that `event-ingest` and `detection-engine` consume.

The Sensor does not decide whether an outage happened. It reports facts and its confidence in them.

> **Amended 2026-11-23 (ADR 0032).** The Job driver is the backup sensor. The primary sensor is the foreground-service receiver (see `station-mode`), for every user. Requirements below about arming and unplug detection apply to both drivers. An unplug seen by both is recorded once.

## Glossary

- **Sensor**: the `sensor` package of `android/outage`.
- **Job**: the JobScheduler job with the charging constraint (`setRequiresCharging(true)`).
- **Detection plug**: AC or dock power. USB-from-computer and wireless are non-detection plugs.
- **Event types**: `ARMED`, `UNPLUG`, `BATTERY_FULL`, `REPLUG`, `DISARMED`.
- **Armed**: the Job is scheduled or running while the phone is on a detection plug.
- **Elapsed**: monotonic milliseconds from `SystemClock.elapsedRealtime()`. Never wall clock.
- **Confidence**: `HIGH` (Android 12+ stop reason, corroborated) or `LOW` (inferred).
- **Outbox**: the on-device queue of events not yet acknowledged by the app's uploader.

## Requirements

### R1 Keep the Job alive while charging
**User story:** As a user, I want the sensor to stay armed whenever I am charging, so that no outage is missed.
1. WHILE the phone is charging on a detection plug, THE Sensor SHALL keep the Job scheduled or running.
2. WHEN the Sensor is started, THE Sensor SHALL schedule the Job and emit `ARMED` once the Job starts while charging.
3. WHEN the device reboots or the app is updated, THE Sensor SHALL reschedule the Job without the user opening the app.
4. THE Sensor SHALL use one stable Job ID so that scheduling is idempotent.

### R2 Record the stop before anything else
**User story:** As a maintainer, I want every stop recorded with full context, so that decisions can be explained later.
1. WHEN the Job stops, THE Sensor SHALL first record the stop reason (Android 12+), elapsed time, battery percent and plug type, and only then reschedule or emit.
2. THE Sensor SHALL persist this record to the Outbox before returning from the stop callback.
3. IF persisting fails, THEN THE Sensor SHALL still reschedule the Job and log the failure in diagnostics.

### R3 Emit UNPLUG or BATTERY_FULL
**User story:** As the detection engine, I want a clear drop signal, so that cross-phone timing can be measured.
1. WHEN the stop reason is the charging constraint, THE Sensor SHALL emit `UNPLUG`.
2. IF the phone was plugged at 95% battery or higher at the stop, THEN THE Sensor SHALL emit `BATTERY_FULL` instead of `UNPLUG`.
3. THE Sensor SHALL corroborate a charging-constraint stop by reading the plug state at stop time. IF the plug state still shows a detection plug, THEN THE Sensor SHALL NOT emit `UNPLUG`, SHALL emit `DISARMED` with reason `STOP_REASON_MISMATCH`, and SHALL reschedule.
4. THE Sensor SHALL NOT emit `UNPLUG` for a stop that happened while the phone was already off a detection plug.

### R4 Emit REPLUG
**User story:** As a user, I want to know when power returns, so that my Light Alarm can ring.
1. WHEN the Job starts while charging on a detection plug after an `UNPLUG`, THE Sensor SHALL emit `REPLUG` with the scheduling delay in milliseconds.
2. IF the plug-in time is unknown, THEN THE Sensor SHALL emit `REPLUG` with `schedulingDelayMs` null and the Job start time as the event time.
3. WHEN `REPLUG` is emitted, THE Sensor SHALL hand it to the Light Alarm immediately, in the same process, so that the alarm can ring without network.
4. WHEN the Job starts after a `BATTERY_FULL` stop, THE Sensor SHALL emit `ARMED` and not `REPLUG`.

### R5 Other stops are gaps
**User story:** As the field-test owner, I want every unarmed period recorded, so that armed time can be measured.
1. WHEN the Job stops for any reason other than the charging constraint, THE Sensor SHALL reschedule immediately and record a `DISARMED` event with the stop reason and gap start.
2. WHEN the Job starts again after a gap, THE Sensor SHALL record the gap length in diagnostics and emit `ARMED`.
3. WHEN the process is killed without a stop callback, THE Sensor SHALL detect the missing heartbeat at next start and record a `DISARMED` gap with reason `PROCESS_DEATH` and unknown length.
4. IF the device rebooted during a gap, THEN THE Sensor SHALL mark the gap `REBOOT`.

### R6 Plug types
**User story:** As the detection engine, I want only meaningful power sources to count.
1. THE Sensor SHALL classify each plug as AC, USB, wireless or dock.
2. THE Sensor SHALL ignore USB and wireless plugs for detection, meaning no `ARMED`, `UNPLUG` or `REPLUG` events.
3. THE Sensor SHALL keep every plug change on non-detection plugs in telemetry.
4. WHEN a phone moves from a detection plug to a non-detection plug, THE Sensor SHALL treat it as a stop that is not a grid signal and emit `DISARMED` with reason `NON_DETECTION_PLUG`.

### R7 Android versions below 12
**User story:** As a user on an older phone, I still want the app to work, with honest confidence.
1. IF Android < 12, THEN THE Sensor SHALL infer the cause of a stop from the plug state and mark the event `LOW` confidence.
2. IF Android < 12 and the plug state shows unplugged, THEN THE Sensor SHALL emit `UNPLUG` with `LOW` confidence.
3. IF Android >= 12, THEN THE Sensor SHALL mark events `HIGH` confidence only when the stop reason and plug state agree.

### R8 Background and screen state
**User story:** As a user, I want the app to work with the screen locked and the app closed, without a permanent notification.
1. THE Sensor SHALL work with the app closed and the screen locked.
2. THE Sensor SHALL NOT show a permanent notification in normal mode.
3. WHERE Station mode is enabled, THE Sensor MAY run a foreground service with a persistent notification.
4. WHEN the app standby bucket or battery exemption state changes, THE Sensor SHALL record it in diagnostics.

### R9 Event record and ordering
**User story:** As `event-ingest`, I want ordered, idempotent events with trustworthy times.
1. THE Sensor SHALL assign each event a persisted, strictly increasing sequence number that survives restarts.
2. THE Sensor SHALL record each event with its elapsed-time stamp and boot identifier. It SHALL NOT record or send wall-clock time.
3. WHEN the uploader reads events, THE Sensor SHALL return `elapsedMs` as the time since the event, computed at read time.
4. IF an event was recorded in an earlier boot, THEN THE Sensor SHALL mark its time `LOST`, and such events SHALL be kept for telemetry only.
5. THE Sensor SHALL keep events in the Outbox until the uploader acknowledges them by sequence number, and SHALL drop events older than 7 days.
6. THE Sensor SHALL NOT include location, phone number, name or any identifier except the install ID set by the app.

### R10 Telemetry for field tests
**User story:** As the field-test owner, I want armed time and delays measured on every device.
1. THE Sensor SHALL record each charging session (start, end, plug type) and each armed interval, using elapsed time.
2. THE Sensor SHALL expose armed time divided by charging time over a requested period.
3. THE Sensor SHALL record the plug-in to Job-start delay for every start.
4. THE Sensor SHALL expose diagnostics: Android version, manufacturer, standby bucket, battery-exemption state, stop-reason counts, and recent gaps.
5. THE Sensor SHALL cap telemetry storage to 7 days.

### R11 Controller interface
**User story:** As the app developer, I want a small, typed Kotlin interface.
1. THE Sensor SHALL expose a `SensorController` with `start`, `stop`, `setInstallId`, `getPendingEvents(limit)`, `ackEvents(upToSeq)`, `getTelemetry(periodMs)`, `getDiagnostics`, and an event listener.
2. WHEN `stop` is called, THE Sensor SHALL cancel the Job and emit a final `DISARMED` with reason `USER_STOPPED`.
3. IF `start` is called while already started, THEN THE Sensor SHALL do nothing and report the current state.

### R13 Plug observer and demo flag (amended for `demo-mode` task 1)
1. THE Sensor package SHALL expose a `PlugObserver` that a visible screen can start and stop. WHILE started, it SHALL report each change of plug type (AC, USB, wireless, dock, none) once, from the `ACTION_BATTERY_CHANGED` broadcast, with no Job, no Outbox and no event record.
2. THE Sensor package SHALL expose a `DemoFlag`, an in-process flag set by the demo session. WHILE it is active, THE app SHALL NOT show the "Power just went?" prompt for real events; real events SHALL still be recorded.
3. THE `DemoFlag` SHALL turn inactive when the demo screen closes, or when the app has been in the background for more than 30 seconds.

### R12 Privacy
1. THE Sensor SHALL NOT use the microphone, accelerometer or location.
2. WHEN delete-my-data is requested, THE Sensor SHALL erase the Outbox, telemetry and install ID.

## Analysis of requirements (gaps found and how they were fixed)

This analysis was done by Kiro Web reading the brief. Kiro's Analyze Requirements tool runs in the IDE; run it there on this file and record the result here.

| # | Gap found | Fix |
|---|---|---|
| G1 | Brief says "stop reason is charging constraint => UNPLUG". Android docs say apps should not depend on the stop reason for critical decisions. | R3.3 corroborates with plug state. R7.3 sets confidence. |
| G2 | No `ARMED` start rule. | R1.2, R4.4. |
| G3 | Reboot, app update and process death were unspecified. | R1.3, R5.3, R5.4, R9.4. |
| G4 | Moving from AC to USB or wireless is a stop but not a grid signal. | R6.4. |
| G5 | "Scheduling delay" undefined when plug-in time is unknown. | R4.2. |
| G6 | Who assigns sequence numbers and when the UI may not be running. | R9.1. The sensor owns them. |
| G7 | Retention of unsent events. | R9.5 uses the 7-day limit from event-ingest. |
| G8 | Light Alarm needs REPLUG without network, with app maybe alive. | R4.3. |
| G9 | `BATTERY_FULL` then unplug or replug semantics. | R3.2, R4.4. |
| G10 | Delete-my-data and privacy not stated. | R12. |

## Decisions on open questions (2026-11-14)

- **OQ1 Android < 12:** supported at `LOW` confidence (R7). `minSdk` is 26 (ADR 0012). How detection weighs `LOW` events is decided in the `detection-engine` spec, not here.
- **OQ2 Station mode:** a separate spec, `station-mode`. This spec only provides the hook point (R8.3) and a state machine that a second driver can feed.
- **OQ3 Events across a reboot:** kept for telemetry only and excluded from detection (R9.4). `event-ingest` must carry `timeQuality` and drop `LOST` events from detection input.
- **OQ4 Kotlin test tooling:** plain JUnit4 with seeded random loops. No new dependency. Detection property tests use fast-check.
- **Plug-state re-read after a stop:** not included. If the probe shows the plug state lags the stop callback, the lag value and any re-read are decided from that data in a new ADR before being added. It changes event timing, so it is not guessed.
