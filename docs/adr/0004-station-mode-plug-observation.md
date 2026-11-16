# ADR 0004: Station mode observes the plug state directly

Status: ACCEPTED (2026-11-14). Confirm with probe data.

## Context
`sensor-android` classifies a charging-constraint stop at 95% battery or more as `BATTERY_FULL`, not `UNPLUG`. The reason: a full phone can drop the charging constraint while still plugged in. That rule is correct for the Job driver, which only sees the job stop and infers the cause.

A spare phone left plugged in at home sits at 100% almost all the time. With the Job driver alone, a real power cut on that phone looks like `BATTERY_FULL` and is ignored. The "spare-phone stations charge 24/7" part of the pitch would produce no outage signals.

## Decision
In Station mode, a receiver driver watches the power-connected and power-disconnected broadcasts and reads the plug state. A confirmed change from a detection plug to no plug emits `UNPLUG` at any battery level. The Job driver stays as a backup, and the state machine drops duplicate reports.

## Alternatives
1. **Keep only the Job driver.** Simplest. Fails on a full phone. Rejected.
2. **Remove the 95% rule everywhere.** Would create false `UNPLUG` events on normal phones when the job stops at full battery while still plugged. Rejected.
3. **Poll the battery intent on a timer.** No broadcast dependency, but delays detection and wastes battery. Rejected.
4. **Receiver driver only in Station mode, Job as backup (chosen).** Direct observation where it is needed, no change for normal mode.

## Consequences
- In normal mode, a phone at 100% still cannot detect outages. The app should say so and recommend Station mode for spare phones.
- This is a sensor classification change, not a detection threshold change. Detection thresholds (W, k, p, weight) are untouched.
- The probe must show that power broadcasts arrive reliably in Doze with the screen off, and that the plug state matches at broadcast time. If not, add a bounded re-read through a new ADR.
- Events gain a `source` field so the field test can compare restore delay by driver.

## Addendum: receiver-driven arming is promoted to the primary observer (2026-11-16, probe run 2)

### Why
The second Samsung probe run (`docs/probe/2026-11-15-samsung-b.md`, probe v0.0.2) confirmed what the emulator (ADR 0013) and run 1 (`docs/probe/2026-11-15-samsung-a.md`) suggested: a JobScheduler charging-constraint job takes about 22 to 32 minutes to start after a plug-in on a mainstream Samsung, **even with battery-exemption on**, and a burst of ~20 quick replugs armed no job at all. With the backoff bug fixed, armed time still only reached 73.6% (< 90% gate), and the plug-in to job-start p95 fails the 60 s M2 gate by a wide margin. In the same run the reference foreground-service receiver (the mechanism in this ADR) saw every plug change within about 1 s.

The original ADR scoped the receiver driver to Station mode only, with the Job driver as the everyday-mode sensor. Run 2 shows the Job driver is too slow to arm to be the everyday-mode sensor on this class of phone.

### Decision
Make **receiver-driven observation the primary path for detecting unplug and replug in the real app**, not a Station-mode-only addition. The Job driver (sensor-android) stays as a backup and corroborator; the state machine already drops duplicate reports. The detection thresholds (W, k, p, weight) are untouched; this is a sensor-classification/arming change, consistent with the original decision.

### Verified platform facts (Context7, 2026-11-16)
- `ACTION_POWER_CONNECTED` and `ACTION_POWER_DISCONNECTED` are on the list of implicit broadcasts a manifest-declared receiver may still register for on Android 8+ (the Android 8 background-execution limits exempt them), and such a receiver wakes the app even when it is not running: https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions and https://developer.android.com/training/monitoring-device-state/battery-monitoring . The same docs advise against routine power-connection listeners for battery reasons, so the cost must be justified by the product need (detection latency).
- A charging-constraint job is deferrable by design and will not run if the battery drains despite a power connection: https://developer.android.com/reference/android/app/job/JobInfo.Builder#setRequiresCharging(boolean) . An expedited job may only set network, storage-not-low and persistence constraints, so it cannot carry the charging constraint, and even expedited jobs may be deferred under load: https://developer.android.com/reference/android/app/job/JobInfo.Builder#setExpedited(boolean) .
- A foreground service that observes power continuously uses the `specialUse` type (no runtime time limit), declared with `FOREGROUND_SERVICE_SPECIAL_USE` and a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`: https://developer.android.com/develop/background-work/services/fgs/service-types . `dataSync` and `mediaProcessing` services are capped at 6 h / 24 h on Android 15 and are unsuitable for 24/7 observation: https://developer.android.com/develop/background-work/services/fgs/timeout .

### This is a real-app design decision, not a probe change
No probe v0.0.3 is produced by this task. The receiver mechanism is already demonstrated by the reference foreground-service logger in both Samsung runs (every plug change within ~1 s), so there is nothing more for the probe to prove about the foreground-service receiver path. The design work lands in the `sensor-android` and `station-mode` specs (both already model a `Source` and receiver inputs): a follow-up task must make the receiver the primary arming path rather than a Station-mode-only driver.

One sub-question is genuinely unmeasured: whether a **normal-mode static manifest receiver** (no foreground service, so no persistent notification, honouring sensor-android R8.2) wakes and arms as promptly as the foreground receiver, and survives Doze with the screen off over long idle periods. The reference logger is a foreground service, so this run does not answer it. Measuring it needs a probe build that logs a distinct event source and a matching change in the shared analysis contract (`tools/probe/analyze` + `packages/shared`), which are outside the sensor-engineer scope; adding a second source of `PLUG` rows under the existing `RECEIVER` source would corrupt the analyzer's M6/M7/M11 counts. So that measurement is handed off as a coordinated future probe. Until it is run, the safe default for a phone where the job fails the gate is Station mode (this ADR's foreground-service receiver).

### Consequences
- Everyday-mode detection no longer depends on the slow job. Phones like this Samsung can detect unplug/replug promptly through the receiver.
- The normal-mode-vs-Station-mode choice for the receiver (static manifest receiver, or default to a foreground service) is left to the follow-up spec task and the static-receiver probe above.
- Battery: a persistent foreground service has an ongoing cost; the app must say so plainly (station-mode R7.3) and base any battery claim on measured diagnostics, not guesses.
- ADR 0001's immediate-reschedule fix stays; the job remains as the backup driver.
