# ADR 0031: One folder per job in the Worker, and a file map checked by a test

Status: ACCEPTED (2026-11-22), under the blanket approval. Asked for by the human: "I do not know where what is, for instance the web app."

## Context
`workers/api/src` had 21 files at the top level (`area-actor.ts`, `pairing-core.ts`, `handlers.ts`, `bucket.ts` and so on) next to an `area/` folder, and `src/web/` held 20 files with no grouping: the landing page, the web app, the simulation, the area pages, the public index Durable Object and shared helpers all sat side by side. Finding "the web app" meant knowing the file was `web/app.ts` and that its stylesheet was `web/design.ts`. The repository had no single document saying where each part lives.

Common guidance points the same way: group code by feature so related files sit together (the "codemap" idea in matklad's ARCHITECTURE.md post, https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html), and keep one short map of the codebase at the root.

## Decision
1. `workers/api/src` has one folder per job: `ingest/` (phone API and its limits), `area/` (the area Durable Object and its pure logic), `pairing/`, `registry/`, `telemetry/`, `public-index/` (the Durable Object the website reads), and `web/`. Inside `web/`: `landing/`, `app/` (the web app, its CSS and `/api/map.json`), `simulate/`, `area-pages/`, `site/` (shared headers, cache, escaping, layout, strings, status) and `catalog/`. `routes.ts` stays at `web/` as the URL table. Inside a Durable Object folder the files are `actor.ts` (the shell), `core.ts` (logic), `store.ts` (SQLite).
2. Renames that carry meaning: `web/judge.ts` is `web/simulate/replay.ts` (it serves the replay API), `web/map.ts` is `web/area-pages/map-svg.ts`, `registry.ts` is `registry/revocation.ts`. The test `web-judge.test.ts` is `web-replay.test.ts`. URLs, exported names, Durable Object class names and migrations do not change, so the deployed Worker and its stored data are unaffected.
3. Tests stay flat in `workers/api/test/`, named after the folder they cover. Moving them would change every helper import for no gain in finding things.
4. `ARCHITECTURE.md` at the root holds a codemap (where each job lives, how a blackout travels, which file serves each URL, where to change common things) and an index of every tracked file with one line each. `.kiro/scripts/test/architecture.test.mjs` fails `npm test` when a tracked file is missing from the index or the index names a path that does not exist.
5. A committed Python bytecode file (`tools/probe/emulator/__pycache__/…pyc`) is removed and `__pycache__/` is ignored.

## Alternatives
1. Leave the code and only write the map. Rejected: the map would have to explain a flat folder that the human already found confusing.
2. Move the Android packages too. Rejected: `app/outage/<feature>/` is already grouped by feature, and moving Kotlin packages changes every `package` line for no gain.
3. Move docs (`docs/probe-checklist.md` into `docs/probe/`). Rejected: more than ten specs, skills and a test name the path; the map lists it instead.
4. Index only folders, not files. Rejected: the human asked for every file to be accounted for. Folder entries are used only where every file has the same job (screenshots, icons, ADRs, spec folders, fixture sets).

## Consequences
- Every new file needs one line in `ARCHITECTURE.md`, or `npm test` fails. That is the point: the map cannot go stale.
- History before this ADR (`docs/kiro-log.md`, older ADRs) names the old paths. The rename table is in this ADR's decision and in `git log --follow`.
