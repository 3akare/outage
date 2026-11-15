---
inclusion: manual
---

# /field-test

One day of field telemetry into a report. Reasoning: `.kiro/skills/field-report/SKILL.md`. The scheduled task (`.kiro/schedules/field-test.md`) runs these same commands. Needs Node 22.6+, `npm ci` once, and `WORKER_URL` and `FIELD_READ_TOKEN` in the environment. Never print the token.

1. `DAY=$(date -u -d yesterday +%F)`
2. `node --experimental-strip-types tools/field/bin/field-report.mjs --day "$DAY"` fetches the day, writes `docs/field/$DAY.md`, files a Bugfix Spec per new signature, updates `docs/field/failures.json`, and prints one JSON line. Offline: add `--input <file>`. No writes: `--dry-run`.
3. Read `status`. `report_written`: go on. `fetch_failed`: the file is one line "Data not fetched: <reason>"; commit it, open no spec. Anything else: nothing was filed; stop and show the line to the human.
4. `node .kiro/skills/field-report/scripts/check-report.mjs "docs/field/$DAY.md"` must print `report ok`. Fix the cause, never the checker or the text.
5. Fixture candidates are listed only. Commit no fixture (needs the sanitizer and the owner's approval).
6. Kill criterion `triggered`: say first, "stop and rethink the sensor".
7. One line in `docs/kiro-log.md`, then one commit `docs: field report $DAY [spec:field-telemetry task:8]` with the report, `failures.json`, new `bugfix-*` specs and the log. Push in git mode `main`; the scheduled task opens a pull request instead.

Rules: documents only (no code, `params.ts` or ADR edits). No location, install ID, cell, phone model or number. Devices are aliases `D1`, `D2`. A p95 needs 20 samples, an armed ratio 1 h of charging. Generator rules: `tools/field/README.md`, ADR 0017.
