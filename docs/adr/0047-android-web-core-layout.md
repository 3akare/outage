# ADR 0047: Top-level layout is android, web and core; ARCHITECTURE.md is removed

Status: ACCEPTED (2026-11-24). Asked for by the human: "when you open the repo, you would see Android and web". Replaces decision 4 of ADR 0031 and the folder names in ADR 0031 decision 1.

## Context
The top level was `apps/`, `workers/`, `packages/` and `tools/`. None of those names says "Android" or "website". The whole website sat in `workers/api/src/web/`, four levels down inside a folder named "api". The probe Android app sat in `tools/probe/android`, away from the real app. `ARCHITECTURE.md` listed every tracked file (529 lines) and a test failed `npm test` when a file was missing from it; the human found it useless for finding anything.

## Decision
1. Moves only. No behaviour, URL, Durable Object class, migration, npm package name or Kotlin package changes.

| Before | After |
|---|---|
| `apps/android` | `android/outage` |
| `tools/probe/android` | `android/probe` (the Gradle files and `app/`) |
| `tools/probe/worker`, `analyze`, `emulator`, `contract`, `README.md` | `android/probe/` (same names) |
| `workers/api` (`package.json`, `wrangler.jsonc`, `tsconfig.json`, `test/`, `bench/`, `visual/`) | `web` |
| `workers/api/src/index.ts` | `web/worker.ts` |
| `workers/api/src/config.ts`, `env.ts` | `web/config.ts`, `web/env.ts` |
| `workers/api/src/{ingest,area,alerts,home,pairing,registry,telemetry,public-index}` | `web/api/<same name>` |
| `workers/api/src/web/routes.ts` | `web/routes.ts` |
| `workers/api/src/web/app/map-json.ts` | `web/api/map/map-json.ts` |
| `workers/api/src/web/app` | `web/ui/app` |
| `workers/api/src/web/simulate` | `web/ui/simulate` |
| `workers/api/src/web/landing` | `web/landing` |
| `workers/api/src/web/area-pages` | `web/areas` |
| `workers/api/src/web/catalog` | `web/areas/catalog` |
| `workers/api/src/web/site` | `web/site` |
| `packages/detection` | `core/detection` |
| `packages/shared` | `core/shared` |

2. The web stays one Worker and one deploy. `landing`, `ui` and `api` are folders, not separate deployments: the free tier, the same-origin rule (no page loads anything from another origin) and ADR 0027 all rely on one origin.
3. The Android folder is `android/outage`, not `android/app`, because a Gradle project already holds a module named `app`.
4. The whole probe kit lives in `android/probe`, including its small Worker and analysis scripts, so the throwaway work is in one place. The sensor-engineer agent may write only `android/probe/app`, the Gradle files and `android/outage`, as before.
5. `ARCHITECTURE.md` and `.kiro/scripts/test/architecture.test.mjs` are deleted. The map is the root `README.md` plus `.kiro/steering/structure.md` (loaded on every turn). `.kiro/scripts/test/structure.test.mjs` checks only that every path those two files name exists.
6. Live files (steering, specs, skills, agents, hooks, scripts, workflows, `docs/traceability.md`, `docs/status.md`) use the new paths. History (`docs/kiro-log.md` entries before this one, ADRs 0001 to 0046, `docs/probe/`) keeps the old paths; the table above translates them.

## Alternatives
1. Three deployments for landing, UI and API. Rejected: three origins break the same-origin rule and need three sets of free-tier limits.
2. One Gradle build with `:app` and `:probe` modules. Rejected: the probe is frozen; tying it to the app's plugins means it must keep compiling with every app change.
3. Rename the npm packages to match the folders. Rejected: about 70 import lines change for no gain in finding things.
4. Rewrite the old ADRs and the log to the new paths. Rejected: they are a record of what was true then.
5. Move the Compose screens out of the flat `app.outage.ui` package into their feature packages in the same change. Deferred: it changes Kotlin `package` lines, so it is done on its own after this move is green.

## Consequences
- `deploy-worker.yml` now watches `web/**` and `core/**`. The Worker name, bindings and migrations are unchanged, so the deployed Worker and its stored data are unaffected.
- A new file no longer needs an index line.
- Anything outside the repository that names an old path (a local Kiro workspace setting, a bookmark) must be updated by hand.
