# ADR 0001: Handling the JobScheduler execution time limit

Status: ACCEPTED for the feasibility probe only (2026-11-14). Measured facts from the first Samsung run added 2026-11-15 (see below); the gate decision and any threshold change stay for the human in feasibility-probe task 9. Re-evaluate against the milestone-1 gate with the rerun data.

## Context
The Sensor keeps a charging-constraint job running so that its stop is the signal (see `.kiro/specs/sensor-android/design.md`). Android may stop a running job with `STOP_REASON_TIMEOUT` after about 10 minutes (longer on Android 12+ when the system is idle). Each timeout opens a short gap between stop and the next start, which lowers armed time. The milestone-1 gate needs armed time >= 90%.

## Decision
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

## Measured facts (Samsung, everyday mode, 2026-11-15)

First real-phone data: one Samsung (alias `samsung-a`), Android 15 (SDK 35), battery-exemption on, standby bucket exempted. Export `docs/probe/2026-11-15-samsung-a.json`, analysis `docs/probe/2026-11-15-samsung-a.md` (numbers from `tools/probe/analyze`). This is a measured-facts addendum only (feasibility-probe task 9 rule); it does not change the decision or any threshold.

- **Armed time 17.7%** over 9.43 h of charging (not yet the 12 h a formal verdict needs), far below the 90% gate and below the 50% kill line.
- **Every stop was `STOP_REASON_TIMEOUT`** (10 of 10) after ~600 s, i.e. the ~10-minute job execution limit (https://developer.android.com/reference/android/app/job/JobScheduler).
- **The probe returned `true` from `onStopJob`**, which reschedules with the job's backoff policy. The default is 30 s **exponential** (`retry = stopTime + 30000 * 2^(n-1)`, https://developer.android.com/reference/android/app/job/JobInfo.Builder#setBackoffCriteria , https://developer.android.com/reference/android/app/job/JobInfo#BACKOFF_POLICY_EXPONENTIAL). Measured restart gaps: ~50, 61, 142, 241, 515, 986, 1963, 3989 s, each about double the last. Once the gap passed ~1 h, later charge sessions saw no job before power ended, so the last ~3.7 h of charging were unarmed. This directly contradicts this ADR's "reschedule immediately on every non-charging stop".
- **Fix applied** (branch `work/probe-immediate-reschedule`): `onStopJob` now returns `false` and the probe schedules a fresh job itself, so no OS backoff accrues (option 1 as originally intended). The decision logic is isolated in `RestartPolicy` with a JVM unit test. This is still a probe-only change; it must be re-measured on a rerun before the gate is judged.
- **Arming after plug-in is slow**, independent of the backoff bug: 0 of 5 plug-ins armed a job within 10 minutes; the two that eventually armed took ~28 min and ~17 min. This matches the ~16-minute emulator arming delay (ADR 0013) and is the main remaining risk for the M2 p95 <= 60 s gate and for whether the job (vs Station mode, ADR 0004) can be the primary sensor. It is not fixed by this change and needs its own measurement and, if confirmed, a follow-up ADR with options for the human.
- **Expedited job + charging constraint is refused** (`IllegalArgumentException`), confirming alternative 2 is not viable (expedited jobs allow only network, storage-not-low and persistence constraints).

## Consequence for the options
- Option 1 (immediate reschedule) is now implemented correctly; the next run tests whether it alone clears the 90% gate.
- If armed time or the arming delay still fails after the rerun, the slow-arming finding points to option 3/4 (Station mode, foreground-service receiver as the primary sensor), to be decided by the human with the rerun numbers in task 9.
