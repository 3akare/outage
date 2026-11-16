---
inclusion: always
---

# Repository structure

Two products, one shared core (ADR 0047). The human-readable map is the root `README.md`; each folder has its own `README.md`.

```
android/outage         The Android app people install (Kotlin, Compose): sensor, alarm, log, map, insights
android/probe          Throwaway Milestone 1 probe, kept whole: app/ (Kotlin), worker/, analyze/, emulator/, contract/
web/                   One Cloudflare Worker: the API and the whole website
web/api                What the phone and the pages call: ingest, area, alerts, home, pairing, registry, telemetry, public-index, map
web/landing            Landing page at /
web/ui/app             Web copy of the phone app at /app (real data)
web/ui/simulate        Judge simulation at /app/simulate (simulated data, clearly labelled)
web/areas              Public area pages and the area catalog
web/site               Helpers every page shares
core/detection         Pure TypeScript engine, no I/O (Worker and simulator only)
core/shared            Types, event schema, H3 helpers, oem-guide.json, design tokens, contract fixtures
tools/sim              Simulator and replay generator
tools/field            Daily field-test report generator
tools/tokens           Design token generator (web and Android)
powers/grid-sensing    Kiro Power (Agent Plugin): charging-sensor, blackout-detection, oem-battery-guide skills
docs/                  kiro-log.md, adr/, field/, traceability.md
.kiro/                 steering, specs, hooks, skills, agents, settings
.github/               CI workflows and their scripts
```

Paths before 2026-11-24 (`docs/kiro-log.md` and ADRs 0001 to 0046 still use them): `apps/android` is `android/outage`, `tools/probe/android` is `android/probe`, `tools/probe/*` is `android/probe/*`, `workers/api` is `web`, `workers/api/src/<job>` is `web/api/<job>`, `workers/api/src/web/*` is `web/*`, `packages/*` is `core/*`. Full table in ADR 0047.

## Rules
- Detection logic lives only in `core/detection`. Only the Worker and `tools/sim` call it. The phone never runs or reimplements it.
- `core/detection` has no I/O: no network, no storage, no `Date.now()`. The clock is an input.
- The event schema and API shapes live in `core/shared`, with JSON fixtures in `core/shared/fixtures/` that both the TypeScript tests and the Kotlin tests read.
- `.kiro/` is committed and never gitignored. It is the evidence judges score.
- Android code goes under `android/`, anything the Worker serves under `web/`, anything both read under `core/`. Do not add a new top-level folder without an ADR.
- Specs live in `.kiro/specs/<feature>/` with `requirements.md`, `design.md`, `tasks.md`.
- Work order: steering, specs, hooks, agents/skills/powers, then code. No app code before its spec exists.
