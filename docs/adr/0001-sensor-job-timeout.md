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

## Measured facts, run 1 (Samsung `samsung-a`, probe v0.0.1, 2026-11-15)

Detail: `docs/probe/2026-11-15-samsung-a.md`. Measured-facts addendum only; no threshold changes.

- **Armed time 17.7%** over 9.43 h of charging, below the 90% gate and the 50% kill line. All 10 stops were `STOP_REASON_TIMEOUT` after ~600 s (https://developer.android.com/reference/android/app/job/JobScheduler).
- **Bug:** returning `true` from `onStopJob` applied the default exponential backoff (30 s doubling, https://developer.android.com/reference/android/app/job/JobInfo.Builder#setBackoffCriteria). Gaps grew from ~50 s to ~3989 s, so the last ~3.7 h were unarmed. Fix: return `false` and schedule a fresh job (`RestartPolicy`, JVM unit test).
- **Arming after plug-in is slow:** 0 of 5 plug-ins armed within 10 minutes; the two that armed took ~28 and ~17 min.
- **Expedited job plus charging constraint is refused** (`IllegalArgumentException`), so alternative 2 is not viable.

## Measured facts, run 2 (Samsung `samsung-b`, probe v0.0.2, 2026-11-15/16)

Detail: `docs/probe/2026-11-15-samsung-b.md`. Measured-facts addendum only; no threshold changes.

- **Backoff fix confirmed:** restart gaps p50 29 ms, p95 239 ms, max 11.1 s over 30 reschedules. Option 1 stays.
- **Armed time 73.6%** over 8.28 h (exemption on). Above the 50% kill line, below the 90% gate. Under 12 h, so the formal gate is INCOMPLETE.
- **Dominant loss is arming delay:** 0 of 19 plug-ins armed within 10 minutes; four that armed took ~26, ~23, ~22 and ~32 min; a ~20-replug burst armed nothing. The charging-constraint job is deferrable (https://developer.android.com/reference/android/app/job/JobInfo.Builder#setRequiresCharging(boolean)).
- **Once armed, detection is prompt:** 5 of 5 unplugs seen in 0.3 to 6.5 s.
- **Receiver path is reliable:** the foreground-service logger saw every plug change within ~1 s; 0 of 35 stop-time re-reads differed.

## Consequence for the options (after run 2)

- Option 1 (immediate reschedule) is correct but not sufficient: the ~22 to ~32 min arming delay keeps armed time at 73.6% (< 90%) and fails the 60 s M2 gate.
- This selects option 4 (see ADR 0004 addendum, 2026-11-16): **receiver-driven arming becomes the primary observer; the Job driver stays as backup and corroborator.** No probe v0.0.3 is built. The unmeasured normal-mode static manifest receiver is a future probe (needs a shared analyze-contract change).
- The formal gate verdict (ADR 0013 Result) stays for the human in feasibility-probe task 9, which stays unticked (gate not met).
