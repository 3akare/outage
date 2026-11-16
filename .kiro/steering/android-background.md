---
inclusion: fileMatch
fileMatchPattern: ["android/outage/**", "android/probe/**"]
---

# Android background design

Verify every API with a docs MCP server before use, and put the doc URL in a comment.

## Sensor design (JobScheduler)
- WHILE charging, keep a JobScheduler job with `setRequiresCharging(true)` scheduled or running. The job stopping is the signal.
- On job stop, FIRST record: stop reason (`JobParameters.getStopReason()`, Android 12+ / API 31), monotonic time, battery %, plug type. Only then reschedule.
- Stop reason = charging constraint: emit `UNPLUG`, unless plugged at >= 95% battery, which is `BATTERY_FULL`.
- Job starts while charging after an `UNPLUG`: emit `REPLUG` with the scheduling delay.
- Any other stop reason: reschedule immediately and log a `DISARMED` gap.
- Ignore USB-from-computer and wireless charging for detection; keep them in telemetry.
- Android < 12: infer the cause and mark the event lower confidence.
- Must work with the app closed and the screen locked, with no permanent notification. Station mode MAY use a foreground service.

## Standby buckets and OEM killers
- App standby bucket can delay jobs. Log the bucket with telemetry.
- OEM killers (Tecno, Infinix, itel, Samsung, Xiaomi) need user battery exemption. Onboarding shows exact steps per maker (see the `oem-battery-guide` skill).
- Fallback if armed time stays under 50% after exemption: Station mode foreground service.

## Alarm and notification rules
- Light Alarm uses a high-priority notification on an alarm-sound channel. It must ring offline.
- Android 14+ restricts exact alarms for sideloaded apps. Verify on a real device before relying on it.
- Respect quiet hours except an armed Light Alarm.
