# ADR 0013: Feasibility gate (Milestone 1)

Status: ACCEPTED (2026-11-23). The human waived the gate on 2026-11-23 (see Result). The gate amendment below was accepted on 2026-11-14.

## Context
The brief's gate: armed at least 90% on one phone, plug-in to job-start p95 at most 60 s, and Tecno or Infinix works after the battery exemption. The kill criterion is armed below 50% on every phone. The human has one phone, a Samsung. No other testers are available, and grid power is not under the human's control, so a planned 12-hour charging run is not possible.

## Decision (gate amendment, human, 2026-11-14)
1. **Maker check:** "Tecno or Infinix works after battery exemption" becomes "a Samsung, Tecno or Infinix phone works after its battery exemption". Samsung is among the makers best known for stopping background apps, so it tests the same risk, but not the same software.
2. **12 hours in total:** the 12 hours of charging may be collected over several days of normal use, under one condition label. The analysis already adds charging time per condition (`tools/probe/analyze`, test "PR5 amended gate").
3. **Plug-in delay:** the 20 plug-ins may come from the Samsung's normal use plus a scripted emulator run in GitHub Actions, which fakes the charger with `dumpsys battery`. The pooled p95 is the gate. The worst single device is printed next to it.
4. **Everyday mode** for the Samsung: install, apply the battery setting, `Start`, then use the phone normally and export whenever convenient (`docs/probe-checklist.md`).

## Alternatives
1. **Keep the brief's gate.** It cannot be met with the hardware and testers available, so the project would stall.
2. **Skip the probe and build the app.** That leaves the sensor's main risk with no measurement at all.
3. **Emulator only.** This needs no effort from the human, but an emulator has no maker battery manager, and that is the risk that matters most.

## Consequences
- **Open risk:** Tecno and Infinix (Transsion) are untested. Their battery managers differ from Samsung's. The first field-test user with one of these phones must run the same check before any claim about them. `oem-guide.json` keeps `verified: []` for them.
- **Open risk:** a planned continuous 12-hour run never happens. Time-dependent stops that appear only after many hours of continuous charging may be under-sampled if the Samsung's charging sessions are short.
- **Limit of the emulator:** emulator numbers are stock Android. They show whether the job reacts to charger changes and how long that takes, not what a phone maker adds.
- **Before/after comparison:** M4 has no "before" run on the Samsung if the exemption is applied from the start. The analysis reports the exempt and not-exempt time separately, in case both occur.

## Interim findings (emulator, not the gate result)
From run 43611121113 (`docs/probe/2026-11-14-emu-api35.md`, Android 15 emulator, 94 minutes):
1. **Unplug is seen at once once armed.** 6 of 6 job stops came about 0.4 s after the emulated unplug, before the app received the power-disconnected broadcast. Stop reason `CONSTRAINT_CHARGING` each time.
2. **Arming after plug-in is slow.** After a plug-in the charging-constraint job started about 992 s (16.5 min) later, in both long charges (at 70% and 80%). In the earlier short run it started about 985 s after the first plug-in. `dumpsys jobscheduler` showed "Power connected: true, Battery charging: false" during that wait. Short charges of 40 s almost never armed the job (0 of 10 at 55%, 3 of 10 at 92%). The battery exemption did not change the delay.
3. **Not confirmed:** whether a real phone has the same delay. The emulator reports no charging current, and the system may use a timer instead. The cause is not taken from documentation. The Samsung run (everyday mode) answers it.
4. **M8:** an expedited job with the charging constraint is refused (`IllegalArgumentException`), as documented.
5. **M9:** alarm audio started 27 ms after the job start, with the app in the background and the screen off (emulator, no audio device).
6. **Reference receivers** (Station mode's mechanism) logged every plug change within a second.

If the Samsung shows the same 16-minute arming delay, a cut that comes soon after a plug-in is invisible to the job sensor. Station mode's receivers would then be the main sensor rather than the backup, which changes ADR 0001 and ADR 0004. That is a decision for the human, with options, in task 9.

## Result
**Gate waived by the human on 2026-11-23.** No more probe runs and no Tecno or Infinix test. The build goes ahead. This is a decision, not a pass: the 90% armed-time number was not met.

Numbers from the two Samsung runs (`docs/probe/2026-11-15-samsung-b.md` and the earlier run 1):
- **Job sensor, run 1:** armed 17.7% over 9.43 h of charging.
- **Job sensor, run 2 (probe-v0.0.2, restart backoff fixed):** armed 73.6% over 8.28 h. The job saw 5 of 5 unplugs while armed, 0.3 to 6.5 s after the cut. But it started only 22 to 32 minutes after plug-in, and 0 of 19 plug-ins armed within 10 minutes.
- **Receiver sensor (foreground service):** saw every plug change within about 1 s.

Decision: the foreground-service receiver is the primary sensor for every user. The job is the backup. ADR 0032 records the spec changes.

Residual risk, in plain words: Tecno and Infinix phones are untested, and no phone has run for a full 12 hours in one go. Their battery managers may kill the foreground service. The first field-test user on one of these phones must report armed time, and the daily field report will show it. `oem-guide.json` keeps `verified: []` for them. Nothing may claim these phones work.
