---
name: charging-sensor
description: Design and review an Android sensor that detects mains power loss from the phone's charging state, using a JobScheduler job with a charging constraint whose stop is the signal. Use when building or debugging a charging-stop or unplug detector, handling job stop reasons, plug types, battery-full cases, monotonic event time, reboots and process death, a foreground-service receiver for phones that sit at 100%, or a native alarm that rings offline when power returns.
license: MIT
---

# Charging sensor (Android)

When grid power dies, every phone charging in the area stops charging in the same second. A phone can notice that without any special hardware or permission. This skill is the pattern used by the Outage project. It is a design that passes unit tests on the JVM; the device behavior listed under "Measure before you rely on it" has not been verified on real phones by this skill.

## The pattern in one page

1. Schedule one `JobScheduler` job with `setRequiresCharging(true)` and keep it **running** (`onStartJob` returns `true` and never calls `jobFinished`). Android stops it when charging stops. That stop is the signal.
2. In `onStopJob`, **first** record: the stop reason (`JobParameters.getStopReason()`, API 31 and up), a monotonic time (`SystemClock.elapsedRealtime()`), battery percent and plug type. Write it to durable storage. **Then** reschedule the job and emit events.
3. Decide with `references/decision-table.md`. Do not trust the stop reason alone: Android says it is meant for logging and diagnostics. Read the plug state at the moment of the stop and only call it an unplug when the plug is really gone.
4. A stop at 95% battery or more while still plugged is `BATTERY_FULL`, not an unplug. A stop for any other reason (timeout, standby, quota, user) is a gap: reschedule at once and record a `DISARMED` gap.
5. When the job starts again while charging after an unplug, that is the replug. Record the scheduling delay if you know when the plug-in happened.
6. Only **detection plugs** count: wall chargers (AC) and docks. USB from a computer and wireless charging are kept in telemetry only.
7. Use **elapsed time only**. Never send the phone's wall clock as event time. Store elapsed and the boot count; convert to "milliseconds since the event" when you hand events to the network layer. Events from before a reboot have lost time and must not be used for detection.
8. Assign sequence numbers inside the sensor, persisted, strictly increasing, so (install id, sequence) is an idempotency key even when the app process is dead.

## A phone that sits at 100%

A spare phone left plugged in is at 100% almost all the time. A stop at 95% or more looks like "battery full", so a real power cut is ignored. Fix: a second driver for always-on stations. A foreground service registers dynamic receivers for power connected and disconnected, reads the plug state after each broadcast, and treats plugged to unplugged as a real unplug at **any** battery level. Keep the job as a backup, and feed both into one pure state machine so duplicates collapse by state, not by a time window. Use the `specialUse` foreground service type (not `dataSync`, which Android 15 limits to 6 hours in 24).

## Alarm when power returns, offline

The alarm is driven by the replug **event**, so it needs no exact-alarm permission. Keep the whole path inside the service that sees the replug (no network, no server): play alarm audio directly with the alarm usage so it rings even if notification permission is denied, post an alarm-category notification as the visible layer, and use a full-screen intent only when `canUseFullScreenIntent()` is true (Android 14 limits it to calling and alarm apps). Expire a wake request after a day and on reboot.

## Structure that makes it testable

- A **pure Kotlin state machine** with no Android imports: input = job started, job stopped(reason), power connected, power disconnected, heartbeat, recovered after restart; facts = plug, battery percent; output = events to store and whether to reschedule. Test it with plain JUnit and seeded random sequences.
- Thin **Android adapters** around it: the job service, a battery-facts reader, a SQLite outbox, a boot receiver, a foreground service.
- Properties worth testing: the stop record is written before the reschedule is returned; an unplug is emitted only when the plug state confirms it; a stop at 95%+ never gives an unplug; a replug always follows an unplug; any other stop reschedules; non-detection plugs stay silent; sequence numbers never repeat across restarts.

## Measure before you rely on it

Documented risks that only a device can settle (see `references/device-probe.md`): jobs can be stopped after about 10 minutes (timeout gaps lower armed time); start and stop delays of tens of seconds are reported; OEM battery managers can kill the app unless the user exempts it (use the `oem-battery-guide` skill); the plug state may lag the stop callback; power broadcasts in Doze with the screen off; whether alarm audio can start from a background service on each Android version.

Never claim a behavior on a device you did not observe.

## References

- `references/decision-table.md`: what a stop becomes.
- `references/android-facts.md`: the platform facts with their documentation URLs.
- `references/device-probe.md`: the measurements that decide whether the approach is good enough.
