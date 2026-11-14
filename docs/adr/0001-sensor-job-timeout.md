# ADR 0001: Handling the JobScheduler execution time limit

Status: PROPOSED. Needs a human decision after the feasibility probe.

## Context
The Sensor keeps a charging-constraint job running so that its stop is the signal (see `.kiro/specs/sensor-android/design.md`). Android may stop a running job with `STOP_REASON_TIMEOUT` after about 10 minutes (longer on Android 12+ when the system is idle). Each timeout opens a short gap between stop and the next start, which lowers armed time. The milestone-1 gate needs armed time >= 90%.

## Decision (provisional)
Reschedule immediately on every non-charging stop and log each gap. Measure gap lengths in the probe. Do not change the approach until the data exists.

## Alternatives
1. **Reschedule on timeout (chosen for the probe).** Simplest. Risk: gap length is controlled by the OS.
2. **Expedited job.** May have a different time budget. Needs docs confirmation that it can carry the charging constraint. Quota limits likely.
3. **Foreground service for all users.** No timeout, but needs a persistent notification. Conflicts with R8.2 (no permanent notification). Already the planned Station mode fallback.
4. **Dynamic `ACTION_POWER_DISCONNECTED` receiver in a foreground service plus job as backup.** Lower detection latency, same notification cost.

## Consequences
- Armed time may fall short on stock Android. The probe decides.
- If gaps are short (a few seconds) and timeouts rare, option 1 passes the gate.
- If it fails, write the follow-up ADR with option 3 or 4 for Station mode, as the brief requires.
- No detection threshold changes follow from this ADR.
