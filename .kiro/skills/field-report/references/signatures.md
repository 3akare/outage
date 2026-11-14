# Failure signatures

A signature is `CHECK:maker:androidMajor:mode`, for example `ARMED_LOW:tecno:13:normal`. `maker` is one of tecno, infinix, itel, samsung, xiaomi, pixel, other. `mode` is `normal` or `station`. `androidMajor` is a number or `unknown`.

`docs/field/failures.json` holds the known signatures: `{ "version": 1, "failures": { "<sig>": { "firstSeen", "lastSeen", "count", "spec" } } }`. `scripts/new-bugfix.mjs` reads and writes it. A signature in the file never gets a second spec.

| Check | Raised when |
|---|---|
| `ARMED_LOW` | Armed ratio below 0.90 on a device-day with at least 1 h of charging |
| `ARMED_CRITICAL` | Armed ratio below 0.50 (also raise the kill-criterion message when it holds for every phone) |
| `DELAY_SLOW` | Scheduling delay p95 above 60 s, with `n >= 20` |
| `ALARM_MISSED` | `alarms.expected > alarms.rung` |
| `FALSE_ALARM` | At least one false alarm in the day (class rule in `metrics.md`) |
| `MISS` | A miss with at least 3 armed phones in scope |
| `WRITE_FAIL` | `writeFailures > 0` |
| `FGS_BLOCKED` | Station foreground service start was blocked (diagnostics reason `FGS_START_BLOCKED`) |
| `UPLOAD_GAP` | An opted-in device sent no aggregate for more than one day |

## What the Bugfix Spec contains

`bugfix.md` has Current Behavior (Defect), Expected Behavior (Correct), Unchanged Behavior (Regression Prevention), in the form from https://kiro.dev/docs/specs/bugfix-specs/:

- `WHEN [condition] THEN the system [incorrect behavior]`
- `WHEN [condition] THEN the system SHALL [correct behavior]`
- `WHEN [condition] THEN the system SHALL CONTINUE TO [existing behavior]`

`design.md` and `tasks.md` are placeholders. The human approves the root cause and the fix design before any task runs. The job never writes the fix.

## Choosing evidence text

Put the numbers that raised the signature: the ratio, the sample size, the number of device-days, the Android and maker. No identifiers. One or two lines.
