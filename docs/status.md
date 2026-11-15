# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 1 Feasibility probe (waiting on the Samsung data) and 2 Detection, started in parallel
Gate: armed time >= 90% on one phone, restore delay p95 <= 60 s, Tecno or Infinix works after battery exemption
Next: web-and-area-pages task 11 visual check at 390 x 844 (code parts done; checklist in .kiro/steering/judge-demo.md needs a browser against a running `wrangler dev`). area-cells task 12 still needs the ADR 0006 startup and CPU numbers. Detection engine tasks 3 to 14 and area-cells 4 to 12 are merged into main (PR #2, c026f46, checks green); the detection Kiro IDE correctness pass (task 15) is open. web-and-area-pages tasks 1, 7 to 10 done. feasibility-probe task 8 still needs the human to run docs/probe-checklist.md on real phones (needs the probe APK and the deployed Worker with PROBE_TOKEN), then task 9 (summary and ADR 0013). Open for the human: ADR 0014 (re-hint pass vs R11.4), ADR 0015 (replay builder), ADR 0016 (Judge page service worker, PROPOSED), see docs/session-notes.md
Active specs: feasibility-probe, area-cells, web-and-area-pages

## Done
- Steering (15 files), 13 specs with requirements, design and tasks, ADRs 0001 to 0012 (0012 = native Kotlin stack), hooks and tests for the hook scripts, three skills (oem-battery-guide, field-report, release-apk) with scripts and tests, three custom agents (sensor-engineer, detection-auditor, pitch-writer), MCP config (cloudflare-docs, context7 live; github disabled until a token exists), the grid-sensing Power, spec-lint. 148 tests pass with `npm test`.

## Waiting for the human
- Trust the workspace and open the repo as the project root, or agents, steering, skills and MCP will not load. Optional: set `GITHUB_MCP_TOKEN` and enable the github server. Confirm `claude-opus-4.8` is available. License: MIT (temporary, chosen by the human; revisit before submission).
- Analyze Requirements on each spec (IDE or CLI), Correctness pass on detection-engine (IDE).
- Create `.kiroignore` (the write is denied for the agent by a permission rule, source kiro-scope:kiroignore; contents in `docs/kiroignore.suggested`).
- Verify the OEM battery steps on real phones (oem-battery-guide `verified[]` is empty for every maker).
- Review ADR 0005 (parameters), 0007 (public floor), 0008 (Firebase, push data), 0009 (pairing data), 0011 (telemetry data).
- Approve dependencies when a task asks; set secrets when a task asks.
