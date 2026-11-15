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
- Verified on GitHub: run on commit dcb78de passed both workflows (`checks`: Biome, 148 tests, spec-lint, probe packages; `android`: compile, unit test, lint, APK uploaded). Probe task 1 is done. The release-to-GitHub step (tag `probe-v*`) has not been exercised yet.

## 2026-11-14 Kiro loading tested live
- Problem: Kiro Web treats `/projects/sandbox` as the project root, and the repo's `.kiro` sits one level down, so the hooks were never seen.
- Fix: `.kiro/scripts/link-workspace-root.sh` links `steering`, `hooks`, `skills`, `agents`, `specs` and `scripts` into `/projects/sandbox/.kiro` (relative links; Kiro's own `settings` folder is left alone).
- Live results after linking:
  - Steering: the five always-on files (tech, structure, product, privacy, definition-of-done) were injected into the next turn.
  - Hooks: real tool calls were blocked by `secrets-guard` (an AWS-key-shaped string), `privacy-guard` (`RECORD_AUDIO` in a manifest), `test-guard` (`it.skip`) and `evidence-guard` (`.kiro/` in a `.gitignore`). None of the four files was written.
  - Skills: `field-report`, `oem-battery-guide` and `release-apk` loaded from the linked folder. `release-apk` preflight ran and correctly failed on the missing `apps/android` build files and `release.yml`.
  - Agents: `detection-auditor` returned `VERDICT: NOT APPLICABLE YET` (no engine yet). `sensor-engineer` respected the gate (no ADR 0013 yet, so probe work only), picked probe task 5, named its build command and its write scope. `pitch-writer` separated provable claims from unproven ones and wrote nothing.
- Found while testing: links changed in the middle of a turn are not picked up until the next message. Removing and re-adding the links mid-turn left the hooks unloaded for the rest of that turn.
- Correction: I said earlier that the custom agents were not loaded. That was wrong: this session's agent list already included all three.
- Not covered: MCP from `.kiro/settings/mcp.json`. Kiro denies writes to the root `.kiro/settings`, so `mcp-call.mjs` stays the route here; both servers answered live earlier today. Not yet observed: the Stop hooks (`verify-on-stop`, `kiro-log`) and the PostToolUse checks.

## 2026-11-14 probe analysis library (feasibility-probe task 3)
- `tools/probe/contract/` holds the one log format (README and `sample-export.json`) that the phone, the Worker and the analysis share. Each side's tests read the sample, so a format change breaks the others.
- `tools/probe/analyze`: parse and validate exports (duplicates from retried uploads dropped, bad rows reported, never guessed), segments (reboot, app restart), a step walk for armed time while charging per condition and per exemption state, M2 and M6 pairing with a 10-minute limit (misses and extra starts are reported), M5 restart gaps, plug lag, nearest-rank percentiles, the gate and the kill criterion, Markdown reports, and `src/cli.mjs`.
- Tests: 12 Vitest tests including PR1 to PR5 and the shared sample, whose numbers were worked out by hand first (0.9494 armed ratio, 15 s, 2 s, 30 s). A test-helper bug (the boot number was ignored) was found by the PR3 test and fixed in the helper.
- Decision made inside the spec's limits, flagged for ADR 0013: the delay gate uses p95 pooled over all phones with at least 20 replugs, and the worst single phone's p95 is printed next to it. Whether the gate should use the worst phone instead is the human's call.
- `@types/node` is not approved, so the library uses no Node APIs; only the `.mjs` wrapper reads and writes files. Node 22.23 runs the `.ts` imports directly.
- Not verified: real phone logs. The rule that the time before an app restart counts as not armed depends on the app logging `SESSION restart` when its process comes back (task 5).

## 2026-11-14 probe Worker (feasibility-probe task 4)
- `tools/probe/worker`: `POST /probe/events` and `GET /probe/export`, both behind `Authorization: Bearer <PROBE_TOKEN>`. The check is constant-time: both values are hashed with SHA-256, then compared with `crypto.subtle.timingSafeEqual` (https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/). With no secret set, the endpoint answers 503 and is never open.
- One SQLite-backed Durable Object stores the rows, keyed on `(alias, id)`, so a retried upload is stored once. Validation follows the contract: aliases only, flat fields up to 2,000 characters, at most 500 rows and 1 MB per request. A bad row refuses the whole batch, so the phone keeps it and sends it again.
- The routes live in `src/handler.ts`, which has no runtime imports and is tested with an in-memory store (5 tests). `src/index.ts` is the Durable Object.
- The task said "tests with a local Wrangler run". `wrangler dev` is a server, and the sandbox refuses to start servers. Wrangler's `createTestHarness()` (https://developers.cloudflare.com/workers/testing/test-harness/get-started/) runs the real Worker and SQLite object inside a test that exits. Two integration tests pass: insert, harmless retry, export identical to the shared sample, and the token required. No new dependency: `createTestHarness` ships in `wrangler`, and `vitest` was already approved.
- Not done, needs the human: deploying (`wrangler deploy`) and setting `wrangler secret put PROBE_TOKEN`. Both need a Cloudflare account login. The Worker is removed after the gate decision (task 10).

## 2026-11-14 probe Android app (feasibility-probe tasks 5, 6, 7)
- `tools/probe/android`: plain Views, platform classes only, no libraries.
  - Task 5: `ProbeJobService` uses the charging constraint and never finishes. `onStopJob` records the stop reason (API 31+), plug, battery, standby bucket, exemption, screen state and both battery sources (M14) before anything else. One second later it re-reads the plug (M6) and re-queues the job only if none is pending.
  - Task 5: `Scheduler` builds the persisted job and runs the M8 test. The docs say an expedited job may only use network, storage-not-low and persistence constraints, so a refusal is expected. The probe records what each phone does, then cancels the test job.
  - Task 5: `ProbeLog` (SQLite, written synchronously), `ProbeApp` (logs `SESSION start` or `restart`, which the analysis needs), and `Facts` (every API guarded by level).
  - Task 6: `ReferenceService` is a `specialUse` foreground service. Its power receivers log the time the broadcast arrived and the plug now and one second later. A switch turns it off. `AlarmTest` arms one ring: the next job start plays the default alarm sound with the alarm usage for 10 seconds (M9).
  - Task 7: `MainActivity` shows every checklist button and the debug lines (live armed ratio, counters, M8, M12, M14, last 50 rows). `Uploader` sends batches of up to 500 over `HttpURLConnection`, marks rows only after a 200, and logs `UPLOAD` rows (M13). Export uses the system file picker, so no storage permission is needed.
- Every Android API was checked first, using the Context7 Android reference and developer.android.com. The URLs are in the code comments.
- A small JSON encoder and parser (`Json.kt`) avoid both a new dependency and the platform `org.json`, which is a stub in JVM tests.
- Verified by running:
  - The build passes compile, 6 JUnit tests and Android Lint with 0 errors (`.kiro/scripts/android-sandbox.sh gradle tools/probe/android ...`).
  - `PR6` checks that the on-phone armed ratio equals the analysis result on the shared sample (0.9494).
  - `PR7` checks that the export file reproduces the shared sample byte for byte.
  - The APK is 0.9 MiB with a v2 signature (debug key), checked with `apk-info.mjs`.
- Lint: fixed the missing icon, and marked the battery-exemption request (deliberate for a sideloaded probe) and a static-context false positive as intended, with reasons. Left as warnings: the SDK 36 target and Gradle 9.4.1 (the versions ADR 0012 pinned), and the backup attribute.
- `docs/probe-checklist.md` updated to the real buttons: alias, URL and token boxes; `Stop alarm`.
- Committed as one commit for tasks 5 to 7, because the three depend on each other and an intermediate commit would not build.
- Not verified: anything on a phone, including whether the job, receivers, foreground service and alarm behave as intended. That is task 8. `MainActivity` uses the deprecated `startActivityForResult`, because the replacement needs AndroidX.

## 2026-11-14 probe release, export only
- Human decisions: publish the probe APK as a GitHub pre-release so it installs from a link on the phone; collect results with `Export file` only, with no Worker for now. The checklist now has an "export only" mode and install steps. The Worker code stays tested but is not deployed, so no `PROBE_TOKEN` is needed yet.
- Release: tag `probe-v0.0.1` (matches `versionName`) triggers `.github/workflows/android.yml`, which builds, tests and lints, then attaches `outage-probe-debug.apk` to a pre-release. Debug-signed: a later probe build with the same debug key installs over it only if built on the same runner key; if Android refuses the update, uninstall first (the log rows on the phone are lost, so export before).

## 2026-11-14 gate amended for the hardware available (ADR 0013, PROPOSED)
- The human has only a Samsung, no other testers, and no control over grid power. Human decisions, recorded in ADR 0013:
  - Samsung counts for the maker check.
  - The 12 hours of charging may add up over several days.
  - The 20 plug-ins may include an emulator run.
  - The Samsung runs in "everyday mode" (set up once, then normal use, export now and then).
- Tecno and Infinix stay an open risk.
- `tools/probe/analyze` gate code changed (maker check renamed to `oem`; the summary prints whether Tecno or Infinix was tested). New test "PR5 amended gate": three 4-hour days in separate boots add up to 12 h and pass. 13 tests pass.
- ADR 0013 now exists as PROPOSED, with the amendment only. The `sensor-engineer` prompt now waits for `Status: ACCEPTED` with a Result section, so the ADR existing no longer opens the sensor work early.
- The checklist's Samsung steps are taken from `oem-guide.json` (dontkillmyapp.com/samsung), not written from memory.

## 2026-11-14 emulator run (ADR 0013 decision 3)
- `.github/workflows/probe-emulator.yml` (started by hand, free on a public repo) builds the probe, enables KVM, boots an Android 15 emulator and runs `tools/probe/emulator/scenario.sh`:
  - one long charge;
  - 20 replugs;
  - 5 plug-ins after a forced Doze;
  - a long charge with the battery exemption;
  - one alarm test.
- The charger and Doze are faked with `dumpsys battery` and `deviceidle`, the commands Android's testing docs describe. After each scripted tap the script goes to the home screen and turns the screen off, so the app is not the visible app while it is measured. The database is pulled with `run-as` (debug build), converted to the contract export by `db-to-export.py`, and analysed. The report goes into the run summary and an artifact.
- The probe gained an automation path: `am start` extras do what the tester's taps do, and the path is ignored unless the build is debuggable.
- Limit, stated in ADR 0013: stock Android only. No maker battery manager, and no real Doze timing.

## 2026-11-14 emulator smoke runs: two fixes and one finding
- Run 1 hung at boot. `avdmanager` and the emulator looked in different AVD folders. Fixed with `ANDROID_AVD_HOME` and a 300 s boot timeout.
- Run 2 (`dumpsys battery set`): apps saw AC, but JobScheduler recorded "Considered charging: false", so the job never started. The scripted notes were also lost, because `am start` without `--activity-single-top` does not deliver extras to an open activity. Fixed: the charger is now driven through the emulator's battery hardware (`adb emu power`), and taps use single-top.
- Run 3 (Android 15 emulator, short time scale) gave real results:
  - **M8 confirmed:** "IllegalArgumentException: An expedited job can only have network and storage-not-low constraints".
  - **Broadcasts:** the reference logger saw every plug change (26 in, 27 out).
  - **Job vs broadcast:** the job stops about 0.44 s before the app receives the power-disconnected broadcast, and starts about 0.44 s before power-connected.
  - **Finding to verify, not a fact yet:** with emulated AC and the level rising from 41% to 89% over 16 minutes, the charging-constraint job never started. It started first at about 90%, then right away on plug-ins at 91% and 93%. JobScheduler keeps "power connected", "battery charging" and "considered charging" apart (`dumpsys jobscheduler`). I could not confirm the rule from the docs. If real phones behave the same, the job alone misses cuts below 90% and Station mode's receivers become the main sensor. The next emulator run tests this directly (plug-ins at 55% and at 92%), and the Samsung run will show it on real hardware.
- **Analysis bug found:** pairing used row ids, but the reference `PLUG` row is written 1 s late with the earlier time, and the job can react before the broadcast. Fixed:
  - rows are now put in time order within a boot (`timeOrder`, TypeScript and Kotlin);
  - pairing accepts a job event up to 10 s before the reference event, with a negative delay.
  - New tests: TypeScript PR4, Kotlin PR6. 14 TypeScript and 7 Kotlin tests pass.

## 2026-11-14 full emulator run (94 min)
- Run 5 passed (after fixing a `set -e` bug in my own script, found when run 4 stopped after 45 minutes). The report is in `docs/probe/2026-11-14-emu-api35.md`, and the findings are in ADR 0013 "Interim findings".
- Main result: once armed, the job sees an unplug within about 0.4 s. Arming after a plug-in took about 992 s (16.5 min) on the emulator, so short charges are mostly unarmed. That corrects my earlier "starts only at 90%" reading: the 90% start in run 3 also came about 985 s after plug-in.
- Not known: whether real phones share this delay (the emulator has no charging current). The Samsung run decides it.

## 2026-11-14 start of event-ingest and detection-engine (human: "Go")
- Human decisions: start `event-ingest` and `detection-engine` while the probe waits for the Samsung data; keep the ADR 0005 detection parameters ("cautious for now, adjust later with real data"). Recorded in `.kiro/specs/README.md` and ADR 0005.
- event-ingest task 1: npm workspaces `packages/*` and `workers/*`; `@outage/shared` (h3-js, Vitest, fast-check) and `@outage/api` (Wrangler, `AreaActor` SQLite Durable Object, `config.ts` with the design section 4 tunables). Typecheck, lint, 2 smoke tests and a Wrangler dry run pass. Root `npm test` now also runs the workspace tests.
- Hook finding: the dependency guard treats a shell redirect that follows a bare package-install command (stderr to stdout) as a package name. I ran the command without the redirect and did not edit the guard. Fix proposed to the human (ignore shell redirections when parsing), with a regression test.

## 2026-11-14 dependency guard fix (human approved)
- `guard-repo.mjs` now stops reading package names at a shell redirection, so a bare install followed by a redirect no longer asks. An install of a real package followed by a redirect still asks. Regression tests added in `hooks.test.mjs`; the test fails on the old guard and passes on the new one (24 hook tests pass).

## 2026-11-14 app-shell spec and Compose approval (human)
- Human approved Jetpack Compose with Material 3 and asked for the missing app-shell spec. Recorded in `.kiro/approved-dependencies.json` (Compose BOM, ui, foundation, material3, the Compose compiler plugin, and the activity and lifecycle bridges; no navigation library), `tech.md`, ADR 0012, and the specs that had "Compose needs approval".
- New spec `.kiro/specs/app-shell/` (requirements R1 to R9, design with router, feature slots, delete registry, theme and status style, tests AS1 to AS8, 8 tasks). Gap it fills: no spec owned the home screen, navigation, settings, delete-my-data, theme or icon. Listed in `.kiro/specs/README.md` and `docs/traceability.md`. spec-lint passes.

## 2026-11-14 event-ingest tasks 2 to 5 and 7 to 9 (parallel sub-agent, checked by me)
- Built by a sub-agent from the `event-ingest` spec, ADR 0002, 0003 and 0006, and the `alerts-and-light-alarm` LABEL amendment. Cloudflare and fast-check APIs were confirmed with the docs servers.
- Code:
  - `packages/shared`: strict hand-written wire validator and H3 helpers, with contract fixtures in `fixtures/ingest/`.
  - `workers/api`: HMAC install token; register, events and delete handlers; event time computed from receive time; routing by res-7 parent.
  - Area actor: SQLite idempotency, token bucket with detection first, write-behind armed state with budget shedding, `DetectionPort` with a no-op implementation.
  - Registry actor: revocation set and daily counters.
- Verified by me after the sub-agent:
  - 19 shared tests and 52 Worker tests pass, including I1 to I6, I8 and I9.
  - The Wrangler test-harness integration test runs the real Worker and both actors.
  - Typecheck and Biome are clean.
  - Fixes: `fast-check` added to `workers/api` dev dependencies; the test script sets a writable `XDG_CONFIG_HOME`, because wrangler wrote to read-only `/root/.config`.
- Decisions beyond the spec (sub-agent notes): reject code `BAD_FIELD`; free-text fields limited to `[A-Za-z0-9_.:-]{1,40}`, so no coordinates or sentences fit; DISARMED wins ties; a registry actor with a 15 s revocation cache that fails closed with 503. ADR 0003 has an addendum on revocation storage.
- Open for the human: the register limit (R2.5) reads `cf-connecting-ip` only to hash it into an in-memory key, never stored or logged. The design says the Worker never reads IP. Keep it, or drop the limit?
- Not done: task 6 (Kotlin uploader), task 10 (app wiring), task 11 (docs and load run).

## 2026-11-14 app-shell tasks 1 to 8 (parallel sub-agent, checked by me)
- `apps/android`: Gradle project (AGP 9.2.1; Compose compiler plugin 2.2.10, matching the Kotlin plugin version that the AGP 9.2.1 POM depends on; Compose BOM 2026.06.01, Material 3). It contains the router with deep links, the four-tab shell (Home, Log, Area, Settings) with Coming-soon slots, Home (sensor state, spot status with its age, Offline and Simulated labels), Settings with Delete my data (pending server delete, retried at start), the theme, the status style table, vector icons, the adaptive and monochrome launcher icon, English strings and an optional Pidgin pack. The CI workflow gained an `app` job.
- Version note: the newest stable Compose BOM (2026.09.00), activity 1.13 and lifecycle 2.11 need compileSdk 37. `tech.md` fixes compileSdk at 36, so the build uses the previous stable versions.
- Verified by me: `.kiro/scripts/android-sandbox.sh gradle apps/android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` passes; 38 JUnit tests (AS1 to AS7), 0 failures; lint 0 errors and 17 warnings. Not verified: the screens on a device. AS8 is a checklist step.
- One `privacy-guard:allow` marker on the privacy-notice string in `strings.xml` (it contains the words "phone number" and "email"; reviewed false positive, to confirm with the human).
- Found by the agent-config test: `pitch-writer` preloaded `docs/kiro-log.md`, which has grown past the custom-agent resource budget. It now reads the log on demand (its prompt already says so); the test now checks that instead.
- Open for the human: the `ACCESS_NETWORK_STATE` permission (normal, no prompt) for the Offline label; the area cache stores a `simulated` flag; whether to move to compileSdk 37.

## 2026-11-14 parallel batch: area-cells, web pages, onboarding and alarm strings (sub-agents, checked by me)
- area-cells:
  - Task 1: confirmed that ingest already routes by res-7 parent.
  - Task 2: H3 bit helpers in `packages/shared/src/h3.ts`, tested against `h3-js` on 10,000+ random cells and all pentagons.
  - Tasks 3, 7 and 8: membership and moves (A10), neighbour notices (A6), and the public view with its 3-member floor and "3+" phones (A8), in `workers/api/src/area/`.
- web-and-area-pages:
  - Tasks 2, 4 and 6: page kit with escaping and per-response CSP nonces (W8); status derivation and page renderers (W1, W2 pages part, W3, W9); SVG map.
  - Task 3: catalog schema and generator. Every centre comes from a Nominatim (OpenStreetMap) page with its URL, and `checkedBy` is empty, so no area is listed until a person checks it (W7). Lekki is left out because no verifiable centre was found.
  - Task 5: Cache API wrapper with an isolate fallback (W4), built but not ticked; it needs a deployed-domain check.
- onboarding:
  - Task 3: `OnboardingFlow` state machine with a persisted record (O1, O3, O7, O8).
  - Task 4: OEM guide matching (O4, O5). The single `oem-guide.json` is copied into the app assets by a Gradle task, so there is no second copy in git.
- alerts task 2: prompt, alarm and push strings plus a missing-key checker (L12).
- Verified by me:
  - `workers/api`: 126 tests, typecheck and Biome clean.
  - `packages/shared`: 24 tests.
  - `apps/android`: build, 71 JUnit tests, lint 0 errors.
  - spec-lint: 0 errors.
- Detection engine (separate, not in this commit): 126 of 128 tests pass. `D5_settle_equivalence` fails (seed 1989584878), so it stays uncommitted until fixed.
- Open for the human: a person must check each catalog centre; whether a scope that stops being public sends a "normal" notice; whether a move keeps the phone armed; the re-onboarding skip rule.

## 2026-11-14 property-suite-full hook crash fixed
- The `property-suite-full` Stop hook crashed with `ENOENT scandir 'packages/detection'`. Kiro Web runs hooks from the workspace root (`/projects/sandbox`, through the `.kiro` links), one level above the repo, and one path in the script was relative to the current folder instead of the repo root. The script now uses `ROOT`, as every other hook does. A regression test runs the hook from another folder; it fails on the old script and passes on the new one (25 hook tests pass).
- This is a crash fix, not a change to what the hook checks.
- When the hook runs again it will report the 2 known `D5_settle_equivalence` failures in the uncommitted detection work. That result is correct, and the work stays uncommitted until it is fixed.

## 2026-11-14 detection engine: D5_settle_equivalence fixed
- Root cause: settle archived a restored outage as soon as its restore time was older than the cut, but the property (and the design's horizon rule) keeps every outage whose start + 12 h is still inside the horizon. The settled run therefore lost an outage that the unsettled run still reported. Shrunk counterexample: 3 installs, one 2-minute outage, 13 h after the last event, 2 chunks.
- Fix: `closeAt` in `settle.ts` now returns start + 12 h for every closed outage. This keeps the cut away from such outages and archives them only once they are fully past. No threshold changed.
- Also kept two earlier uncommitted edits: `outputs.decisions` lists live decisions only, and `closeExpired` runs before `finalizeDays` in the sweep.
- Added the regression test `test/d5-regress.test.ts` (D5_settle_equivalence). Removed the scratch files `dbg.test.ts` and `dbg2.test.ts`, which had no assertions. Fixed a Biome error in `levels.test.ts`. Ticked tasks 3 to 14 of detection-engine.
- Verified: 127 detection tests pass three runs in a row, detection-audit 0 errors, traceability check clean, typecheck and lint clean.

## 2026-11-14 D5 merge gates run
- Ran the four gates on work/detection-d5: D5_settle_equivalence passes, detection-audit has 0 errors (2 warnings), traceability --check is clean, `npm test` passes (150), typecheck and lint are clean.
- Detection engine tasks 3 to 14 are merge-ready. Not pushed; the human decides the merge.

## 2026-11-14 area-cells task 4: router and scope selector
- `workers/api/src/area/scope.ts`: `selectScope` (CELL if 3 or more recently armed members, else the linked group if it has 3, else the parent), `routeScopes` (cell, group, parent), `pinnedScopes` and `cellStatus`. An open outage touching the cell wins and shows from its own scope; a CONFIRMED at CELL precision for a cell under 3 recently armed members is shown as POSSIBLE.
- Tests A1, A2, A3 in `workers/api/test/area-scope.test.ts` (property tests). Ticked tasks 3, 7 and 8 as well: their code and tests (A10, A6, A8) already existed and pass. Group key is the smallest cell, so it does not depend on insertion order.

## 2026-11-14 area-cells task 5: linking
- `workers/api/src/area/links.ts`: co-outage counts from private per-cell drop records (one count per outage per pair, same parent only, trailing 7 days), `linkedPairs`, `groupsFromLinks` (connected components, sorted), `diffLinks`, `planGroups` (create or retire GROUP engines), `pruneRecords`.
- The link table is a pure function of the outage records, so no stored link state is needed to stay correct; storage in task 10 is a cache. Records with one key merge by earliest start and largest per-cell drop count, so replays do not double count.
- Tests A4, A5 in `workers/api/test/area-links.test.ts`. Window edge: an outage exactly 7 days old still counts.

## 2026-11-14 area-cells task 6: hints wiring
- `workers/api/src/area/hints.ts`: `buildContext` turns the neighbor table, local cell levels and linked cells into the engine `Context`; `manualHint` passes a manual-report count only for 2 or more distinct installs (R8.2), zero until the later spec (R8.3). Notices older than 12 hours give no hint.
- Test A7 in `workers/api/test/area-hints.test.ts` runs the real engine: with k below 3 here and in every hinting scope, no decision or push is CONFIRMED. A positive case shows a neighbor with k = 6 raises k = 3 to CONFIRMED, named NEIGHBOR.
- `workers/api/package.json` now lists `@outage/detection` (this repository's own workspace package, already in `.kiro/approved-dependencies.json`); lockfile updated offline. No external dependency added.
