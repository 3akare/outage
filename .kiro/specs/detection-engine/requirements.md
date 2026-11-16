# Requirements: detection-engine

Status: DRAFT requirements written in Kiro Web, APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). The Correctness / property-based-testing pass runs in Kiro IDE only. The human must run it there on this spec (see "IDE steps" at the end). Design in `design.md`, tasks in `tasks.md`.

## Introduction

The detection engine decides, for one evaluation scope (an H3 cell or its parent), whether power is out and when it returned. It is a pure TypeScript function in `core/detection`: no network, no storage, no wall clock. Every decision carries the numbers behind it. The engine runs in the Worker and in `tools/sim`. The phone does not run it. `tools/sim` writes `replay.json` for the app and the web page.

The algorithm and the twelve properties P1 to P12 come from the master brief, Part G, and are copied in `.kiro/steering/detection.md`. This spec makes them precise enough to implement and test. Where the brief left a quantity undefined, the choice is listed under "Decisions" and in ADR 0005.

## Glossary

- **Scope**: the set of sensors evaluated together (a cell, or a parent cell when the cell is sparse). The caller (`area-cells`) chooses it.
- **Event time**: see `event-time.md`. All engine times are event time in milliseconds.
- **Drop**: an `UNPLUG` event from an eligible install that is not labeled "No, I unplugged it".
- **Eligible install**: an install with weight >= 0.5.
- **Window W**: 90 seconds.
- **Armed**: from an `ARMED` event until that install's next `UNPLUG` or `DISARMED`.
- **k**: the number of distinct eligible installs with a drop inside a window.
- **n**: the number of eligible installs armed at the start of that window.
- **lambda**: human unplugs per armed sensor per second, for the local hour of day.
- **mu = lambda x n x W**. **p = P(X >= k)** for X Poisson with mean mu.
- **Outage**: a record with a level, a start, a status and an explanation.
- **Level**: `POSSIBLE` (silent) or `CONFIRMED` (alert). Area status adds `NORMAL`. `Restored` is a status of an outage.
- **Decision**: the creation of an outage, a level change, a restore, or an end-unknown.

## Requirements

### R1 Pure function contract
1. THE engine SHALL expose `evaluate(state, input, params) -> { state, outputs }`, where `input` has `events`, `labels`, `context` and `nowMs`.
2. THE engine SHALL NOT perform I/O, read a clock, use randomness, or mutate its arguments.
3. WHEN called twice with equal arguments, THE engine SHALL return equal results.
4. THE engine SHALL take every threshold from `params`, with defaults in one file `params.ts`.

### R2 Inputs and de-duplication
1. THE engine SHALL accept events of types `ARMED`, `DISARMED`, `UNPLUG`, `BATTERY_FULL` and `REPLUG`, each with install ID, seq, event time and confidence.
2. THE engine SHALL treat (install ID, seq) as an identity and ignore any event whose identity it already holds. Property P4.
3. THE result SHALL NOT depend on the order or the batching in which events are supplied. Property P3.
4. THE engine SHALL ignore `BATTERY_FULL` for drops and treat it as armed time continuing.
5. THE engine SHALL accept `LOW` confidence events and count them like `HIGH` ones. The `confidence` of each contributing event SHALL appear in the explanation counts.
6. IF an input event is malformed, THEN THE engine SHALL skip it and report it in `outputs.rejected` with a reason, and SHALL still process the rest.

### R3 Armed state and eligibility
1. THE engine SHALL derive each install's armed intervals from its `ARMED`, `DISARMED` and `UNPLUG` events, ordered by event time with (install ID, seq) as tie-break.
2. WHEN a `REPLUG` arrives for an install, THE engine SHALL treat that install as armed again from that time.
3. WHEN an install has produced no event for the stale-armed period, THE engine SHALL treat it as not armed after that period.
4. THE engine SHALL compute each install's weight as `u0 / (u0 + u)`, where `u` is the number of that install's isolated unplugs in the weight look-back, ending one window before the time being evaluated.
5. An unplug is isolated when it belongs to no outage of level Possible or Confirmed, or is labeled "No, I unplugged it".
6. WHEN an install's weight is below 0.5, THE engine SHALL exclude it from k and from n. Property P10.
7. A new install SHALL have weight 1.

### R4 Baseline
1. THE engine SHALL keep lambda per local hour of day (24 values) from a conservative prior.
2. THE engine SHALL update each hour's lambda by an exponential moving average of two decayed totals, human unplug count and sensor-seconds of exposure, with a decay per day.
3. THE engine SHALL count as human unplugs: isolated unplugs outside any outage, and every unplug labeled "No, I unplugged it".
4. THE engine SHALL leave out of the exposure total the time covered by an outage of level Possible or Confirmed.
5. THE lambda used for a window SHALL use only data from days before the window's local day, so no decision depends on its own data.
6. THE engine SHALL take the local-time offset from `params` and SHALL NOT read a time zone from the environment.

### R5 Window and statistic
1. THE engine SHALL evaluate a right-anchored sliding window of W = 90 s at each drop: the window is (t - W, t] for a drop at t.
2. FOR each window, THE engine SHALL compute k, n, lambda for the hour of t, mu = lambda x n x W and p = P(X >= k | Poisson mu).
3. THE engine SHALL count each install at most once in k per window.
4. THE engine SHALL compute p without catastrophic cancellation, by summing the upper tail, so that p near 1e-12 is accurate to a relative error stated in the design.
5. n SHALL count only installs armed at the start of the window. A drop from an install with no armed record SHALL count in k and SHALL NOT count in n.
6. WHEN fewer than 3 eligible installs are armed at the window start, THE engine SHALL NOT output `CONFIRMED` for the window. Property P11.

### R6 Levels
1. WHEN k >= 3 and p < 0.001, THE engine SHALL set the window level to `CONFIRMED`. Property P2.
2. WHEN k >= 2 and p < 0.05 and the level is not `CONFIRMED`, THE engine SHALL set the window level to `POSSIBLE`.
3. WHEN there is exactly one drop in a window, THE engine SHALL NOT output `POSSIBLE` or `CONFIRMED`. Property P1.
4. WHEN drops are added inside a window, THE level of that window SHALL NOT fall. Property P7.
5. THE engine SHALL NOT use `LOW` or `HIGH` confidence to change a level.

### R7 Neighbor, linked and manual hints
1. THE input `context` SHALL carry, for neighbor and linked scopes, their level and their largest k, and the count of manual reports in the window.
2. THE engine SHALL raise an outage's area level by at most one step when a hint applies, in the order Normal, Possible, Confirmed.
3. THE engine SHALL NOT raise any level to `CONFIRMED` unless some scope, this one or a hinting one, has k >= 3.
4. THE engine SHALL record each raise in the explanation, naming the hint kind.
5. THE hints SHALL NOT change the engine's own k, n, mu or p.

### R8 "Your spot only"
1. WHEN an install has a drop, the user has answered "Yes, wake me when it's back", and no outage of level Possible or Confirmed covers that drop, THE engine SHALL output a spot state `SPOT_ONLY` for that install.
2. THE `SPOT_ONLY` state SHALL end at that install's next `REPLUG`.
3. THE engine SHALL NOT use a `SPOT_ONLY` state as a drop in another install's window.

### R9 Outage lifecycle
1. WHEN a window reaches `POSSIBLE` or higher and no outage is open in the scope, THE engine SHALL open an outage whose start is the earliest drop inside that window.
2. WHILE an outage is open, THE engine SHALL attach later qualifying windows and later drops to it and SHALL NOT open another one.
3. THE outage level SHALL be the highest window level attached to it, after hints.
4. THE outage SHALL record the event time of the first drop at which each level was reached.
5. THE outage identity SHALL be derived from its earliest drop key and SHALL be stable under reordering and batching.
6. THE engine SHALL hold, per outage, the number of distinct eligible installs that dropped, as `d`.

### R10 Restore
1. THE engine SHALL set `W_r = 90 s + p95` of REPLUG scheduling delays, using delays measured before the outage start, and a documented prior when there are too few samples.
2. WHEN at least `max(2, ceil(d / 2))` distinct dropped installs have a `REPLUG` inside one span no longer than W_r, after the outage start, THE engine SHALL mark the outage `RESTORED`.
3. THE restored time SHALL be the event time of the first REPLUG in the earliest qualifying span. THE evidence time SHALL be the event time of the REPLUG that completed the quorum.
4. THE engine SHALL NOT count REPLUGs spread wider than W_r as a restore. Property P5.
5. THE engine SHALL mark an outage `RESTORED` only if it first had level `POSSIBLE` or higher. Property P6.
6. REPLUG events from installs that did not drop in this outage SHALL NOT count toward the quorum.
7. WHEN the outage is restored, THE engine SHALL close it, so that later drops can open a new outage.

### R11 Unknown end
1. IF no restore evidence exists within 12 hours of the outage start, THEN THE engine SHALL mark the outage `ENDED_UNKNOWN` once `nowMs` is past that point, with no end time.
2. THE engine SHALL NOT invent an end time.
3. THE engine SHALL accept restore evidence with event time inside the 12 hours even when it arrives after `nowMs` passed that point, and SHALL then mark the outage `RESTORED`.

### R12 Late events and pushes
1. WHEN late events arrive, THE engine SHALL recompute history and update the affected outages.
2. THE engine SHALL emit a push for a decision only if the decision's event time is no more than 10 minutes before `nowMs`. Property P12.
3. THE engine SHALL emit each push at most once per outage and decision kind, and SHALL remember emitted pushes in its state.
4. THE push list SHALL be separate from the decisions, so that suppressing a push never changes a decision.
5. A `POSSIBLE` decision SHALL NOT produce a push.

### R13 Explanations
1. EVERY outage, level change, restore and end-unknown decision SHALL carry an explanation with: k, n, number of excluded noisy installs, lambda, mu, p, W, the thresholds used, the hint raises, the counts of `HIGH` and `LOW` confidence events involved, and for restores d, the quorum, the replug count, W_r and the p95 sample count.
2. THE explanation SHALL hold counts and numbers only, never install IDs.
3. THE explanation SHALL be enough to recompute p and the level without the original events.

### R14 Simulated events
1. THE engine SHALL ignore any event or label marked `simulated`, and SHALL report only a count of them in `outputs.ignoredSimulated`. Property P9.
2. THE engine state, outages, statistics and pushes SHALL equal the result obtained without the simulated inputs.

### R15 Time shift
1. WHEN every event time, the `nowMs` value and the local-time offset are moved by the same constant, THE engine SHALL produce the same decisions with times moved by that constant and nothing else changed. Property P8.

### R16 State bounds, settling and privacy
1. THE engine SHALL keep live events for the recompute horizon (7 days plus 12 hours) and fold older settled data into compact aggregates.
2. A settled outage SHALL move to an archive record holding counts only.
3. THE engine SHALL hold per-install data only for installs with events in the live horizon.
4. THE state SHALL be serializable to JSON and partitionable by install, so a store can write only changed parts.
5. WHEN delete-my-data removes an install, THE remaining state SHALL stay valid and archive records SHALL be unchanged.
6. THE state size for 100 installs over the horizon SHALL stay below 1 MB serialized, checked by a test.

### R17 Golden fixtures
1. THE test suite SHALL replay golden fixtures of real outages recorded in the field test and compare the full decision list.
2. THE fixture format SHALL be shared with `tools/sim` and Judge mode replay.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Kiro's Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | "Weight" is used but never defined. | R3.4 to R3.7; ADR 0005 value `u0 = 8`. |
| G2 | "Conservative prior" has no number. | R4; ADR 0005 prior 1 per 1800 s. |
| G3 | "EMA" of a rate is undefined for tiny exposure. | R4.2 decays counts and exposure, which makes a tiny exposure move the prior very little. |
| G4 | Order independence (P3) conflicts with a stateful EMA. | R4.5, R1.3: baseline is a pure function of data from earlier days, recomputed on late events. |
| G5 | "n" at which instant? | R5.5: at the window start, and drops from unseen installs count only in k, which keeps P7 true. |
| G6 | Weight depends on outages, outages depend on weight. | R3.4: weight uses isolated unplugs that end one window earlier, so it is well-founded in time. |
| G7 | P8 conflicts with an hour-of-day baseline when the shift is not a multiple of 24 h. | R15 shifts the local-time offset with the times. Needs human acknowledgement; see Decisions. |
| G8 | Restore and `W_r` were circular (p95 comes from restores). | R10.1 uses only delays measured before the outage start, plus a prior. |
| G9 | Open outage vs new drops. | R9.2. |
| G10 | Late arrival after the 12 h point. | R11.3. |
| G11 | `confidence` LOW weighting (from `sensor-android` OQ1). | R2.5: counted equally, shown in the explanation. |
| G12 | "No, I unplugged it" must affect both baseline and drops. | R3.5, R4.3, and drops exclude labeled unplugs (see design 5.1). |
| G13 | Delete-my-data vs recomputed history. | R13.2, R16.2, R16.5. |
| G14 | Hints and P11 or P1 could be bypassed by manual reports. | R7.3, R7.5. |
| G15 | A real fixture format was not named. | R17. |
| G16 | Detection port in `event-ingest` only passes detection events, but the engine needs state events. | Task 1 amends ingest; design section 9. |

## Decisions (2026-11-14)

All values are starting values, held in `params.ts`, and recorded in ADR 0005 with the reasoning. Changing any of them later needs the human, per the brief.

| Parameter | Value |
|---|---|
| Window W | 90 s (from the brief) |
| Possible: k, p | k >= 2, p < 0.05 (from the brief) |
| Confirmed: k, p | k >= 3, p < 0.001 (from the brief) |
| Weight cut | 0.5 (from the brief) |
| Weight `u0` and look-back | 8 isolated unplugs, 24 h (decision) |
| Prior lambda | 1 unplug per 1,800 s per armed sensor, flat across hours (decision) |
| Prior pseudo-exposure | 36,000 sensor-seconds (decision) |
| Daily decay | 0.9 (decision) |
| Restore quorum | `max(2, ceil(d/2))` (brief) |
| `W_r` | 90 s + p95 of scheduling delays; prior p95 60 s; at least 20 samples to use measured (decision) |
| Unknown end | 12 h (brief) |
| Push max age | 10 min (brief) |
| Stale-armed period | 7 days (decision) |
| Recompute horizon | 7 days + 12 h (decision) |

Other decisions: LOW confidence counts equally (R2.5). `BATTERY_FULL` never counts as a drop. P8 is stated with the local-time offset shifted too. The Correctness pass in IDE may find counterexamples to P1 to P12; fix definitions through an ADR and keep every property.

## IDE steps for the human (Kiro IDE only)

1. Open this repo in Kiro IDE and open the `detection-engine` spec.
2. Run Analyze Requirements on `requirements.md` and paste the result under the gap table.
3. Run the Correctness feature on the spec so it generates property-based tests for P1 to P12 and D1 to D6 (design section 11). Review that each test title contains its ID.
4. Commit the IDE output on `main` and tell Kiro Web.
