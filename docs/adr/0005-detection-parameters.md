# ADR 0005: Detection parameters the brief left open

Status: ACCEPTED as starting values (2026-11-14) by delegation. These are detection thresholds, so the human should review them before the field test. Any change later needs the human.

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
