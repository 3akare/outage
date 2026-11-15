# Recorded day

`2026-11-15-samsung-probe.json` is the first real phone run (the Samsung probe, before the immediate-reschedule fix) written in the shape of the Worker's admin answer, so the schedule dry run uses real numbers.

Source: `docs/probe/2026-11-15-samsung-a.json` and its analysis `docs/probe/2026-11-15-samsung-a.md`.

| Field | Value | From |
|---|---|---|
| chargingMs | 33,948,000 (9.43 h) | M1, all conditions |
| armedMs | 6,012,000 (1.67 h, 17.7%) | M1 |
| gaps | 9 gaps after a job stop, `TIMEOUT`: about 50, 61, 142, 241, 515, 986, 1963, 3989 and 12,181 s | M5 |
| stopReasons | TIMEOUT 10 | M5 |
| delay and replug-to-ring samples | none | M2 paired no plug-in with a job start |
| exemption | true | M4 |

The probe is not a field-telemetry upload. Its numbers were mapped by hand to the aggregate fields above; nothing was invented, and fields the probe did not measure are empty or zero. It holds no install ID, cell or model name.
