# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 1 Feasibility probe (waiting on the Samsung data) and 2 Detection, started in parallel
Gate: armed time >= 90% on one phone, restore delay p95 <= 60 s, Tecno or Infinix works after battery exemption
Next: the human reruns the probe with probe-v0.0.2 on the Samsung (and a Tecno or Infinix phone). Done by agents: field-telemetry 5 to 7, web-and-area-pages task 11, area-cells task 12, event-ingest 6, power-log 3 (tariff bands A, B, D and E unverified, see ADR 0020) and home-watch 2 and 4. Everything else waits on the probe rerun (sensor-android, station-mode, and the phone parts that depend on them), the human's Cloudflare and Firebase accounts, or the Kiro IDE pass (detection-engine task 15). ADR 0013 waits for the probe Result.
Active specs: feasibility-probe, sensor-android (blocked on probe), app-map-insights (screens built on demo data; next: task 1 Worker /api/map.json, then task 12 emulator pass)

## Live
- Worker deployed at https://outage-api.bakaredavid007.workers.dev (deploy-worker.yml, 2026-11-21). Android builds default to it (ADR 0024). `/area/<slug>` returns 404 until a person fills `checkedBy` in `workers/api/src/web/catalog/catalog.source.json` (W7); the phone map already shows catalog cells as NO_DATA. `FIELD_READ_TOKEN` is still unset.

## Done
- Steering (15 files), 13 specs with requirements, design and tasks, ADRs 0001 to 0012 (0012 = native Kotlin stack), hooks and tests for the hook scripts, three skills (oem-battery-guide, field-report, release-apk) with scripts and tests, three custom agents (sensor-engineer, detection-auditor, pitch-writer), MCP config (cloudflare-docs, context7 live; github disabled until a token exists), the grid-sensing Power, spec-lint. 148 tests pass with `npm test`.

## Waiting for the human
Blanket approval given 2026-11-15: agents decide and record in ADRs. Only things an agent physically cannot do remain.
- Run the probe on real phones: Samsung rerun with probe-v0.0.2, and a Tecno or Infinix phone (`docs/probe-checklist.md`).
- Verify the OEM battery steps on real phones (oem-battery-guide `verified[]` is empty for every maker).
- Create the Cloudflare and Firebase accounts and set their secrets (Wrangler secrets, GitHub Actions secrets, `GITHUB_MCP_TOKEN` if the github MCP server is wanted).
- Run the Kiro IDE correctness pass for detection-engine task 15.
- Trust the workspace in Kiro and open the repo as the project root, or agents, steering, skills and MCP will not load.
- Create `.kiroignore` (the agent write is denied by a permission rule; contents in `docs/kiroignore.suggested`).
