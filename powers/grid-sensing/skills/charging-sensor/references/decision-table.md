# What a job stop becomes

Inputs at the moment `onStopJob` runs: `stopReason` (null below Android 12), the plug state read now, battery percent.

| stopReason | plug now | battery | Result | Confidence |
|---|---|---|---|---|
| CONSTRAINT_CHARGING | none | below 95 | UNPLUG | high |
| CONSTRAINT_CHARGING | none | 95 or more | BATTERY_FULL | high |
| CONSTRAINT_CHARGING | USB or wireless | any | DISARMED (non-detection plug) | high |
| CONSTRAINT_CHARGING | AC or dock | any | DISARMED (stop reason and plug disagree) | high |
| any other reason | any | any | DISARMED with the reason, reschedule at once | high |
| null (Android below 12) | none | below 95 | UNPLUG | low |
| null | none | 95 or more | BATTERY_FULL | low |
| null | USB or wireless | any | DISARMED (non-detection plug) | low |
| null | AC or dock | any | DISARMED (unknown cause) | low |

Rules around the table:

- Write the record first, then reschedule, then emit.
- A restart after process death or reboot records a `DISARMED` gap with reason `PROCESS_DEATH` or `REBOOT`. Time across a reboot is lost.
- When the job starts again: after an unplug it is a REPLUG; after BATTERY_FULL or a gap it is an ARMED.
- If the probe shows the plug state lags the stop callback, a short bounded re-read is a decision that delays event time. Decide it from measured data, not in advance.
- Station mode (receiver driver): plugged to unplugged is UNPLUG at any battery level. A second report of the same transition arrives in a state that no longer accepts it and emits nothing.
