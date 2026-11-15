# ADR 0011: Field telemetry data and the scheduled run

Status: ACCEPTED 2026-11-15, under the human's blanket approval. The stored data is as listed below; delete-my-data covers it.

## Context
The field test needs armed time, delays, alarm outcomes and label-based false alarms and misses. The scheduled job must read them from the server. The privacy rules say to ask before changing what is stored.

## Data stored (new)
- **Device-day aggregate**, per opted-in install: local date, maker family, Android major version, mode shares, counters and capped number lists (see design section 3). No location, no cell, no timestamps within the day, no model name. Kept 90 days. Removed by delete-my-data.
- **Outage records** (counts only): scope class, start, end, level, drops, armed count, label counts. No install IDs, no cell. Kept 90 days.

## Decisions
1. Telemetry is opt-in, off in public builds and on in field-test builds.
2. The report names devices as aliases created per request. The alias map is not stored.
3. A read token (`FIELD_READ_TOKEN`) protects the admin endpoint. The scheduled job holds it as a secret.
4. The scheduled job only writes reports and files Bugfix Specs. It does not change code and does not commit fixtures.

## Alternatives
1. **No server telemetry; export from phones by hand.** Safest. Not realistic for daily reports from several phones.
2. **Send raw events to the report.** More detail, but holds cells and install IDs in files in a public repo. Rejected.
3. **Third-party analytics.** Adds a service and viewer leakage. Rejected.
4. **Make the endpoint public.** No secret handling, but aggregates become public. Possible later with a human decision, since the data has no identifiers.

## Consequences
- The server learns per-phone daily numbers keyed by an anonymous install ID. An attacker with the database could see which anonymous installs are Tecno phones on Android 13 with poor armed time. No location or contact data.
- If the Kiro schedule cannot hold a secret, the human runs `/field-test` and the process is the same.
- The 8 KiB cap and one row per device-day keep the free-tier cost near zero.

## Addendum 2026-11-15 (task 5, no new stored fields)
- The admin answer also lists "silent" devices: installs whose newest device-day in the last 7 days is before the requested day. It carries alias, maker, Android major and that last date, all already stored. It lets the report raise `UPLOAD_GAP` without storing anything new.
- Outage records are listed by the UTC day they started; misses by the UTC day of the unplug.
- Upload rate limit: 6 per install per hour, kept in Worker isolate memory only.
