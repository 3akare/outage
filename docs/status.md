# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 1 Feasibility probe (tasks 1 to 7 done: probe app, Worker and analysis built and tested; nothing run on a phone yet)
Gate: armed time >= 90% on one phone, restore delay p95 <= 60 s, Tecno or Infinix works after battery exemption
Next: task 8, the human runs docs/probe-checklist.md on real phones (needs the probe APK and, for uploads, the deployed Worker with PROBE_TOKEN); then task 9 (summary and ADR 0013)
Active specs: feasibility-probe

## Done
- Steering (15 files), 13 specs with requirements, design and tasks, ADRs 0001 to 0012 (0012 = native Kotlin stack), hooks and tests for the hook scripts, three skills (oem-battery-guide, field-report, release-apk) with scripts and tests, three custom agents (sensor-engineer, detection-auditor, pitch-writer), MCP config (cloudflare-docs, context7 live; github disabled until a token exists), the grid-sensing Power, spec-lint. 148 tests pass with `npm test`.

## Waiting for the human
- Trust the workspace and open the repo as the project root, or agents, steering, skills and MCP will not load. Optional: set `GITHUB_MCP_TOKEN` and enable the github server. Confirm `claude-opus-4.8` is available. License: MIT (temporary, chosen by the human; revisit before submission).
- Analyze Requirements on each spec (IDE or CLI), Correctness pass on detection-engine (IDE).
- Create `.kiroignore` (the write is denied for the agent by a permission rule, source kiro-scope:kiroignore; contents in `docs/kiroignore.suggested`).
- Verify the OEM battery steps on real phones (oem-battery-guide `verified[]` is empty for every maker).
- Review ADR 0005 (parameters), 0007 (public floor), 0008 (Firebase, push data), 0009 (pairing data), 0011 (telemetry data).
- Approve dependencies when a task asks; set secrets when a task asks.
