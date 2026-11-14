# Metrics and gates

From `.kiro/specs/field-telemetry` (design sections 3, 5, 6). Keep this file and that spec in step.

## Definitions

| Metric | Formula | Rule |
|---|---|---|
| Armed ratio (device-day) | `armedMs / chargingMs` | Only when charging on a detection plug for at least 1 hour; otherwise "not enough data". Station and normal mode are reported separately. |
| Percentile | Nearest rank: `sorted(x)[ceil(p/100 * n) - 1]` | A p95 needs `n >= 20`; otherwise "not enough data". |
| Scheduling delay | `schedulingDelayMs` of each replug, by source `JOB` and `RECEIVER` | Report both. The gate uses the job source. |
| Replug to ring | Time from the REPLUG event to the start of the ring | p50 and p95, same sample rule. |
| Alarm rate | `rung / expected` | `expected` = Yes answers followed by a replug. Null when `expected` is 0. |
| Gap | A DISARMED span, with reason | Count, p50 and p95 length by reason. |

## Outage classes

| Class | Rule |
|---|---|
| CONFIRMED_TRUE | Confirmed, with at least one "Yes" label |
| FALSE_ALARM | Confirmed, at least one label, and every label is "No" (no unlabeled drop) |
| INCONCLUSIVE | Any other Confirmed outage |
| MISS | A "Yes" label whose unplug is covered by no Possible or Confirmed outage. Count it as a failure only when at least 3 phones were armed in the scope. |

## Gates (milestone 1, from the brief, Part I)

| Gate | Pass when |
|---|---|
| Armed time | Armed ratio at least 0.90 on at least one phone |
| Restore delay | Scheduling delay p95 at most 60 seconds (with `n >= 20`) |
| Tecno or Infinix | Armed ratio at least 0.90 on a Tecno or Infinix phone after battery exemption |

Gate status line: `met` when all three pass, `not met` when any measured gate fails, `not measurable yet` when a gate has no valid sample. Say which.

## Kill criterion

Triggered only when armed ratio is below 0.50 on every phone, even with battery exemption and Station mode. Anything less is a failure to fix, not a stop. If it is triggered, say so first in the report and tell the human in the final message: "stop and rethink the sensor".

## Sanity checks before writing

- A device-day with more than 26 hours of charging is suspect (clock change). Mark it, do not average it in.
- Do not average ratios across phones with different charging hours; report per device and the best device for the gate.
- Do not extrapolate. Three phones on one day cannot say "Tecno phones fail".
