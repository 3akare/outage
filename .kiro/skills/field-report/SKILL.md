---
name: field-report
description: Turn one day of Outage field telemetry into a Markdown report in docs/field/YYYY-MM-DD.md, with armed time, restore delay, alarm outcomes, false alarms, misses, gate status, and a Bugfix Spec for each new failure. Use for the daily 07:00 scheduled run, the /field-test command, or when asked to review a field test day, explain low armed time, or save a recorded outage as a replay fixture candidate.
compatibility: Needs Node 20+ and network access to the Worker admin endpoint. Needs the FIELD_READ_TOKEN secret in the environment; never print it.
metadata:
  project: outage
  spec: .kiro/specs/field-telemetry
  steering: .kiro/steering/field-test.md
---

# Field report

Procedure for one day of field telemetry. The numbers come from phones whose owners turned on "Share anonymous diagnostics". The report is public in the repository, so it holds no identifier of any person, phone or place.

Spec: `.kiro/specs/field-telemetry` (requirements R4 to R10). Steering: `/field-test` (`.kiro/steering/field-test.md`). Detection parameters in use: `packages/detection/src/params.ts` and ADR 0005.

## Run it

Inputs: a date (default: yesterday, UTC). Environment: `WORKER_URL`, `FIELD_READ_TOKEN`.

1. **Fetch.** `curl -fsS -H "Authorization: Bearer $FIELD_READ_TOKEN" "$WORKER_URL/v1/admin/field/$DAY" -o /tmp/field-$DAY.json`. Never echo the token or the response headers. The endpoint returns device-days and outage records with aliases (`D1`, `D2`, ...) already in place of install IDs.
   - If the fetch fails: write `docs/field/$DAY.md` with one line, "Data not fetched: <reason>", and stop. Open no Bugfix Spec for a fetch failure alone (R7.4).
2. **Generate.** If `tools/field/` exists (field-telemetry task 6), run its generator on the JSON. Otherwise compute by hand with `references/metrics.md` and fill `references/report-template.md`. Do not invent numbers: a metric with too few samples is "not enough data".
3. **Check.** `node .kiro/skills/field-report/scripts/check-report.mjs docs/field/$DAY.md`. It fails on a missing section, a missing gate line, an install ID, a cell, a coordinate, a token, a phone number, or a device that is not an alias. Fix the report, never the checker.
4. **File failures.** For each new failure signature from `references/signatures.md`:
   `node .kiro/skills/field-report/scripts/new-bugfix.mjs --signature <SIG> --date $DAY --evidence "<numbers from the report>"`
   The script creates `.kiro/specs/bugfix-YYYYMMDD-<slug>/` with `bugfix.md` (Current, Expected and Unchanged behavior in EARS, the Kiro Bugfix Spec form), a design and tasks placeholder, and updates `docs/field/failures.json`. A known signature only gets its count and last-seen date updated; no second spec is created. Link each spec in the report's "New failures" section.
5. **Fixture candidates.** List any Confirmed outage recorded by 2 or more devices, with the day and device count. Do not commit a fixture. A fixture needs the sanitizer and the phone owner's approval (`demo-mode` R6).
6. **Commit.** `docs: field report YYYY-MM-DD [spec:field-telemetry task:8]` on its own commit. Push to `main` only in git mode `main` (`.kiro/git-mode.json`).
7. **Log.** One line in `docs/kiro-log.md`: day, devices, gate result, number of new specs.

## Hard rules

- This job files documents. It never edits application code, thresholds in `params.ts`, or ADRs. A threshold change goes to the human (ADR 0005).
- No install ID, push token, H3 cell, coordinate, phone model or phone number in any file. Devices are aliases and makers are the six families plus "other".
- Say plainly when data is thin. A p95 needs at least 20 samples. An armed ratio needs at least one hour of charging.
- The milestone-1 gate and the kill criterion are stated at the top of every report, as measured, not as hoped (`references/metrics.md`).
- Never run this with real tokens in a command line that is logged. Use the environment variable.
- If the scheduled run cannot hold the secret, stop and tell the human to run `/field-test` by hand. Do not store the token in the repo.

## Reading the numbers

| Symptom | Likely cause | Where to look |
|---|---|---|
| Armed ratio low on one maker only | The phone's battery manager killed the app | `oem-battery-guide` skill, that maker's entry, `verified[]` |
| Many short `TIMEOUT` gaps, armed ratio about 0.9 | JobScheduler timeouts | ADR 0001, Station mode |
| Delay p95 above 60 s on every phone | Job start delay in Doze or standby bucket | `standby` counts in the aggregate, probe M10 |
| Alarm expected and not rung, notification denied | Alarm check list not completed | `alerts-and-light-alarm` R5.3 |
| False alarm on a day with few phones | Coincident human unplugs at the prior | ADR 0005 table, the outage explanation |
| Miss with fewer than 3 armed phones | Expected: the scope cannot confirm | Not a failure; the report notes it |

## Files

- `references/report-template.md`: the exact layout.
- `references/metrics.md`: formulas and thresholds.
- `references/signatures.md`: failure checks and signatures.
- `scripts/check-report.mjs`, `scripts/new-bugfix.mjs`, and their tests in `scripts/test/`.
