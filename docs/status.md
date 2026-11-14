# Status

Read by the session-context hook. Keep the four labelled lines below on one line each.

Current milestone: 1 Feasibility probe (all specs written, hooks written, no application code yet)
Gate: armed time >= 90% on one phone, restore delay p95 <= 60 s, Tecno or Infinix works after battery exemption
Next: custom agents, grid-sensing Power, MCP settings and permissions, then scaffold tools/probe (feasibility-probe task 1)
Active specs: feasibility-probe

## Done
- Steering (15 files), 13 specs with requirements, design and tasks, ADRs 0001 to 0011, hooks and tests for the hook scripts, three skills (oem-battery-guide, field-report, release-apk) with scripts and tests.

## Waiting for the human
- Analyze Requirements on each spec (IDE or CLI), Correctness pass on detection-engine (IDE).
- Create `.kiroignore` (the write is denied for the agent by a permission rule, source kiro-scope:kiroignore; contents in `docs/kiroignore.suggested`).
- Verify the OEM battery steps on real phones (oem-battery-guide `verified[]` is empty for every maker).
- Review ADR 0005 (parameters), 0007 (public floor), 0008 (Firebase, push data), 0009 (pairing data), 0011 (telemetry data).
- Approve dependencies when a task asks; set secrets when a task asks.
