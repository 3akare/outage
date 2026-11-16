# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 1 Feasibility probe (run 2 on probe-v0.0.2 analysed: backoff fixed, armed 73.6%, still below the 90% gate) and 2 Detection, in parallel
Gate: armed time >= 90% on one phone, restore delay p95 <= 60 s, Tecno or Infinix works after battery exemption
Next: run 2 (samsung-b, probe-v0.0.2) analysed in docs/probe/2026-11-15-samsung-b.md; decision recorded (ADR 0001 + ADR 0004 addenda): the backoff fix lifted armed time to 73.6% but the job's ~22 to ~32-min arming delay keeps it below 90%, so receiver-driven arming becomes the primary sensor and the job is the backup. Open for the human: either rerun to reach 12 h for the formal gate verdict (ADR 0013 Result, task 9) or accept the receiver-primary direction; then sensor-android/station-mode need a follow-up task to make the receiver the primary arming path, and a future probe (needs a shared analyze-contract change) must measure a normal-mode static manifest receiver. Still open too: a Tecno or Infinix phone, the Cloudflare and Firebase accounts, the Kiro IDE pass (detection-engine task 15).
Active specs: feasibility-probe (run 2 analysed; task 8 open, gate not met), sensor-android and station-mode (receiver-driven arming is now the primary sensor, job as backup, per ADR 0004 addendum), app-map-insights (screens built on demo data; next: task 1 Worker /api/map.json, then task 12 emulator pass)

Redesign (2026-11-22): spec `ux-redesign` and ADRs 0026 to 0028 written. Web becomes landing `/`, replica `/app`, simulation `/app/simulate`; app dock becomes Home, Insights, Settings with a one-step first run. Next: tokens (task 2), then web shell and landing (task 3).

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
