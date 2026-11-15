---
inclusion: always
---

# Repository structure

Every file is listed in `ARCHITECTURE.md` (ADR 0031). List new files there.

```
apps/android           Kotlin app (sensor, alarm, log, UI)
powers/grid-sensing    Kiro Power (Agent Plugin): charging-sensor, blackout-detection, oem-battery-guide skills
workers/api            Cloudflare Worker, Durable Objects, website (src/web)
packages/detection     Pure TypeScript engine, no I/O (Worker and simulator only)
packages/shared        Types, event schema, H3 helpers, oem-guide.json, contract fixtures
tools/sim              Simulator and replay generator
tools/field            Daily field-test report generator
tools/probe/android    Throwaway Kotlin probe app (Milestone 1)
tools/probe/worker     Throwaway probe Worker
tools/probe/analyze    Probe analysis library
docs/                  kiro-log.md, adr/, field/, traceability.md
.kiro/                 steering, specs, hooks, skills, agents, settings
.github/               CI workflows and their scripts
```

## Rules
- Detection logic lives only in `packages/detection`. Only the Worker and `tools/sim` call it. The phone never runs or reimplements it.
- `packages/detection` has no I/O: no network, no storage, no `Date.now()`. The clock is an input.
- The event schema and API shapes live in `packages/shared`, with JSON fixtures in `packages/shared/fixtures/` that both the TypeScript tests and the Kotlin tests read.
- `.kiro/` is committed and never gitignored. It is the evidence judges score.
- Specs live in `.kiro/specs/<feature>/` with `requirements.md`, `design.md`, `tasks.md`.
- Work order: steering, specs, hooks, agents/skills/powers, then code. No app code before its spec exists.
