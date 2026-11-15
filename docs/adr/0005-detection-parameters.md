# ADR 0005: Detection parameters the brief left open

Status: ACCEPTED as starting values (2026-11-14) by delegation, confirmed by the human the same day ("cautious for now, adjust later with real data"). Any change later needs the human.

## Context
Part G of the brief fixes W = 90 s, the Possible and Confirmed rules, the weight cut of 0.5, the 12 h unknown end and the 10 min push age. It leaves undefined: the weight formula, the prior baseline, how the EMA works, the restore-delay prior, the stale-armed period, and how P8 meets an hour-of-day baseline. The engine cannot be written or tested until they have values.

## Decisions

| Parameter | Value | Reasoning |
|---|---|---|
| Weight | `w = u0 / (u0 + u)`, `u0 = 8`, `u` = isolated unplugs in the last 24 h (ending one window earlier) | Noisy means more than 8 isolated unplugs in a day. A phone unplugged and replugged for normal use does a few; 8 is a clear outlier. `w < 0.5` exactly when `u > 8`. |
| Prior lambda | 1 unplug per 1,800 s per armed sensor (2 per hour), flat across hours | Conservative: far above a real average, so early confirmations need more drops. |
| Prior pseudo-exposure | 36,000 sensor-seconds (10 sensor-hours) | One phone's first day moves lambda by little. |
| EMA form | decayed counts and exposure, decay 0.9 per day | A rate EMA must weight by exposure, or a quiet hour with one sensor distorts it. |
| Restore p95 prior | 60,000 ms, used until 20 samples exist | Equals the milestone-1 gate (p95 <= 60 s). |
| Stale-armed period | 7 days | Matches the ingest age limit. Stale phones inflate n, which is the safe direction. |
| Horizon | 7 days + 12 h | Nothing older can change a decision. |
| `BATTERY_FULL` | not a drop | Brief, Part F. |
| Confidence LOW | counts equal to HIGH; shown in explanations | From `sensor-android` OQ1. Revisit with field data. |
| Confirmed also needs n >= 3 armed | yes | P11. With implicit n this makes sparse scopes fall back to the parent cell. |

### Effect of the prior (computed)
Minimum drops k for a window of 90 s, from the formula in `detection.md`:

| n armed | mu (prior 2/h) | min k Possible | min k Confirmed |
|---|---|---|---|
| 3 | 0.15 | 2 | 3 |
| 5 | 0.25 | 2 | 4 |
| 10 | 0.50 | 3 | 5 |
| 20 | 1.00 | 4 | 6 |
| 30 | 1.50 | 5 | 7 |
| 50 | 2.50 | 6 | 10 |
| 100 | 5.00 | 10 | 14 |

A true outage that drops most of the phones passes easily. The 30-phone simulation drops all 30 and needs 7.

## Alternatives
1. **Prior 1 per hour.** Confirms sooner (n=10 needs 4, n=30 needs 6) but admits more false alarms from coincident human unplugs, for example at 7 a.m. Not chosen, since the human field data does not exist yet.
2. **Prior 4 per hour.** At n=3 Confirmed is impossible, so tiny cells never alert. Too conservative for a 3-phone demo.
3. **Learn the prior from the first week only.** Needs data we do not have and makes early behavior unpredictable.
4. **Weight by label ratio instead of isolated unplugs.** Needs many labels; labels are rare.
5. **Hour-of-day baseline versus a flat baseline.** See below.

## P8 and the hour-of-day baseline
P8 says shifting all event times by a constant shifts all decisions by that constant and nothing else. A baseline that depends on the local hour of day changes behavior when events move to another hour, unless the local offset moves too. This ADR keeps P8 exactly as written and tests it with the offset shifted together with the times (`R15`). If the human prefers the plain reading (shift the times alone), the engine must use a flat baseline and lose the daily pattern. Needs a human decision before task 15 finishes.

## Consequences
- Early alerts are rare and certain. Missed outages with only a few phones are the main cost.
- `params.ts` holds every value; a field test report must list the values in use.
- The prior and `u0` should be revisited with field data, with the human approving the change and a new ADR.

## Addendum 2026-11-15: evaluation benchmark (detection-engine task 17)

### CPU budget, confirmed with the Cloudflare docs
- Workers Free: 10 ms CPU per HTTP request and per Cron Trigger ([Workers limits, CPU time](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)).
- Durable Objects: the limits table lists 30 s CPU per request by default, but the FAQ says a Durable Object has "the same per invocation CPU limits as any Workers do" and links the account plan table, where Free is 10 ms ([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/#can-i-increase-durable-objects-cpu-limit)). `limits.cpu_ms` can only be raised on Workers Paid. We plan for 10 ms per Durable Object call on the free plan, the safe reading. The design target stays 5 ms for 500 live events, which leaves half the budget for storage decoding, the area model and the response.

### Method
- Script: `packages/detection/bench/evaluate-bench.mjs`, run with `npm run bench -w packages/detection`. It is not part of `npm test`, because timings depend on the machine.
- Input: a deterministic synthetic cell. Each phone has one ARMED event, isolated UNPLUG and REPLUG pairs spread over 6 days (inside the 7.5-day horizon, so every event stays live), and one shared outage 3 hours before `nowMs`. All events are HIGH confidence; none were rejected.
- The timed call is one `evaluate()` with one new event on a state that already holds the other events, as in a Durable Object ingest. 20 warm-up calls, then 200 timed calls with `performance.now()` (wall time of a single-threaded synchronous call, so close to CPU time).
- Each size runs twice: 30 phones (the demo cell) and total / 10 phones (10 events per phone).
- Machine: sandbox VM, Intel Xeon Platinum 8259CL @ 2.50 GHz, 8 cores, Node v22.23.4. Not the CI machine, and not workerd; treat the numbers as an estimate of the order of size.

### Results (two runs agreed within about 10%; this is the first)

| live events | phones | median ms | p95 ms | max ms | decisions |
|---|---|---|---|---|---|
| 100 | 30 | 0.57 | 1.07 | 1.57 | 3 |
| 100 | 10 | 0.47 | 0.92 | 1.45 | 5 |
| 500 | 30 | 2.10 | 3.71 | 4.24 | 9 |
| 500 | 50 | 2.50 | 2.96 | 3.23 | 19 |
| 5,000 | 30 | 12.59 | 14.06 | 18.78 | 16 |
| 5,000 | 500 | 166.68 | 178.93 | 187.02 | 213 |

### Decision
- 500 live events fit the 5 ms target (p95 3.7 ms at worst). Under the rule in task 17, the full sweep stays and no incremental implementation (D1) is opened now.
- 5,000 live events do not fit the 10 ms free-plan budget. With 500 phones the sweep costs about 170 ms, because the number of windows and decisions grows with the phone count as well as with the event count. A cell would only reach that size with hundreds of phones, far beyond the field test.
- Open for the human: if field data shows a cell above about 1,000 live events, open the incremental implementation with D1 proving it equals the full sweep. The field-telemetry report should show live events per cell so this is seen early.
