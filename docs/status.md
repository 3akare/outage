# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 3 Sensor build (feasibility gate waived by the human 2026-11-23, ADR 0013) and 2 Detection, in parallel
Gate: waived (ADR 0013). Residual risk: Tecno and Infinix untested, armed time to be watched in the field report
Next: sensor built (sensor-android 1-11, station-mode 2-7, event-ingest 10; ADR 0033). Left: station-mode task 1 (`source` on the wire, needs a Worker deploy), sensor-android task 12 and station-mode task 8 (README and checklist docs), event-ingest task 11, a device smoke test. Still open for the human: Cloudflare and Firebase accounts, the Kiro IDE pass (detection-engine task 15).
Active specs: sensor-android and station-mode (receiver primary, job backup, ADR 0032), app-map-insights (next: task 1 Worker /api/map.json, then task 12 emulator pass). feasibility-probe is closed by waiver.

Redesign (2026-11-22): spec `ux-redesign` and ADRs 0026 to 0028 written. Web becomes landing `/`, replica `/app`, simulation `/app/simulate`; app dock becomes Home, Insights, Settings with a one-step first run. Next: tokens (task 2), then web shell and landing (task 3).

Design (2026-11-24, ADR 0048 to 0050, spec `material-redesign`): Material 3 on both platforms from one token file, new mark, `/app/simulate` is the Android app in the browser (`/app` redirects), first run asks location (optional), Home is a full-screen map with a sheet, bar is Insights, Home, Settings. Left: device screenshots (task 7).

Layout (2026-11-24, ADR 0047): `android/outage` and `android/probe`, `web` (`api`, `landing`, `ui`, `areas`), `core/detection` and `core/shared`. Old paths in the log and older ADRs translate through ADR 0047.

## Live
- Worker deployed at https://outage-api.bakaredavid007.workers.dev (deploy-worker.yml, 2026-11-21). Android builds default to it (ADR 0024). `/area/<slug>` returns 404 until a person fills `checkedBy` in `web/areas/catalog/catalog.source.json` (W7); the phone map already shows catalog cells as NO_DATA. `FIELD_READ_TOKEN` is still unset.

## Done
- Steering (15 files), 13 specs with requirements, design and tasks, ADRs 0001 to 0012 (0012 = native Kotlin stack), hooks and tests for the hook scripts, three skills (oem-battery-guide, field-report, release-apk) with scripts and tests, three custom agents (sensor-engineer, detection-auditor, pitch-writer), MCP config (cloudflare-docs, context7 live; github disabled until a token exists), the grid-sensing Power, spec-lint. 148 tests pass with `npm test`.

## Waiting for the human
Blanket approval given 2026-11-15: agents decide and record in ADRs. Only things an agent physically cannot do remain.
- Verify the OEM battery steps on real phones (oem-battery-guide `verified[]` is empty for every maker).
- Create the Cloudflare and Firebase accounts and set their secrets (Wrangler secrets, GitHub Actions secrets, `GITHUB_MCP_TOKEN` if the github MCP server is wanted).
- Run the Kiro IDE correctness pass for detection-engine task 15.
- Trust the workspace in Kiro and open the repo as the project root, or agents, steering, skills and MCP will not load.
- Create `.kiroignore` (the agent write is denied by a permission rule; contents in `docs/kiroignore.suggested`).
