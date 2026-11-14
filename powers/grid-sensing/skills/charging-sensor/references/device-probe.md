# Device probe: what to measure

A bare app with a minimal job service and a reference receiver service, logging raw facts with elapsed and wall time. Run it on every phone you have, including Tecno and Infinix, before building more.

| ID | Measurement | Why |
|---|---|---|
| M1 | Armed time divided by charging time over at least 12 hours, screen off | The approach needs it high; a common target is at least 90% |
| M2 | Plug-in to job start delay over 20 replugs: p50 and p95 | Restore detection and the alarm latency depend on it |
| M3 | Behavior at 100% while plugged: does the job stop, with which reason, do power broadcasts still arrive | The battery-full rule |
| M4 | The same phone before and after the battery exemption and the maker's autostart settings | Whether the OEM steps work |
| M5 | Job timeout frequency and the gap between stop and next start | Armed-time loss |
| M6 | Unplug to `onStopJob` delay against the receiver, and whether the plug state at the stop equals the state one second later | Detection delay, plug-state lag |
| M7 | Power broadcast delay and reliability, screen off, 30 minutes idle, at 100% | Station mode |
| M8 | Whether a job with the charging constraint can be expedited | A possible fix for timeouts |
| M9 | Whether alarm audio can start from a background service after a replug, screen off, app closed | The offline alarm |
| M10 | Time from plug-in to job start after 30 minutes idle | Doze exit on plug |
| M11 | Plug type reported for a wall charger, a computer USB port, wireless charging and a power bank | Which plugs count |
| M12 | `canUseFullScreenIntent()` on a sideloaded build, Android 14 and higher | Alarm layers |

Report nearest-rank percentiles, and say "not enough data" below 20 samples for a p95. If armed time stays below 50% on every phone even with exemption and the receiver fallback, stop and rethink the sensor.
