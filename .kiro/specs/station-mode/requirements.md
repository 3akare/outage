# Requirements: station-mode

Status: APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). Design in `design.md`, tasks in `tasks.md`.

## Introduction

Station mode turns a spare phone, left plugged in at home, into an always-on power sensor. It is the planned fallback when the JobScheduler sensor loses armed time (OEM killers, job timeouts), and it powers Home Watch.

A spare phone sits at 100% battery. The normal sensor treats a stop at 95% or more as `BATTERY_FULL`, so on a full phone it cannot tell a power cut from a full battery. Station mode watches the plug state directly and fixes that.

This spec extends `sensor-android`. It adds a second driver for the same state machine and does not replace it.

## Glossary

- **Station mode**: a user-enabled mode with a foreground service.
- **Station service**: the foreground service.
- **Receiver driver**: dynamic receivers for power connected and power disconnected, running inside the Station service.
- **Job driver**: the existing JobScheduler sensor from `sensor-android`.
- **Heartbeat**: a periodic `ARMED` state event that tells the server the station is alive.

## Requirements

### R1 Enable and disable
**User story:** As a user with a spare phone, I want one tap to make it a station.
1. WHEN the user taps "Make this a station", THE Sensor SHALL start the Station service and persist Station mode as enabled.
2. WHEN the user turns Station mode off, THE Sensor SHALL stop the Station service, remove its notification, and keep the Job scheduled.
3. WHEN the device reboots and Station mode is enabled, THE Sensor SHALL restart the Station service without the user opening the app.
4. IF the Station service cannot start, THEN THE Sensor SHALL record `FGS_START_BLOCKED` with the Android exception name in diagnostics and continue in Job-only mode.
5. THE Sensor SHALL expose whether Station mode is enabled and whether the service is running.

### R2 Foreground service and notification
**User story:** As a user, I want to see that my station is running and be able to stop it.
1. THE Station service SHALL declare the `specialUse` foreground service type with a use-case property, and SHALL NOT use `dataSync`.
2. WHILE the Station service runs, THE Sensor SHALL show one persistent notification on a low-importance, silent channel with plain text and a "Stop station" action.
3. THE notification text SHALL contain no location, install ID or personal data.
4. WHEN notification permission is denied on Android 13 or higher, THE Sensor SHALL still run the service and SHALL report `NOTIFICATION_HIDDEN` in diagnostics so the app can explain it.
5. THE Sensor SHALL NOT show this notification in normal mode.
6. WHILE Station mode is enabled, THE Sensor SHALL NOT show the per-unplug "Power just went?" prompt and SHALL NOT ring a Light Alarm. (Added 2026-11-14 by `alerts-and-light-alarm`; nobody answers a station's prompt, and Home Watch handles stations.)

### R3 Direct plug observation
**User story:** As the detection engine, I want a full spare phone to report a power cut.
1. WHILE the Station service runs, THE Receiver driver SHALL observe power-connected and power-disconnected broadcasts and the plug state.
2. WHEN power disconnects while the phone is armed on a detection plug, THE Sensor SHALL emit `UNPLUG` at any battery level, including 95% and above.
3. WHEN power reconnects on a detection plug after an `UNPLUG`, THE Sensor SHALL emit `REPLUG` at once, with `schedulingDelayMs` of 0.
4. THE Sensor SHALL mark each event with its source: `RECEIVER` or `JOB`.
5. WHEN the plug moves from a detection plug to USB-from-computer or wireless, THE Sensor SHALL handle it as in `sensor-android` R6.4.
6. IF the plug state read after a disconnect broadcast still shows a detection plug, THEN THE Sensor SHALL NOT emit `UNPLUG` and SHALL record a `STATION_BROADCAST_MISMATCH` count in diagnostics.

### R4 Coexistence with the Job driver
1. WHILE Station mode is enabled, THE Sensor SHALL keep the Job scheduled as a backup driver.
2. WHEN both drivers report the same real unplug, THE Sensor SHALL emit exactly one `UNPLUG`.
3. WHEN both drivers report the same real replug, THE Sensor SHALL emit exactly one `REPLUG`.
4. WHEN the Job stops with `BATTERY_FULL` classification while the phone is still plugged, THE Sensor SHALL record it as before and SHALL NOT disarm the Receiver driver.
5. THE sequence numbers SHALL stay strictly increasing and unique across both drivers and across mode changes.

### R5 Heartbeat
**User story:** As a Home Watch user, I want to know when my station went quiet.
1. WHILE the Station service runs and the phone is armed, THE Sensor SHALL write an `ARMED` state event every heartbeat interval.
2. THE heartbeat interval SHALL be at most a third of the 30-minute silence limit used by Home Watch, so that at least two heartbeats can be missed before "Station offline" is shown.
3. WHILE Station mode is enabled, THE Uploader SHALL upload state events at least once per heartbeat interval, overriding the normal maximum wait of `event-ingest` R9.2, and the Worker SHALL treat the heartbeat as a state event that refreshes last-seen time.
4. THE worst-case time from a station going silent to the server noticing SHALL be below the 30-minute limit used by Home Watch.
5. WHILE the phone is not on a detection plug, THE Sensor SHALL NOT write heartbeats as `ARMED`.

### R6 Resilience
1. IF the system kills the Station service, THEN THE Sensor SHALL ask Android to restart it and SHALL record a `DISARMED` gap with reason `PROCESS_DEATH` as in `sensor-android` R5.3.
2. WHEN Station mode is enabled, THE app SHALL check the battery-exemption state and, IF it is missing, SHALL show the exact per-maker steps from the `oem-battery-guide` skill content before finishing.
3. THE Sensor SHALL record Station mode in each charge session record so armed time can be reported per mode.
4. WHEN Android calls a service timeout callback for the service, THE Sensor SHALL restart the service and record `FGS_TIMEOUT`.

### R7 Charging guidance
1. WHEN Station mode is enabled and the phone is not on a detection plug, THE app SHALL tell the user to plug it into a wall charger.
2. THE app SHALL tell the user that USB from a computer and wireless charging are not used for detection.
3. THE app SHALL say in plain words that the station uses a small notification and little battery power. Claims about battery use SHALL come from measured diagnostics, not guesses.

### R8 Role for Home Watch
1. THE Sensor SHALL expose a `stationMode` flag in diagnostics, and the Uploader SHALL NOT add any field to events for it.
2. THE Home Watch spec SHALL own QR pairing. This spec SHALL NOT store pairing data.

### R9 Platform restrictions
1. THE Sensor SHALL NOT start the Station service from the background except from the boot receiver or other cases Android's background-start rules allow.
2. IF Android rejects a foreground-service start, THEN THE Sensor SHALL follow R1.4 and SHALL NOT retry in a tight loop.
3. THE Station service SHALL NOT hold a wake lock for the whole time it runs unless a probe shows the receivers miss broadcasts without it.

### R10 Privacy and permissions
1. THE Station service SHALL NOT use the microphone, accelerometer or location.
2. THE Sensor SHALL request only the foreground-service permissions, the special-use permission, boot-completed and (Android 13+) notification permission.
3. WHEN delete-my-data is requested, THE Sensor SHALL stop the Station service and clear Station mode state.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Kiro's Analyze Requirements runs in the IDE; run it on this file and record the result here.

| # | Gap found | Fix |
|---|---|---|
| G1 | A full spare phone cannot show a power cut under the sensor rule for 95% and above. | R3.2, ADR 0004. |
| G2 | Two drivers could emit duplicate UNPLUG or REPLUG. | R4.2, R4.3, R4.5. |
| G3 | Home Watch needs "station offline after 30 min" but nothing says how the server knows. | R5. |
| G4 | Android 15 limits some foreground-service types and boot-launched services. | R2.1, R9. |
| G5 | Notification permission on Android 13+ may be denied. | R2.4. |
| G6 | A broadcast might arrive before the plug state updates. | R3.6. |
| G7 | Switching modes could break sequence numbers or emit false events. | R4.5, R1.2. |
| G8 | Battery-use claims could be invented. | R7.3. |
| G9 | Pairing data would duplicate Home Watch. | R8.2. |
| G10 | The ingest 15-minute wait for state events could make a heartbeat arrive too late for the 30-minute offline rule. | R5.3, R5.4. |

## Decisions (2026-11-14)

- Station mode adds a Receiver driver and keeps the Job driver as backup (ADR 0004).
- `UNPLUG` at 95% or more is allowed only from the Receiver driver, since the plug state is observed and not inferred.
- Heartbeat interval starts at 600,000 ms (10 minutes), a tunable that satisfies R5.2.
- Events gain an optional `source` field (`RECEIVER` or `JOB`). This amends the `sensor-android` data model and the `event-ingest` wire format; the amendments are tasks 1 of this spec.
- No new dependency. Receivers and service use the Android platform APIs only.
