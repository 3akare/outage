# tools/field

Field report generator (spec: `.kiro/specs/field-telemetry`, tasks 6 and 7). Turns one day of the Worker's admin JSON into `docs/field/YYYY-MM-DD.md`, files a Bugfix Spec for each new failure signature, and updates `docs/field/failures.json`.

- `src/`: pure TypeScript. `buildDay` is a function of the day's JSON, `docs/field/failures.json` and the list of spec folders. `renderReport` makes the Markdown. `deriveSignatures` makes the signatures. The Bugfix Spec skeleton comes from `planBugfix` in `.kiro/skills/field-report/scripts/new-bugfix.mjs`, and the report is checked with `checkReport` from `check-report.mjs` in the same folder.
- `bin/field-report.mjs`: the command. `npm run report -w tools/field -- --day 2026-11-14` (needs `WORKER_URL` and `FIELD_READ_TOKEN` in the environment), or `-- --day 2026-11-14 --input dump.json` without network. Add `--dry-run` to write nothing. It prints one JSON line.
- `test/golden/*.md`: golden reports. After a deliberate change, read the diff, then `npm run golden -w tools/field`.
- Runs on Node 22.6 or later (`--experimental-strip-types`), no build step.
