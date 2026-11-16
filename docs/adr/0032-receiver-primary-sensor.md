# ADR 0032: The foreground-service receiver is the primary sensor

Status: ACCEPTED (2026-11-23), under the blanket approval and the human's waiver of the feasibility gate (ADR 0013).

## Context
Probe run 2 on a Samsung (`docs/probe/2026-11-15-samsung-b.md`): the job sensor reached 73.6% armed time. It starts 22 to 32 minutes after plug-in, so a cut soon after plugging in is invisible to it. Reference receivers inside a foreground service saw every plug change within about 1 s. ADR 0001 and ADR 0004 already say the receiver should become primary. The human then waived the gate and told us to build.

## Decision
1. **Receiver first, for everyone.** The Sensor runs a foreground service that listens for power connected and power disconnected. This is the main way a plug-in arms and an unplug is seen. It is no longer a "Station mode" for spare phones only. It is how the sensor works on every phone, started when the user finishes first run.
2. **Job is the backup.** The JobScheduler job with the charging constraint stays. It catches an unplug if the service was killed, and it records which source saw each event. It is not the one that arms.
3. **Both drivers feed one state machine.** An unplug seen by both is one event. The `source` field (`RECEIVER` or `JOB`) is part of the event, and charge sessions carry a `mode`. Both are in `packages/shared`. No location or new personal data is added, so privacy rules are unchanged.
4. **Station mode spec shrinks.** Its work is merged into the sensor: the state machine inputs, the service, the manifest, boot restore and heartbeat. What stays specific to Station mode is the spare-phone role for Home Watch (heartbeat at 100% battery, `Full -> Dropped` rule).
5. **Notification.** Android requires a visible notification for a foreground service. The text says plainly that Outage is watching for power cuts. If the user hides it, diagnostics record `NOTIFICATION_HIDDEN`.
6. **Work order.** `sensor-android` tasks 1 to 6 first (shared types, pure core, outbox, telemetry), then the service and receivers, then the job backup, then delete-my-data.

## Alternatives
1. **Keep the job primary.** Measured at 73.6% armed, below the gate, and the cause is the system's own delay. Rejected.
2. **Receiver only, drop the job.** Simpler, but nothing watches if the system kills the service. Rejected, the job is cheap.
3. **Run another probe first.** The human waived this.

## Consequences
- Battery use is higher than a job-only design, and the permanent notification is visible. Onboarding must say so.
- Tecno and Infinix are untested. If their battery managers kill the service, armed time drops there. The field report shows armed time per maker.
- Foreground service rules on Android 14 and later (service type, start from background) must be checked against the docs in each task.
