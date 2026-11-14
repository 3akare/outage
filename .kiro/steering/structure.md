---
inclusion: always
---

# Repository structure

```
apps/mobile            Expo app (sensor + viewer)
modules/outage-sensor  Kotlin Expo Module (JobScheduler sensor)
powers/grid-sensing    Kiro Power (Agent Plugin): charging-sensor, blackout-detection, oem-battery-guide skills
workers/api            Cloudflare Worker + Durable Objects + web page
packages/detection     Pure TypeScript engine, no I/O
packages/shared        Types, event schema, H3 helpers
tools/sim              Simulator and replay generator
docs/                  kiro-log.md, adr/, field/, traceability.md
.kiro/                 steering, specs, hooks, skills, agents, settings
```

## Rules
- Detection logic lives only in `packages/detection`. The Worker and the app call it; they never reimplement it.
- `packages/detection` has no I/O: no network, no storage, no `Date.now()`. The clock is an input.
- Shared types and the event schema live only in `packages/shared`.
- `.kiro/` is committed and never gitignored. It is the evidence judges score.
- Specs live in `.kiro/specs/<feature>/` with `requirements.md`, `design.md`, `tasks.md`.
- Work order: steering, specs, hooks, agents/skills/powers, then code. No app code before its spec exists.
