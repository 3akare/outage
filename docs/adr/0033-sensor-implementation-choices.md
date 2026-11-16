# ADR 0033: Sensor implementation choices

Status: ACCEPTED (2026-11-23), under the blanket approval (2026-11-15). Builds on ADR 0032.

## Context
The human asked for the sensor to be built now, with no more device tests. Building `sensor-android`, `station-mode` and `event-ingest` task 10 needed several choices the specs leave open or that ADR 0032 changed.

## Decision
1. **One state machine, explicit state.** `SensorStateMachine.step(state, input, facts, now, receiverActive)` is a pure function. The state (`phase`, pending drop time) is saved in the store's `state` rows after every step, so a pending drop survives process death.
2. **Job stops while the receiver runs are not gaps.** When the receiver service is registered, a job stop for `TIMEOUT`, `QUOTA` and the like emits nothing: the receiver still watches. A charging stop with the plug off still gives `UNPLUG` from the job, which covers a missed broadcast.
3. **`BATTERY_FULL` keeps the sensor armed** in telemetry, because the receiver sees an unplug at 100% (station-mode R3.2).
4. **Telemetry is computed from the event log.** Charge sessions, armed intervals and gaps are derived from the stored events of the current boot. There are no separate session tables, so there is one source of truth and no `mode` column. Gaps across a reboot are counted from the `REBOOT` event.
5. **`source` stays on the phone for now.** `SensorEvent.source` is in `packages/shared/src/sensor.ts` and in the Kotlin event, but it is not sent on the ingest wire. Adding it to the strict allow-list first needs a Worker deploy, or the live Worker would reject every event with `UNKNOWN_FIELD`. Station-mode task 1 adds it to the wire later.
6. **Recovery on process start.** A new process that finds a non-idle saved state records `DISARMED` with `PROCESS_DEATH` (same boot) or `REBOOT` (boot count changed), then re-arms if the phone is on wall power. A pending drop survives process death; a plug-in seen only on recovery gives `REPLUG` with `LOW` confidence and no delay.
7. **Starting.** The sensor starts after first run and on every app resume once set up, because a foreground service may start only from a visible app or from `BOOT_COMPLETED`. A background start that Android refuses is recorded as `FGS_START_BLOCKED` and the job keeps watching. Opening the app turns a sensor stopped from the notification back on.
8. **No cell, no upload.** Events wait in the sensor (7-day retention) until the user has picked a spot. The cell is added by the Uploader adapter (`net/SensorOutbox.kt`), never by the sensor.
9. **Registration on first upload.** `POST /v1/register` runs once when the uploader first runs with an empty credential store. Credentials are kept until the server confirms delete-my-data, so a failed server delete can be retried at the next start.
10. **Heartbeat** is a 10-minute `Handler` timer inside the service (station-mode decision 5). No wake lock (station-mode R9.3).

## Alternatives
1. **Separate session tables (design section 7).** More code and two sources of truth. Rejected for the simplest design.
2. **Send `source` now.** Breaks ingest against the deployed Worker. Rejected until the wire schema change ships.
3. **Treat every job stop as a gap.** Would drop armed time to the probe's job-only numbers even with the receiver running. Rejected.

## Consequences
- Armed ratio reflects the receiver path. A phone whose service is killed shows `PROCESS_DEATH` gaps and receiver diagnostics.
- Field reports cannot compare restore delay by driver until `source` reaches the wire.
- No device test was run for this build (human decision). Tecno and Infinix behaviour is unknown.
