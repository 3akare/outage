# Kiro log

Each entry says what was done and which spec, steering, hook, skill or agent shaped it.

## 2026-11-14 Steering foundation
- Created 15 steering files in `.kiro/steering/`: always (product, tech, structure, privacy, definition-of-done), fileMatch (event-time, android-background, detection, testing, copy), auto (gridwatch-lessons, demo-mode), manual (release, field-test, judge-demo, which become `/release`, `/field-test`, `/judge-demo`).
- `detection.md` references `packages/detection/README.md` with `#[[file:...]]`.
- Added `AGENTS.md` in `packages/detection/` and `modules/outage-sensor/`.
- Shaped by: master brief Part D.
- Open: `.kiroignore` write was denied by a permission rule. The human must create it (see below).
- Verified against https://kiro.dev/docs/steering/ that `fileMatchPattern` accepts an array.
- Note: AGENTS.md files in subdirectories are always loaded and ignore inclusion modes.

## 2026-11-14 sensor-android requirements and design
- Wrote `.kiro/specs/sensor-android/requirements.md` (R1 to R12, EARS) with a gap analysis and four open questions. The analysis was done by reading the brief. Kiro's Analyze Requirements tool is IDE-only and still has to be run on this file.
- Wrote `.kiro/specs/sensor-android/design.md`: state machine, three Mermaid sequence diagrams, stop decision table, SQLite data model, error handling, sensor properties S1 to S8 mapped to tests.
- Wrote `docs/adr/0001-sensor-job-timeout.md` (proposed) and the first `docs/traceability.md`.
- Docs verified: `JobParameters` stop reasons and the warning against relying on them, `BatteryManager` plug constants. Job time limit and delay figures come from community sources and are marked for probe confirmation.
- Shaped by: master brief Part F (sensor-android), `android-background.md`, `event-time.md`, `privacy.md` steering.
- Not done: `tasks.md`, because the brief requires human review of requirements and design first.

## 2026-11-14 sensor-android decisions and tasks
- Human delegated the open decisions. Resolved OQ1 to OQ4 and the plug-state re-read question in `requirements.md` and `design.md` section 12. ADR 0001 set to accepted for the probe only.
- Wrote `.kiro/specs/sensor-android/tasks.md`: 12 tasks in 7 waves with real dependencies and a Mermaid graph.
- Decisions kept inside the brief: no new dependency (JUnit4), no threshold change, no stored-data change.
- Follow-ups created: specs `station-mode`, `event-ingest` (must carry `timeQuality`), `detection-engine` (decide `LOW` confidence weighting).

## 2026-11-14 event-ingest spec
- Wrote `.kiro/specs/event-ingest/` requirements (R1 to R13, EARS, 11-item gap table), design (flowchart, four sequence diagrams, SQLite data model, error table, properties I1 to I9) and tasks (11 tasks, 7 waves, dependency graph).
- Wrote ADR 0002 (free-tier write budget: detection events written through, armed state write-behind) and ADR 0003 (server-signed install tokens against faked crowds).
- Docs verified: Durable Objects free-plan limits (100k requests, 100k rows written, SQLite-only) and Workers Free limits (10 ms CPU) from developers.cloudflare.com. These drove the write-behind design and the "no schema library" rule.
- Cross-spec effects: sensor `LOST` events are never uploaded; area-cells must expire armed state by `last_seen_ms`; detection decisions must hold counts only so delete-my-data keeps history valid.
- Human action needed before deploy: `wrangler secret put INSTALL_TOKEN_SECRET`. Task 9 revocation list stores hashed IDs for 30 days, so it needs your confirmation per the "changing what data is stored" rule.
- Analyze Requirements (IDE only) not yet run on this spec.

## 2026-11-14 station-mode spec
- Wrote `.kiro/specs/station-mode/` requirements (R1 to R10, 10-item gap table), design (flowchart, state amendments, three sequence diagrams, components, data changes, properties T1 to T7) and tasks (8 tasks, 6 waves). Wrote ADR 0004.
- Key finding: a spare phone at 100% would report a power cut as `BATTERY_FULL` under the sensor rule, so Station mode observes plug state directly through a receiver driver and keeps the Job as backup.
- Docs verified: `specialUse` foreground type has no runtime prerequisite, `dataSync` has a 6 h/24 h cap on Android 15 targets, and `BOOT_COMPLETED` cannot launch the restricted types (`specialUse` is not one). Source: developer.android.com service-types and Android 15 behavior-changes pages.
- Fixed an inconsistency found during writing: ingest's 15-minute state-event wait would delay heartbeats past the 30-minute offline rule, so Station mode shortens it to the heartbeat interval.
- Amended `sensor-android` design to point at the Station inputs. Event `source` field amends the ingest wire schema (task 1).
- Not changed: detection thresholds, stored personal data, dependencies.

## 2026-11-14 detection-engine spec
- Wrote `.kiro/specs/detection-engine/` requirements (R1 to R17, EARS, 16-item gap table, IDE steps), design (pipeline flowchart, full sweep algorithm, data model ER diagram, two sequence diagrams, numerics, settling, error table, properties P1 to P12 plus D1 to D6 mapped to named tests, generators) and tasks (18 tasks, 8 waves, dependency graph).
- Wrote ADR 0005 with every parameter the brief left open, and a computed table of the minimum drops k for Possible and Confirmed at n = 3 to 100 under the prior. The numbers came from a script run in the sandbox.
- Core design decision: decisions are a pure function of the retained event set, not of arrival order. This gives P3, P4 and P8 by construction. A late event joins the set and the sweep reruns.
- Gaps the brief had: weight undefined, conservative prior without a value, EMA unsuited to order independence, P8 clashing with an hour-of-day baseline, restore delay circular with restores, state events missing from the ingest port. All resolved or flagged in the spec.
- Amended `event-ingest` design section 9 and task 5: the port now carries `ARMED` and `DISARMED`.
- Fixed two of my own errors before commit: a sloppy horizon constant, and a performance target of 50 ms that contradicted the 10 ms free-plan CPU limit.
- Not done and cannot be done in Kiro Web: Analyze Requirements and the Correctness (property-based testing) pass. Task 15 and the "IDE steps" section tell the human what to run in Kiro IDE.
- Needs human attention: ADR 0005 values (thresholds) and the P8 reading.

## 2026-11-14 area-cells spec
- Wrote `.kiro/specs/area-cells/` requirements (R1 to R14, 15-item gap table), design (architecture flowchart, scope-selection flowchart, link, notice and scheduling sequence diagrams, public-view type, ER data model, error table, properties A1 to A12) and tasks (12 tasks, 7 waves, dependency graph). Wrote ADR 0006 (sharding, scope and link rules) and ADR 0007 (public map privacy floor of 3 members).
- Docs verified: H3 resolution table (res 8 about 0.74 km², res 7 about 5.16 km², 7 children) and the `h3-js` function list. H3 startup cost on the Worker is unmeasured and is task 2.
- Two problems with the brief's wording, fixed in the spec: (1) "fewer than 3 armed sensors" taken literally turns a cell sparse during an outage, since every phone has dropped, so "armed" for scope selection means armed in the last 24 h and open outages keep their scope; (2) per-cell Durable Objects would double requests for sparse cells, so actors are per res-7 parent.
- Amended `event-ingest` requirements R7 and design overview for parent routing. Detection engine spec unchanged.
- Cross-parent linking deferred. Manual-report hint threshold (2 reporters in 10 min) is a starting value pending the report feature.
- Human attention: ADR 0007's floor of 3 members, ADR 0006's manual-report value.

## 2026-11-14 alerts-and-light-alarm spec
- Wrote `.kiro/specs/alerts-and-light-alarm/` requirements (R1 to R11, 15-item gap table), design (architecture flowchart, alarm state diagram, ring-path and push-sending sequence diagrams, subscription ER model, pure PushPlanner, error and risk tables, properties L1 to L12) and tasks (9 tasks, 5 waves). Wrote ADR 0008.
- Docs verified: Android 14 full-screen intent limits and `canUseFullScreenIntent`, `SCHEDULE_EXACT_ALARM` denied by default, Expo push limits (100 per request, 600 per second, 4 KiB, missing channel means not displayed) and the FCM v1 requirement on Android. Sources: developer.android.com Android 14 behavior pages, docs.expo.dev push pages.
- Design decisions that follow from the docs: the alarm is event-driven (no exact alarm) and entirely native so it works offline with the app closed; alarm audio plays directly so it rings even when notification permission is denied; full-screen intent is only an optional layer.
- Amended: `sensor-android` design (LABEL event), `event-ingest` design (LABEL wire type), `station-mode` requirements (no prompt or alarm in Station mode).
- Human attention: Firebase project and FCM v1 key (external service, needs approval); subscription storage including quiet windows (stored-data change); optional `EXPO_ACCESS_TOKEN`.

## 2026-11-14 remaining specs: power-log, home-watch, onboarding, web-and-area-pages, demo-mode, field-telemetry, feasibility-probe
- Wrote requirements, design and tasks for six feature specs and the feasibility-probe Quick Spec, plus ADR 0009 (Home Watch pairing data), ADR 0010 (public index and tile-free SVG map) and ADR 0011 (field telemetry data). Added `.kiro/specs/README.md` as an index with the property ID prefixes, the cross-spec amendments and the human actions. Extended `docs/traceability.md` for every new property.
- Docs verified in this step: NERC tariff band minimums from public reports (secondary sources, not the regulator, so flagged for the human), Android inexact alarm timing (`setAndAllowWhileIdle` never early, within an hour on Android 12+ unless battery saving applies), Cloudflare Cache API notes (workers.dev behaviour still unverified, so a fallback cache is in the design), Android battery-exemption intents and Play policy, Expo location API (`getLastKnownPositionAsync`, `mocked` flag), Kiro Bugfix Spec structure and the capability table (Analyze Requirements runs in IDE and CLI; Correctness in IDE only).
- Design problems found and resolved in the specs: a station on battery sent no heartbeat so Home Watch would show "offline" during an outage (added `HEARTBEAT_ON_BATTERY`); the self-test and Judge mode would create real events (added `beginSelfTest` and `setDemoSession`, and an isolated demo engine); page views would fan out to Durable Objects (public index plus cache); a postcode cannot become a cell without a geocoding service (neighborhood list and hex grid); "Your spot only" cannot be public under the privacy floor (shown only in the legend and in labeled Judge replay).
- Open for the human: dependency approvals (expo-location, expo-camera, QR and share-card libraries), stored-data confirmations (ADR 0008, 0009, 0011), verify tariff bands and Lagos area centres, Kiro Web Schedule secret handling for the daily report.

## 2026-11-14 hooks
- Wrote 14 hook files in `.kiro/hooks/` (schema v1) and 16 dependency-free Node scripts in `.kiro/scripts/`, with 23 tests (`node --test ".kiro/scripts/test/*.test.mjs"`). Part E hooks: session-context, privacy-guard, secrets-guard, detection-tests, spec-sync (agent and command halves), paid-service-check, verify-on-stop, kiro-log (agent), push-to-main (with `confirm`), property-traceability, kotlin-check, demo-label-check, pre- and post-compaction. Extras: repo-guards (never gitignore or delete `/.kiro`, no skipped tests, ask before deleting tests or adding unapproved dependencies or Cloudflare resources) and property-suite-full (an expensive Stop hook with a `confirm` prompt). `.kiro/hooks/README.md` maps each to the brief.
- Docs verified: hook schema, `timeout`, `enabled` and `confirm` with `confirmCommand`, stdin payload fields and per-surface trigger availability (Kiro Web: Prompt Submit, Agent Stop, Session Start, Pre and Post Tool Use) from https://kiro.dev/docs/hooks/ and /types/. The exit-code rule differs between the docs and the hook tool contract, so blocks use exit 2 and post hooks report on stdout with exit 0.
- Bugs the tests found in my own scripts, fixed in the scripts and not in the tests: `verify` counted the traceability step as a real check, so unverified code looked verified and `push-to-main` pushed it; the verify fingerprint ignored the content of untracked files, so a stale "failing" result stuck; `push-to-main` ran the expensive checks before the cheap secret scan; `session-context` printed the field report name with `.md`; a budget-check false positive on property IDs like D1.
- Dogfooding: the real `push-to-main` hook refused to push my own test fixtures because they contained fake secrets as literals. The fixtures are now assembled at run time; no allow marker was added.
- Added `.gitignore` (never `/.kiro`), `.kiro/approved-dependencies.json` (the brief's stack), `.kiro/git-mode.json` (mode `main`), `docs/status.md`, `docs/session-notes.md`, and a generated property block in `docs/traceability.md`. Steering: `definition-of-done.md` (session habits) and `testing.md` (`FC_NUM_RUNS`, ID-first titles).
- Open: whether Kiro Web loads `.kiro/hooks` from the repo folder or only the workspace root; the `kiro-log` Stop agent hook could loop in a session (loop guard in its prompt; disable if it does); Kotlin Gradle task name to confirm at scaffold.

## 2026-11-14 skills
- Wrote the three Agent Skills in `.kiro/skills/`, in the format from https://kiro.dev/docs/skills/ (folder with `SKILL.md`, `name` equal to the folder, description under 1,024 characters, `references/` and `scripts/`): `oem-battery-guide`, `field-report`, `release-apk`. Index and test command in `.kiro/skills/README.md`.
- `oem-battery-guide`: wrote `packages/shared/src/oem-guide.json`, the single data source the onboarding spec (R7) reads, with sourced steps for Tecno, Infinix, itel, Samsung, Xiaomi, Pixel and other. Sources read: dontkillmyapp.com (Tecno, Samsung, Xiaomi, Google), express.ms (Infinix, Tecno, itel treated as one logic), salestrail.io (itel), Android Doze docs. dontkillmyapp.com has no Infinix or itel page (404), so those two rest on one guide each and are the weakest entries. Every entry is unverified on a device (`verified` is empty); the app labels them "General steps". Validator `validate-guide.mjs` (10 tests) enforces maker coverage, exclusive matching (O4), step rules, `battery_exemption` in every checklist, and honest verification status (O5).
- `field-report`: procedure for the daily run and `/field-test`, report template, metric definitions, failure signatures. `check-report.mjs` rejects missing sections, install IDs, H3 cells, coordinates, tokens, phone numbers and non-alias devices. `new-bugfix.mjs` writes a Bugfix Spec in the documented Kiro form (Current, Expected and Unchanged behavior in EARS) once per signature and keeps `docs/field/failures.json` (property F6). 10 tests. `field-telemetry` task 6 now reuses these scripts.
- `release-apk`: steps from preflight to published release, GitHub REST calls, smoke-test checklist (also the milestone 3 gate and the video). `preflight.mjs` blocks a release on a dirty or unpushed tree, a version that is not above the last tag, an EAS profile that would build an `.aab`, forbidden permissions, secret files in git, missing `.gitignore` lines, and failing tests. `apk-info.mjs` reads the ZIP directory with no SDK, detects v1 and v2+ signing markers, and prints size, SHA-256 and the Worker vars for the install page. 10 tests.
- Docs verified: Agent Skills format; Kiro Bugfix Spec format; EAS APK build (`android.buildType: apk`), remote version source and autoIncrement; EAS free plan limit (30 builds a month, 15 iOS at most, lower-priority queue, per Expo's changelog; one other source says 15 Android, so the skill tells the agent to confirm on expo.dev/pricing).
- Not verified: the exact `eas build` and `eas env` flags (the skill says to confirm with `--help`); signature validity of a real APK (needs `apksigner`); every OEM step on a real phone.
- Fix found while testing: the release preflight did not catch background location enabled through a plugin option; the check and its test were corrected.
- `.kiroignore` is still blocked by a permission rule (deny fs_write matching `.kiroignore`, source `kiro-scope:kiroignore`), even after the human asked for it. The agent did not use a shell write to get around it. The intended contents are in `docs/kiroignore.suggested` for the human to rename.
- Steering `/release` and `/field-test` now point at the skills.

## 2026-11-14 agents, MCP, Power, spec-lint
- Custom agents in `.kiro/agents/` (JSON plus `prompts/*.md`): `sensor-engineer` (Kotlin only, writes limited to `modules/outage-sensor/**`), `detection-auditor` (read-only, ends with `VERDICT:`), `pitch-writer` (writes only README, `docs/pitch/**`, `.commit-message.txt`; claims register checked by `claims-check.mjs`). The first two are pinned to `claude-opus-4.8`; reasoning effort is set per model in `.kiro/settings/cli.json` because there is no per-agent effort field. 33 tests.
- MCP in `.kiro/settings/mcp.json`: `cloudflare-docs` and `context7` (no auth, both answered live through `mcp-check.mjs`), `github` (issues toolset, read-only, disabled until `GITHUB_MCP_TOKEN` exists). Rejected the Cloudflare API server (can change resources) and Neon (no Postgres). `mcp-check.mjs` and `mcp-call.mjs` are the dependency-free clients; 13 tests. Details in `docs/mcp-servers.md`.
- `powers/grid-sensing/`: Agent Plugin with three skills and a context7 `mcp.json`; 24 tests including a sync check against the repo copy of the OEM guide.
- `spec-lint.mjs`: cross-document checks for specs, tasks, ADRs, steering and the traceability table. It found a real gap (the web design had no data model; added section 13). Writing its tests found a bug in `parseDeps`: mixed lists such as "1, 2, `spec` 3" were not split. Fixed in the script.
- Removed `license: MIT` from skill front matter: the human has not chosen a license.
- `.kiroignore` is still denied for the agent; contents remain in `docs/kiroignore.suggested`.
- Not verified: that Kiro Web loads repo agents or MCP when the project root is `/projects/sandbox`; that Kiro accepts hyphenated MCP tool names; the github server (a bad token returned HTTP 400, as expected).

## 2026-11-14 probe scaffold (feasibility-probe task 1)
- Created `tools/probe/app` (Expo SDK 58 from the official `blank-typescript` template; versions come from the template, not from memory), `worker` (Wrangler, `ProbeStore` Durable Object with a `new_sqlite_classes` migration, doc URL in the config), `analyze` (Vitest). `wrangler deploy --dry-run` parses the config; `expo-doctor` passes 20/20; typecheck passes in all three.
- Removed from the template: `LICENSE` (no license chosen), `expo-status-bar` (not on the approved list), iOS config, `favicon`. The template's `AGENTS.md` stays: it tells agents to read the versioned Expo docs, which fits the steering.
- `create-expo-app` failed on `/root/.expo` in the sandbox; setting `HOME=/tmp/h` fixed it.
- Lint is not set up: `eslint` needs the human's approval. Root scripts added: `probe:install`, `probe:typecheck`, `probe:test`. `npm test` is unchanged and needs no install.
- Consequence for tasks 5 and 6: `android/` is generated by prebuild and git-ignored, so the Kotlin sensor must be a local Expo module or config plugin.

## 2026-11-14 license and linter (human decisions)
- License: the human asked for a license that lets people view the project during the hackathon only (no cloning or any use), and afterwards not public at all. Wrote `LICENSE` (custom, view-only, ends when the owner makes the repo private). Root `package.json` has `"license": "SEE LICENSE IN LICENSE"`. Risks recorded, not decided: (1) a secondary source describing Kiroween 2025 says a public repo with an OSI-approved open source license was required; the 2026 rules page returned 403 here, so the 2026 requirement is unverified, and a view-only license is not OSI-approved; (2) GitHub's terms allow forking a public repo whatever the license says; (3) a license cannot make the repo private. That is a repo setting the human changes after judging. This is not legal advice.
- Linter: Biome 2.6.7 (exact pin) at the repo root, `biome.json`, scripts `lint`, `typecheck`, `format:check`. Chosen over ESLint plus Prettier: one dependency, one config, lints `.mjs` and `.ts`. Trade-off: no React Native specific rules (`eslint-config-expo`). Reconsider for the real app if that matters. `.kiro/approved-dependencies.json` updated; eslint, typescript-eslint, prettier are no longer pending.
- First lint run found 4 errors and 4 warnings in my own scripts: assignments inside conditions in `detection-audit.mjs`, a `forEach` callback that returned a value, a comma operator in a test, four unused imports. All fixed; tests still 147 pass. `useTemplate` is off (style only), `noTemplateCurlyInString` is off in tests (they hold literal `${VAR}` on purpose).

## 2026-11-14 license changed to MIT
- The human replaced the view-only license with MIT "for now". `LICENSE`, root `package.json`, `plugin.json` and the `license: MIT` front matter of all six skills now say MIT again. The view-only text is in git history (`a8a8dd8`). MIT is OSI-approved, so it also removes the Kiroween eligibility doubt noted in the entry above. MIT allows anyone to copy and use the code: making the repo private after judging does not withdraw copies already taken.

## 2026-11-14 probe checklist (feasibility-probe task 2)
- Wrote `docs/probe-checklist.md`: gate, rules (alias only, own phones), phone matrix, common setup, the exemption procedure (M4), steps for M1 to M14 with pass criteria, a per-phone log sheet, and a list of what the app must offer.
- Decisions made while writing it, now recorded in the design: tester notes use `cond:`, `setting:`, `step:`, `problem:` prefixes so the analysis can group rows; `UPLOAD` rows carry `durationMs` and `network` for M13; M14 needs a mismatch counter on the debug screen. Task 7 now lists these.
- The checklist is written before the app exists. Button names follow requirement R4 and may differ slightly. Nothing in it has been run on a phone.

## 2026-11-14 stack change: native Kotlin (ADR 0012)
- Human decision: the whole app is native Kotlin; Expo, React Native, EAS and the Kotlin Expo Module are removed, with nothing of the old stack kept. Written down in `docs/adr/0012-native-kotlin-android-app.md`. The gate ADR moves to 0013.
- Why it works here: the sandbox can compile Android. `.kiro/scripts/android-sandbox.sh setup` installs SDK 36 and build-tools 36.0.0 into `/projects/sandbox/.toolchain` (outside the repo); `gradle <dir> <tasks>` builds with the right environment. First run found three sandbox problems, now documented in the script: `/tmp` is cleared between commands, `/root` is read-only so `sdkmanager` failed with "IO exception while downloading manifest" until `ANDROID_USER_HOME` and `user.home` pointed at a writable folder, and `jvmToolchain(17)` failed because the sandbox only has JDK 25 (removed; `compileOptions` targets Java 17).
- Verified by running: `tools/probe/android` (AGP 9.2.1, Gradle 9.4.1, built-in Kotlin, minSdk 26, target 36) passes `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug` and produces an 872 KB debug APK. Not verified: the APK on a phone; the GitHub Actions workflows (written, never run); the Gradle wrapper's behavior on CI.
- CI: `.github/workflows/android.yml` (compile, test, lint, upload the APK, publish on a `probe-v*` tag) and `.github/workflows/checks.yml` (Biome, tests, spec-lint, probe Worker and analysis). Action versions read from the GitHub API today (checkout v7, setup-java v6, setup-gradle v6, upload-artifact v7, setup-node v7).
- Specs rewritten for Kotlin by three parallel sub-agents plus me (alerts, station-mode, onboarding, home-watch, power-log, demo-mode, field-telemetry, detection-engine, event-ingest, area-cells, web pages, sensor-android, feasibility-probe). Findings that were not in the ADR: Demo mode plays a precomputed `unplug` track instead of running the engine (added to the replay type in the web design); the phone aggregator for field telemetry is Kotlin; `I7_uploader_convergence` is now a JUnit test with a seeded random failure pattern because fast-check has no Kotlin equivalent; platform `LocationManager` replaces `expo-location`.
- Push consequence (needs the human): FCM HTTP v1 takes one message per request and the Worker free plan allows about 50 outgoing requests per invocation, so about 45 pushes per invocation instead of thousands. FCM topics would remove the limit but move quiet hours onto the phone. Recorded in ADR 0008; undecided.
- Tooling updated: dependency guard now checks Gradle coordinates and plugin ids against `.kiro/approved-dependencies.json` (`gradleAllowed`, `gradlePluginsAllowed`); `kotlin-check` and `verify` run the Gradle tests through the sandbox script; privacy scan rules use Kotlin and Android APIs; the release skill is rewritten for a tagged Gradle build on GitHub Actions with signing secrets (`release-apk`, preflight tests rewritten); the field-report check blocks FCM registration tokens; the `sensor-engineer` agent now owns `apps/android/**` and `tools/probe/android/**`.
- Removed: `tools/probe/app` (Expo scaffold), `modules/`, `.expo` ignores, EAS references. `rg` for Expo, React Native, EAS, prebuild, Metro, `.tsx`, `apps/mobile`, `modules/outage-sensor` finds only this log and ADR 0012, and one rejected alternative in ADR 0008.
- Open: probe task 1 stays unticked until the Actions workflow has run green once.
