# ADR 0013: Feasibility gate (Milestone 1)

Status: PROPOSED (2026-11-14). The gate amendment below is ACCEPTED by the human. The result is pending (feasibility-probe tasks 8 and 9); this ADR becomes ACCEPTED when the Result section is filled.

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

## Result
Pending. To be filled in task 9 from `docs/probe/summary.md`.
