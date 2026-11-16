# Outage: where everything is

Outage turns a charging Android phone into a power-grid sensor. When grid power fails, every phone charging in an area stops charging in the same second. The phone sends charge events to a Cloudflare Worker; the Worker runs the detection engine per area, confirms blackouts and restores, and publishes the result to the app and to a public website.

This file has two parts. The **codemap** says where each job lives and how the parts talk to each other. The **file index** lists every tracked file with one line on what it does. `.kiro/scripts/test/architecture.test.mjs` fails `npm test` when a tracked file is missing from the index or the index names a path that does not exist, so this file cannot drift from the tree.

A path that ends in `/` in the index covers every file under it. That is used only for folders whose files all have the same job (screenshots, icons, ADRs, spec folders).

## Codemap

```
apps/android/        The Android app (Kotlin, Jetpack Compose): sensor, alarm, power log, map, insights
workers/api/         The Cloudflare Worker: phone API, Durable Objects, and the whole website
packages/detection/  The detection engine (pure TypeScript). Runs only inside the Worker and tools/sim
packages/shared/     Types, wire schema, H3 helpers and JSON fixtures shared by the Worker, tools and the app tests
tools/sim/           Builds the simulated replay that /app/simulate plays
tools/field/         Builds the daily field-test report from the Worker's telemetry
tools/probe/         Throwaway Milestone 1 probe: Android app, Worker and analysis
powers/grid-sensing/ Kiro Power (Agent Plugin) with three skills
.kiro/               Kiro steering, specs, hooks, skills, agents and settings (committed, never ignored)
.github/             CI workflows and the scripts they run
docs/                Decisions (adr/), logs, status, traceability, probe results, screenshots
```

### How a blackout travels

1. **Phone** (`apps/android`). The sensor sees the charger stop and queues an event in the outbox (`net/Outbox.kt`); the uploader (`net/Uploader.kt`) posts it to `POST /v1/events`.
2. **Ingest** (`workers/api/src/ingest/`). `handlers.ts` checks the install token (`token.ts`), validates the body against `packages/shared/src/ingest.ts`, computes event time from the phone's elapsed time (`eventtime.ts`) and sends each event to its area.
3. **Area** (`workers/api/src/area/`). One `AreaActor` Durable Object per H3 resolution 7 parent. `core.ts` handles idempotency and limits; `model.ts` and `reducer.ts` call the detection engine (`packages/detection`) and decide outages, links between neighbouring cells, pushes and the public view.
4. **Public index** (`workers/api/src/public-index/`). Area actors write each public scope view (only when 3 or more phones agree) to the `PublicIndex` Durable Object.
5. **Website and app map** (`workers/api/src/web/`). Pages and `/api/map.json` read the public index. The Android map reads the same `/api/map.json`.

### The website, by URL

| URL | Code |
|---|---|
| `/` landing page | `workers/api/src/web/landing/landing.ts` |
| `/app`, `/app/insights`, `/app/settings` (web copy of the phone app), `/app.js`, `/app.css` | `workers/api/src/web/app/app.ts`, `workers/api/src/web/app/design.ts` |
| `/api/map.json` (real data for the web app and the phone) | `workers/api/src/web/app/map-json.ts` |
| `/app/simulate` (clearly labelled simulation) | `workers/api/src/web/simulate/simulate.ts` |
| `/api/v1/public/judge/replay`, `/judge-sw.js`, `/judge` redirect | `workers/api/src/web/simulate/replay.ts` |
| `/areas`, `/area/<slug>`, `/c/<cell>`, `/install`, `/privacy`, 404 | `workers/api/src/web/area-pages/pages.ts`, `workers/api/src/web/area-pages/map-svg.ts` |
| `/api/v1/public/*`, `/sitemap.xml`, `/robots.txt` and the URL table itself | `workers/api/src/web/routes.ts` |

### Boundaries that must hold

- Detection logic lives only in `packages/detection`. Only the Worker and `tools/sim` call it. The phone never runs it.
- `packages/detection` has no I/O and no clock. Time is an input.
- Durable Object classes are thin shells (`actor.ts`) over pure logic (`core.ts`, `reducer.ts`) so Vitest can test the logic without the Workers runtime.
- Web code reads only the public index. It never sees install IDs, counts or exact places. The simulation never shares a page with real data.
- No page loads anything from another origin. Scripts and styles are same-origin or carry the per-response CSP nonce (`web/site/headers.ts`; checked after deploy by `.github/scripts/post-deploy-check.sh`).
- The event schema and API shapes live in `packages/shared`. Its `fixtures/` are read by both the TypeScript tests and the Kotlin tests.

### Where to change X

| To change | Edit |
|---|---|
| A detection threshold | `packages/detection/src/params.ts` (ask the human, ADR 0005) |
| Ingest rate limits and batch sizes | `workers/api/src/config.ts` |
| The wire format between phone and Worker | `packages/shared/src/ingest.ts`, then `apps/android/.../net/Wire.kt` and the fixtures in `packages/shared/fixtures/ingest/` |
| The list of Lagos areas | `workers/api/src/web/catalog/catalog.source.json`, then run `generate.mjs` |
| Web colours and layout | `workers/api/src/web/app/design.ts`; the Android copy of the tokens is `apps/android/.../ui/Tokens.kt` (ADR 0028) |
| UI words on the phone | `apps/android/app/src/main/res/values/strings.xml` (Pidgin in `values-pcm/`) |
| UI words on the website state labels | `workers/api/src/web/site/strings.ts` |
| The OEM battery steps | `packages/shared/src/oem-guide.json` (the Android build copies it into assets) |
| Tariff bands | `apps/android/app/src/main/assets/bands.json` (ADR 0020) |

### Commands

| What | Command (repo root) |
|---|---|
| Install | `npm ci` |
| All Node and TypeScript tests | `npm test` |
| Lint and typecheck | `npm run lint`, `npm run typecheck` |
| Spec consistency | `node .kiro/scripts/spec-lint.mjs` |
| Website visual check and screenshots | `bash workers/api/visual/run.sh` |
| Worker locally | `cd workers/api && npx wrangler dev` |
| Android build, tests, lint (Kiro sandbox) | `.kiro/scripts/android-sandbox.sh gradle apps/android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` |

## File index

### Repository root

| Path | What it does |
|---|---|
| `ARCHITECTURE.md` | This file: codemap and index of every tracked file |
| `LICENSE` | MIT licence |
| `package.json` | npm workspaces (`packages/*`, `workers/*`, `tools/sim`, `tools/field`) and the root `test`, `lint`, `typecheck` scripts |
| `package-lock.json` | Locked npm dependency tree (generated by npm) |
| `biome.json` | Biome lint and format settings for TypeScript, JavaScript and JSON |
| `.gitignore` | Build output, caches, binaries, secrets and logs kept out of git |

### `.github/` CI

| Path | What it does |
|---|---|
| `.github/workflows/checks.yml` | On every push and PR: lint, `npm test`, the 2000-run detection property suite, spec lint, the probe checks, and the website visual check |
| `.github/workflows/android.yml` | Builds, tests and lints the Android app and the probe app; uploads the APKs as artifacts and publishes the probe APK on a `probe-v*` tag |
| `.github/workflows/deploy-worker.yml` | Deploys `workers/api` to Cloudflare on push to main, bootstraps secrets, then smoke-tests the live URL |
| `.github/workflows/probe-emulator.yml` | Manual run: the scripted feasibility probe on an Android emulator |
| `.github/scripts/post-deploy-check.sh` | Run by `deploy-worker.yml` against the live URL: cache headers, `nosniff`, CSP nonce on every inline script or style, only same-origin external scripts and stylesheets, no leaked nonce placeholder, a new nonce per response |

### `apps/android/` Android app

Gradle project. Kotlin sources are grouped by feature under `app/src/main/kotlin/app/outage/`.

| Path | What it does |
|---|---|
| `apps/android/README.md` | How to build and run the app |
| `apps/android/AGENTS.md` | Rules for agents working in the app |
| `apps/android/.gitignore` | Android Studio and build files kept out of git |
| `apps/android/settings.gradle.kts` | Gradle settings: project name and repositories |
| `apps/android/build.gradle.kts` | Top-level Gradle file: plugin versions |
| `apps/android/gradle.properties` | Gradle and AndroidX flags |
| `apps/android/gradlew` | Gradle wrapper script (Unix) |
| `apps/android/gradlew.bat` | Gradle wrapper script (Windows) |
| `apps/android/gradle/wrapper/gradle-wrapper.jar` | Gradle wrapper binary |
| `apps/android/gradle/wrapper/gradle-wrapper.properties` | Gradle version the wrapper downloads |
| `apps/android/app/build.gradle.kts` | App module: SDK levels, Compose, the `API_BASE` build field, the task that copies `oem-guide.json` into assets, dependencies |
| `apps/android/app/src/main/AndroidManifest.xml` | Activity, application class and permissions |
| `apps/android/app/src/main/assets/bands.json` | Tariff bands and their promised hours (power log, ADR 0020) |
| `apps/android/app/src/main/kotlin/app/outage/MainActivity.kt` | The only Activity; hosts the Compose UI |
| `apps/android/app/src/main/kotlin/app/outage/OutageApp.kt` | Application class: builds the shell graph and chooses real or demo map and insights sources |
| `apps/android/app/src/main/kotlin/app/outage/alarm/AlarmState.kt` | Light Alarm state shown on Home |
| `apps/android/app/src/main/kotlin/app/outage/alarm/StringPackCheck.kt` | Checks a string pack has every alarm string |
| `apps/android/app/src/main/kotlin/app/outage/insights/DemoOutages.kt` | About 60 days of labelled sample outages for demo mode |
| `apps/android/app/src/main/kotlin/app/outage/insights/InsightsCalc.kt` | Pure numbers for Insights: hours of power, heatmap, trend, promise check |
| `apps/android/app/src/main/kotlin/app/outage/insights/InsightsSource.kt` | Where Insights gets its outage timeline (demo or real) |
| `apps/android/app/src/main/kotlin/app/outage/insights/PromiseText.kt` | Plain sentence comparing logged hours with the tariff promise |
| `apps/android/app/src/main/kotlin/app/outage/log/BandConfig.kt` | Reads and validates `bands.json` |
| `apps/android/app/src/main/kotlin/app/outage/log/AreaOutageSync.kt` | Fetches the spot's public outages, caches them, stores them as log inputs |
| `apps/android/app/src/main/kotlin/app/outage/log/BandStrings.kt` | String keys for the supply-promise copy |
| `apps/android/app/src/main/kotlin/app/outage/log/LogInput.kt` | Power Log raw inputs and their stored JSON payload |
| `apps/android/app/src/main/kotlin/app/outage/log/LogStore.kt` | Power Log database `outage_log.db` with migrations (ADR 0037) |
| `apps/android/app/src/main/kotlin/app/outage/log/PowerLog.kt` | Feature keys for the Power Log |
| `apps/android/app/src/main/kotlin/app/outage/log/Stats.kt` | Daily stats, Light Score and promise check from the timeline (pure) |
| `apps/android/app/src/main/kotlin/app/outage/log/TimelineBuilder.kt` | Raw inputs to ON, OUT, OFF_CHARGER and UNKNOWN intervals (pure) |
| `apps/android/app/src/main/kotlin/app/outage/map/AreaMapParser.kt` | Strict reader for `/api/map.json` |
| `apps/android/app/src/main/kotlin/app/outage/map/AreaMapSource.kt` | Loads the map: network, cache, or the labelled demo map |
| `apps/android/app/src/main/kotlin/app/outage/map/CellStyle.kt` | Colour role and pattern per cell state; label placement without overlaps |
| `apps/android/app/src/main/kotlin/app/outage/map/DemoAreaMap.kt` | Labelled sample map of Yaba and neighbours |
| `apps/android/app/src/main/kotlin/app/outage/map/FileMapCache.kt` | Last map JSON and fetch time in two private files |
| `apps/android/app/src/main/kotlin/app/outage/map/MapGeometry.kt` | Projection, hex shapes, hit testing, pan and zoom maths |
| `apps/android/app/src/main/kotlin/app/outage/map/MapHttp.kt` | The one GET the map makes |
| `apps/android/app/src/main/kotlin/app/outage/map/MapModel.kt` | Pure map model: areas, cells, states |
| `apps/android/app/src/main/kotlin/app/outage/net/Outbox.kt` | One queued event in the shape the uploader needs |
| `apps/android/app/src/main/kotlin/app/outage/net/ServerDelete.kt` | Server half of delete-my-data |
| `apps/android/app/src/main/kotlin/app/outage/net/HttpApi.kt` | Real HTTP calls to the Worker: register, events, delete |
| `apps/android/app/src/main/kotlin/app/outage/net/SensorOutbox.kt` | The uploader's outbox over the sensor; adds the cell |
| `apps/android/app/src/main/kotlin/app/outage/net/UploadDriver.kt` | Runs the uploader in the background; stores the install ID and token |
| `apps/android/app/src/main/kotlin/app/outage/net/Uploader.kt` | Sends queued events in order, with retry and backoff |
| `apps/android/app/src/main/kotlin/app/outage/net/Wire.kt` | Ingest wire types (mirror of `packages/shared/src/ingest.ts`) |
| `apps/android/app/src/main/kotlin/app/outage/net/WireJson.kt` | JSON for the wire types, no extra library |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/AssetOemGuide.kt` | Reads the OEM battery guide from assets |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/MiniJson.kt` | Small strict JSON reader |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/OemGuide.kt` | OEM battery guide model and per-maker steps |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/OnboardingFlow.kt` | First-run state machine (pure Kotlin) |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/OnboardingRecord.kt` | What onboarding saves on the phone |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/OnboardingStep.kt` | Onboarding steps in order |
| `apps/android/app/src/main/kotlin/app/outage/onboarding/PrefsOnboardingStore.kt` | Onboarding record in SharedPreferences (cell only, never coordinates) |
| `apps/android/app/src/main/kotlin/app/outage/sensor/AndroidSensor.kt` | Android side of the sensor: plug facts, backup job, clock, the one sensor per process |
| `apps/android/app/src/main/kotlin/app/outage/sensor/BootReceiver.kt` | Restarts the sensor after a reboot or an app update |
| `apps/android/app/src/main/kotlin/app/outage/sensor/ChargingJobService.kt` | Backup driver: the charging job |
| `apps/android/app/src/main/kotlin/app/outage/sensor/EventStore.kt` | Outbox interface, stored events and the in-memory store |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SensorController.kt` | The sensor engine the app and both drivers call |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SensorModel.kt` | Plug, confidence, event types and the stop decision table (pure) |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SensorService.kt` | Primary driver: foreground service with power receivers and heartbeat |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SensorState.kt` | Why the sensor is or is not armed |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SensorStateMachine.kt` | The sensor state machine (pure) |
| `apps/android/app/src/main/kotlin/app/outage/sensor/SqliteEventStore.kt` | The outbox on SQLite |
| `apps/android/app/src/main/kotlin/app/outage/sensor/Telemetry.kt` | Armed time, charging time and gaps from the event log (pure) |
| `apps/android/app/src/main/kotlin/app/outage/shell/Connectivity.kt` | Whether the phone has a working network |
| `apps/android/app/src/main/kotlin/app/outage/shell/DeleteRegistry.kt` | Delete-my-data: every feature registers its phone-side delete |
| `apps/android/app/src/main/kotlin/app/outage/shell/HomeUiState.kt` | Everything Home shows, as data |
| `apps/android/app/src/main/kotlin/app/outage/shell/PrefsAreaCache.kt` | Last known area status for offline Home |
| `apps/android/app/src/main/kotlin/app/outage/shell/PrefsFollowedArea.kt` | The area slug the user follows |
| `apps/android/app/src/main/kotlin/app/outage/shell/PrefsShellStore.kt` | Shell settings in SharedPreferences |
| `apps/android/app/src/main/kotlin/app/outage/shell/Route.kt` | Screens the shell can show |
| `apps/android/app/src/main/kotlin/app/outage/shell/Routes.kt` | Parses a route from an intent; back stack |
| `apps/android/app/src/main/kotlin/app/outage/shell/ShellGraph.kt` | Long-lived objects built once at app start |
| `apps/android/app/src/main/kotlin/app/outage/shell/ShellStore.kt` | Interface for the shell's small stored values |
| `apps/android/app/src/main/kotlin/app/outage/shell/StatusModel.kt` | The five spot states |
| `apps/android/app/src/main/kotlin/app/outage/shell/StatusSources.kt` | What the shell reads from feature packages |
| `apps/android/app/src/main/kotlin/app/outage/shell/StatusStyle.kt` | Colour, icon and label for each spot state |
| `apps/android/app/src/main/kotlin/app/outage/ui/CommonScreens.kt` | Shared headers and placeholder screens |
| `apps/android/app/src/main/kotlin/app/outage/ui/FeatureRegistry.kt` | Where features plug their screens into the shell |
| `apps/android/app/src/main/kotlin/app/outage/ui/Fmt.kt` | Time and duration text |
| `apps/android/app/src/main/kotlin/app/outage/ui/HomeScreen.kt` | Home tab: map and feed |
| `apps/android/app/src/main/kotlin/app/outage/ui/HomeViewModel.kt` | Builds `HomeUiState` from the status sources |
| `apps/android/app/src/main/kotlin/app/outage/ui/InsightsScreen.kt` | Insights tab: charts of your own power |
| `apps/android/app/src/main/kotlin/app/outage/ui/MapPalette.kt` | Map colours (same as the web map) |
| `apps/android/app/src/main/kotlin/app/outage/ui/MapScreen.kt` | The hex map on a Compose Canvas, legend, area list and cell sheet |
| `apps/android/app/src/main/kotlin/app/outage/ui/SettingsScreen.kt` | Settings tab |
| `apps/android/app/src/main/kotlin/app/outage/ui/SensorSetupScreens.kt` | Settings screens: Power sensor switch and Battery setup (maker steps, exemption prompt) |
| `apps/android/app/src/main/kotlin/app/outage/ui/Shell.kt` | App frame: Home, Insights, Settings behind the bottom dock |
| `apps/android/app/src/main/kotlin/app/outage/ui/ShellViewModel.kt` | Keeps the router across rotation |
| `apps/android/app/src/main/kotlin/app/outage/ui/StatusRes.kt` | Maps shell states to resource IDs |
| `apps/android/app/src/main/kotlin/app/outage/ui/Theme.kt` | Material 3 colour schemes |
| `apps/android/app/src/main/kotlin/app/outage/ui/Tokens.kt` | Design tokens (same values as the web, ADR 0028) |
| `apps/android/app/src/main/kotlin/app/outage/ui/charts/BarChart.kt` | Hours-of-power bars with the promise line |
| `apps/android/app/src/main/kotlin/app/outage/ui/charts/Heatmap.kt` | Weekday by hour outage heatmap |
| `apps/android/app/src/main/kotlin/app/outage/ui/charts/LineChart.kt` | Trend line with gaps for missing weeks |
| `apps/android/app/src/main/kotlin/app/outage/ui/charts/Ring.kt` | Progress ring |
| `apps/android/app/src/main/res/drawable/` | Vector icons: launcher, dock tabs, sensor and status icons, map buttons |
| `apps/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | Adaptive launcher icon |
| `apps/android/app/src/main/res/values/strings.xml` | Every English UI string |
| `apps/android/app/src/main/res/values-pcm/strings.xml` | Optional Nigerian Pidgin strings (fall back to English per key) |
| `apps/android/app/src/main/res/values/themes.xml` | Light app theme |
| `apps/android/app/src/main/res/values-night/themes.xml` | Dark app theme |
| `apps/android/app/src/test/kotlin/app/outage/alarm/AlarmStringPackTest.kt` | Alarm strings exist in every pack |
| `apps/android/app/src/test/kotlin/app/outage/insights/InsightsTest.kt` | Insights numbers (IN1 to IN6) |
| `apps/android/app/src/test/kotlin/app/outage/log/BandConfigTest.kt` | Shipped band config is valid and sourced |
| `apps/android/app/src/test/kotlin/app/outage/map/MapContractTest.kt` | The app reads the same map fixture as the Worker |
| `apps/android/app/src/test/kotlin/app/outage/map/MapSourceTest.kt` | Map source, cell styles and label placement |
| `apps/android/app/src/test/kotlin/app/outage/map/MapTest.kt` | Map geometry properties (AM1 to AM4) |
| `apps/android/app/src/test/kotlin/app/outage/net/IngestApiTest.kt` | Real transport and sensor outbox against a fake HTTP layer |
| `apps/android/app/src/test/kotlin/app/outage/net/UploaderTest.kt` | Upload order and acknowledgement (I7) |
| `apps/android/app/src/test/kotlin/app/outage/net/WireContractTest.kt` | The app reads the same ingest fixtures as the Worker |
| `apps/android/app/src/test/kotlin/app/outage/onboarding/OemGuideTest.kt` | OEM guide rules (O4, O5) |
| `apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingFlowTest.kt` | Onboarding state machine (O1, O3, O7, O8) |
| `apps/android/app/src/test/kotlin/app/outage/onboarding/OnboardingTestSupport.kt` | In-memory onboarding store for tests |
| `apps/android/app/src/test/kotlin/app/outage/sensor/SensorControllerTest.kt` | Sensor engine against fake adapters (S7, R2, R10, R11, R12) |
| `apps/android/app/src/test/kotlin/app/outage/sensor/SensorCoreTest.kt` | Decision table and state machine (S1 to S8, T1 to T7) |
| `apps/android/app/src/test/kotlin/app/outage/shell/DeleteRegistryTest.kt` | Delete-my-data registry (AS6) |
| `apps/android/app/src/test/kotlin/app/outage/shell/HomeReducerTest.kt` | Home state reduction (AS5) |
| `apps/android/app/src/test/kotlin/app/outage/shell/RoutingTest.kt` | Routes and back stack (AS1 to AS3) |
| `apps/android/app/src/test/kotlin/app/outage/shell/StatusStyleTest.kt` | One style per state (AS4) |
| `apps/android/app/src/test/kotlin/app/outage/shell/StringPack.kt` | Test helper: where the string resources live |
| `apps/android/app/src/test/kotlin/app/outage/shell/StringPackTest.kt` | String packs are complete (AS7) |

### `workers/api/` Cloudflare Worker and website

`src/index.ts` routes `/v1/*` to `ingest/` and everything else to `web/`, and exports the five Durable Object classes. Tests are flat in `test/`, named after the folder they cover.

| Path | What it does |
|---|---|
| `workers/api/README.md` | Worker overview: source layout, actors, routes, deploy pointers |
| `workers/api/package.json` | Worker package: test, typecheck and bench scripts |
| `workers/api/tsconfig.json` | TypeScript settings for the Worker |
| `workers/api/wrangler.jsonc` | Wrangler config: entry, vars, Durable Object bindings and migrations |
| `workers/api/bench/area-bench.mjs` | CPU benchmark for the area actor on a local SQLite shim |
| `workers/api/src/index.ts` | Worker entry: request routing and Durable Object exports |
| `workers/api/src/env.ts` | Type of the Worker bindings and secrets |
| `workers/api/src/config.ts` | Ingest tunables (not detection thresholds) |
| `workers/api/src/ingest/handlers.ts` | `/v1/register`, `/v1/events`, `/v1/delete`, `/v1/stats`, `/v1/pair/*`, `/v1/telemetry`, `/v1/admin/field/:day` |
| `workers/api/src/ingest/token.ts` | Install token: HMAC of the install ID, nothing stored |
| `workers/api/src/ingest/eventtime.ts` | Event time from server receive time and the phone's elapsed time |
| `workers/api/src/ingest/limiter.ts` | Per-source limit for `/v1/register` |
| `workers/api/src/ingest/bucket.ts` | Token bucket that keeps detection events first |
| `workers/api/src/ingest/budget.ts` | Daily write budget |
| `workers/api/src/ingest/armed.ts` | Write-behind armed state per install |
| `workers/api/src/ingest/seqwindow.ts` | Recent sequence numbers for de-duplication |
| `workers/api/src/ingest/ports.ts` | Interface between ingest and detection |
| `workers/api/src/area/actor.ts` | `AreaActor` Durable Object: storage, alarms, calls to other actors |
| `workers/api/src/area/core.ts` | Area ingest core: idempotency, rate limit, armed state, budget shedding |
| `workers/api/src/area/store.ts` | SQLite tables of one area actor |
| `workers/api/src/area/model.ts` | Stateful wrapper around the reducer; collects the outbox |
| `workers/api/src/area/reducer.ts` | Pure area reducer: runs detection per scope, decides outputs |
| `workers/api/src/area/scope.ts` | Picks the scope (cell or parent) a cell is judged in |
| `workers/api/src/area/members.ts` | Which install belongs to which cell, and moves |
| `workers/api/src/area/neighbors.ts` | Neighbour table and notices between areas |
| `workers/api/src/area/links.ts` | Links outages in nearby cells into groups |
| `workers/api/src/area/hints.ts` | Builds detection hints from neighbours and linked cells |
| `workers/api/src/area/pushes.ts` | One push per cell and outage episode |
| `workers/api/src/alerts/quiet.ts` | Quiet-window test for push channels |
| `workers/api/src/alerts/strings.ts` | English push texts |
| `workers/api/src/alerts/core.ts` | Subscriptions and push queue logic for the area actor |
| `workers/api/src/alerts/store.ts` | SQLite tables for subscriptions, push memory and queue |
| `workers/api/src/alerts/hook.ts` | Adds public precision to the area actor's pushes |
| `workers/api/src/alerts/fcm.ts` | FCM HTTP v1 client with service-account token |
| `workers/api/src/alerts/sender.ts` | Push send loop with batching and back-off |
| `workers/api/src/alerts/planner.ts` | Plans push messages for followers |
| `workers/api/src/area/view.ts` | Builds the public view field by field from a whitelist |
| `workers/api/src/area/field.ts` | Field-test records (outages and misses) from the reducer |
| `workers/api/src/pairing/actor.ts` | `PairingActor` Durable Object for Home Watch |
| `workers/api/src/pairing/core.ts` | Pairing offers, claims and removals |
| `workers/api/src/pairing/store.ts` | SQLite tables of one pairing shard |
| `workers/api/src/pairing/hash.ts` | HMAC of a pairing code |
| `workers/api/src/registry/actor.ts` | `RegistryActor`: revoked installs and daily usage counters |
| `workers/api/src/registry/revocation.ts` | Revocation cache kept in a Worker isolate |
| `workers/api/src/telemetry/actor.ts` | `TelemetryActor`: field-test device-days, outage and miss records |
| `workers/api/src/telemetry/core.ts` | Telemetry store logic, testable without the runtime |
| `workers/api/src/public-index/actor.ts` | `PublicIndex` Durable Object: latest public scope views |
| `workers/api/src/public-index/core.ts` | What the public index stores and returns |
| `workers/api/src/public-index/reader.ts` | Read port for the index; null means unavailable |
| `workers/api/src/public-index/public-view.ts` | Shape of one public scope view |
| `workers/api/src/web/routes.ts` | URL table for the website and the public JSON API; caching per route |
| `workers/api/src/web/landing/landing.ts` | `/` landing page |
| `workers/api/src/web/app/app.ts` | Web copy of the phone app: Home map and feed, Insights, Settings, dock, and `/app.js` |
| `workers/api/src/web/app/design.ts` | `/app.css`: design tokens and styles for the landing page, web app and simulation |
| `workers/api/src/web/app/map-json.ts` | Builds `/api/map.json` from the catalog and the public index |
| `workers/api/src/web/simulate/simulate.ts` | `/app/simulate` player |
| `workers/api/src/web/simulate/replay.ts` | Replay JSON API, its types, the service worker, the `/judge` redirect target |
| `workers/api/src/web/area-pages/pages.ts` | `/areas`, `/area/<slug>`, `/c/<cell>`, `/install`, `/privacy`, 404 |
| `workers/api/src/web/area-pages/map-svg.ts` | Server-drawn SVG hex map for the area pages |
| `workers/api/src/web/site/headers.ts` | Security headers, CSP nonce, response building |
| `workers/api/src/web/site/cache.ts` | Cache API with an in-isolate fallback |
| `workers/api/src/web/site/escape.ts` | HTML escaping and safe links |
| `workers/api/src/web/site/layout.ts` | The `Site` settings type and the shared page frame for the area pages |
| `workers/api/src/web/site/strings.ts` | The five public states: label, colour, sentence (English and Pidgin) |
| `workers/api/src/web/site/status.ts` | Derives a state and history from public views |
| `workers/api/src/web/catalog/catalog.source.json` | Named Lagos areas with centre points (edit this) |
| `workers/api/src/web/catalog/catalog.generated.json` | Cells per area (generated by `generate.mjs`; do not edit) |
| `workers/api/src/web/catalog/generate.mjs` | Builds `catalog.generated.json` from the source |
| `workers/api/src/web/catalog/build.ts` | Pure catalog build used by the generator |
| `workers/api/src/web/catalog/schema.ts` | Catalog types and validators |
| `workers/api/src/web/catalog/index.ts` | The catalog as the Worker loads it |
| `workers/api/test/helpers.ts` | Shared ingest and area test builders |
| `workers/api/test/runs.ts` | fast-check run count from `FC_NUM_RUNS` |
| `workers/api/test/scaffold.test.ts` | Worker module loads |
| `workers/api/test/handlers.test.ts` | Ingest handlers |
| `workers/api/test/core.test.ts` | Area core properties (I-series) |
| `workers/api/test/token.test.ts` | Install token |
| `workers/api/test/delete.test.ts` | Delete-my-data across actors |
| `workers/api/test/integration.test.ts` | Real Worker and Durable Objects in the local Workers runtime |
| `workers/api/test/area-field.test.ts` | Field records from the reducer |
| `workers/api/test/area-hints.test.ts` | Hints wiring (A7) |
| `workers/api/test/area-links.test.ts` | Linking (A4, A5) |
| `workers/api/test/area-members.test.ts` | Membership and moves (A10) |
| `workers/api/test/area-model.test.ts` | Area model and outbox |
| `workers/api/test/area-neighbors.test.ts` | Neighbour notices (A6) |
| `workers/api/test/area-reducer.test.ts` | Reducer properties (A9, A11, A12) |
| `workers/api/test/alerts-memory-store.ts` | In-memory alerts store for tests |
| `workers/api/test/alerts-server.test.ts` | Test L7, follow endpoints and the push hook |
| `workers/api/test/alerts-sql.test.ts` | Alerts store against real SQLite |
| `workers/api/test/alerts-helpers.ts` | Shared builders for the alerts tests |
| `workers/api/test/alerts-fcm.test.ts` | Test L8 for the FCM client and send loop |
| `workers/api/test/alerts-planner.test.ts` | Tests L5, L6, L12 for the push planner |
| `workers/api/test/area-scenarios.test.ts` | End-to-end area scenarios |
| `workers/api/test/area-scope.test.ts` | Scope selection (A1 to A3) |
| `workers/api/test/area-view.test.ts` | Public view whitelist (A8) |
| `workers/api/test/pairing.test.ts` | Home Watch pairing |
| `workers/api/test/telemetry.test.ts` | Telemetry endpoints and store |
| `workers/api/test/telemetry-store.ts` | In-memory telemetry store for tests |
| `workers/api/test/telemetry-integration.test.ts` | Telemetry actor in the local Workers runtime |
| `workers/api/test/map-json.test.ts` | `/api/map.json` and its privacy floor |
| `workers/api/test/web-helpers.ts` | Test doubles for the web tests |
| `workers/api/test/web-app.test.ts` | Landing page and web app (UX-series) |
| `workers/api/test/web-cache.test.ts` | Page cache |
| `workers/api/test/web-catalog.test.ts` | Catalog build and validation |
| `workers/api/test/web-index.test.ts` | Public index |
| `workers/api/test/web-kit.test.ts` | Headers, escaping, layout |
| `workers/api/test/web-map.test.ts` | Area-page SVG map |
| `workers/api/test/web-pages.test.ts` | Area pages |
| `workers/api/test/web-replay.test.ts` | Simulation stays separate from real data (W6) |
| `workers/api/test/web-routes.test.ts` | URL table, sitemap and public API |
| `workers/api/visual/run.sh` | Starts `wrangler dev`, runs the visual check, stops the server |
| `workers/api/visual/check.mjs` | Playwright check at 390 x 844 and 1280 x 800; writes the screenshots in `docs/visual/` |

### `packages/detection/` detection engine

| Path | What it does |
|---|---|
| `packages/detection/README.md` | Engine contract: inputs, outputs, state |
| `packages/detection/AGENTS.md` | Rules for agents working on the engine |
| `packages/detection/package.json` | Package manifest |
| `packages/detection/tsconfig.json` | TypeScript settings |
| `packages/detection/bench/evaluate-bench.mjs` | `evaluate()` timing for 100, 500 and 5,000 events |
| `packages/detection/src/index.ts` | Public entry: `evaluate`, `initialState`, types |
| `packages/detection/src/params.ts` | Every threshold (ADR 0005) |
| `packages/detection/src/types.ts` | Engine state and event types |
| `packages/detection/src/merge.ts` | Validate, de-duplicate and sort incoming events |
| `packages/detection/src/sweep.ts` | One pass over events in time order |
| `packages/detection/src/window.ts` | Window statistic and outage level |
| `packages/detection/src/tail.ts` | Poisson upper tail |
| `packages/detection/src/hints.ts` | Hints from other scopes |
| `packages/detection/src/decisions.ts` | Decisions, explanations, change diff, push filter |
| `packages/detection/src/settle.ts` | Settle, archive and migrate state |
| `packages/detection/src/time.ts` | Local hour and day from a fixed offset |
| `packages/detection/test/helpers/bigtail.ts` | High-precision reference Poisson tail |
| `packages/detection/test/helpers/build.ts` | Event and input builders |
| `packages/detection/test/helpers/runs.ts` | fast-check run count |
| `packages/detection/test/helpers/scenario.ts` | Scenario generators (outages, unplugs, generators, late phones) |
| `packages/detection/test/baseline.test.ts` | Baseline rate and restore-delay p95 |
| `packages/detection/test/d5-regress.test.ts` | Pinned regression for D5 |
| `packages/detection/test/decisions.test.ts` | Decisions and explanations (P12, D3, D4, D6) |
| `packages/detection/test/hints.test.ts` | Hints |
| `packages/detection/test/levels.test.ts` | Windows and levels (P1, P2, P7, P11) |
| `packages/detection/test/lifecycle.test.ts` | Outage lifecycle |
| `packages/detection/test/merge.test.ts` | Merge (P4, P9) |
| `packages/detection/test/params.test.ts` | Parameter table |
| `packages/detection/test/restore.test.ts` | Restore and unknown end (P5, P6) |
| `packages/detection/test/settle.test.ts` | Settle and archive (D5) |
| `packages/detection/test/smoke.test.ts` | Engine smoke test |
| `packages/detection/test/tail.test.ts` | Poisson tail accuracy |
| `packages/detection/test/time.test.ts` | Local time helpers |
| `packages/detection/test/weights.test.ts` | Armed intervals and weights (P10) |
| `packages/detection/test/whole.test.ts` | Whole-engine properties (P3, P8) |

### `packages/shared/` shared types and fixtures

| Path | What it does |
|---|---|
| `packages/shared/package.json` | Package manifest and exports |
| `packages/shared/tsconfig.json` | TypeScript settings |
| `packages/shared/src/index.ts` | Public entry |
| `packages/shared/src/ingest.ts` | Ingest wire schema and strict validator |
| `packages/shared/src/engine.ts` | Types shared by the engine, Worker and simulator |
| `packages/shared/src/h3.ts` | H3 helpers |
| `packages/shared/src/map.ts` | `/api/map.json` types |
| `packages/shared/src/follow.ts` | Follow and unfollow request shapes |
| `packages/shared/src/pairing.ts` | Home Watch code alphabet, shard and request shapes |
| `packages/shared/src/sensor.ts` | Sensor event, telemetry and diagnostics types |
| `packages/shared/src/device-day.ts` | Field telemetry device-day schema |
| `packages/shared/src/field-dump.ts` | Shape of the admin field endpoint's answer |
| `packages/shared/src/field-metrics.ts` | Field metrics and gate evaluation |
| `packages/shared/src/field-outage.ts` | Field outage records and their classes |
| `packages/shared/src/oem-guide.json` | Per-maker battery steps (the one copy; Android copies it at build) |
| `packages/shared/fixtures/ingest/` | Contract fixtures for each event type, request and response (read by Vitest and JUnit) |
| `packages/shared/fixtures/map/map.json` | Contract fixture for `/api/map.json` |
| `packages/shared/fixtures/replay.json` | Simulated replay played by `/app/simulate` (built by `tools/sim`) |
| `packages/shared/fixtures/sensor/sensor-events.json` | Sensor event fixture read by TypeScript and Kotlin tests |
| `packages/shared/fixtures/telemetry/` | Device-day fixtures: valid, station and invalid |
| `packages/shared/test/arbs.ts` | fast-check arbitraries |
| `packages/shared/test/runs.ts` | fast-check run count |
| `packages/shared/test/device-day.test.ts` | Device-day schema |
| `packages/shared/test/field-metrics.test.ts` | Field metrics |
| `packages/shared/test/field-outage.test.ts` | Field outage classes |
| `packages/shared/test/h3-bits.test.ts` | H3 bit helpers |
| `packages/shared/test/h3.test.ts` | H3 validation |
| `packages/shared/test/ingest.test.ts` | Ingest validator |
| `packages/shared/test/follow.test.ts` | Follow request schema |
| `packages/shared/test/pairing.test.ts` | Pairing shapes |
| `packages/shared/test/sensor.test.ts` | Sensor event shape |
| `packages/shared/test/scaffold.test.ts` | Schema version |

### `tools/` build-time tools

| Path | What it does |
|---|---|
| `tools/sim/package.json` | Simulator package |
| `tools/sim/tsconfig.json` | TypeScript settings |
| `tools/sim/scripts/build-replay.mjs` | Writes `packages/shared/fixtures/replay.json` through the real engine |
| `tools/sim/src/fixture.ts` | Synthetic outage fixture |
| `tools/sim/src/replay.ts` | Replay builder |
| `tools/sim/src/sanitize.ts` | Strips IDs, dates and cells from fixtures |
| `tools/sim/src/scenario.ts` | "Unplug your own phone" scenario |
| `tools/sim/test/outage30.test.ts` | A 30-phone outage confirms within 10 s |
| `tools/sim/test/replay.test.ts` | Replay builder against an independent reference |
| `tools/sim/test/runs.ts` | fast-check run count |
| `tools/sim/test/sanitize.test.ts` | Sanitizer leaves nothing identifying (DM6) |
| `tools/sim/test/scenario.test.ts` | Scenario confirms and restores (DM2, DM4, DM5) |
| `tools/field/README.md` | Field report tool usage |
| `tools/field/package.json` | Package manifest |
| `tools/field/tsconfig.json` | TypeScript settings |
| `tools/field/bin/field-report.mjs` | CLI: fetch a day's telemetry and write `docs/field/YYYY-MM-DD.md` |
| `tools/field/bin/field-report.d.mts` | Types for the CLI |
| `tools/field/scripts/update-golden.mjs` | Regenerates the golden reports |
| `tools/field/src/index.ts` | Public entry |
| `tools/field/src/input.ts` | Strict reader for the admin JSON |
| `tools/field/src/run.ts` | One field day end to end, pure |
| `tools/field/src/stats.ts` | Per-device and per-class numbers |
| `tools/field/src/signatures.ts` | Failure signatures |
| `tools/field/src/failures.ts` | Files new failure signatures |
| `tools/field/src/render.ts` | Markdown report |
| `tools/field/src/md-raw.d.ts` | Type for `?raw` Markdown imports |
| `tools/field/test/arbs.ts` | Arbitraries for field dumps |
| `tools/field/test/build.ts` | Report test builders |
| `tools/field/test/runs.ts` | fast-check run count |
| `tools/field/test/cli.test.mjs` | CLI behaviour |
| `tools/field/test/failures.test.ts` | Failure filing |
| `tools/field/test/input.test.ts` | Input reader |
| `tools/field/test/report.test.ts` | Report against golden files |
| `tools/field/test/schedule.test.mjs` | Daily schedule dry run |
| `tools/field/test/signatures.test.ts` | Signatures |
| `tools/field/test/golden/` | Expected reports: empty, rich and recorded Samsung day |
| `tools/field/test/recorded/README.md` | What the recorded day is |
| `tools/field/test/recorded/2026-11-15-samsung-probe.json` | Recorded Samsung probe day |
| `tools/probe/README.md` | The throwaway feasibility probe and how to run it |
| `tools/probe/contract/README.md` | Probe log contract |
| `tools/probe/contract/sample-export.json` | Sample probe export read by all three probe parts |
| `tools/probe/emulator/scenario.sh` | Scripted probe run on an emulator |
| `tools/probe/emulator/db-to-export.py` | Converts the probe database to an export file |
| `tools/probe/analyze/package.json` | Analysis package (own install) |
| `tools/probe/analyze/package-lock.json` | Locked dependencies for the analysis |
| `tools/probe/analyze/tsconfig.json` | TypeScript settings |
| `tools/probe/analyze/src/cli.mjs` | Reads an export and writes `docs/probe/` reports |
| `tools/probe/analyze/src/analyze.ts` | Analysis entry |
| `tools/probe/analyze/src/gate.ts` | Milestone 1 gate |
| `tools/probe/analyze/src/pairing.ts` | Pairs job events with reference events |
| `tools/probe/analyze/src/parse.ts` | Row validation |
| `tools/probe/analyze/src/report.ts` | Per-device report |
| `tools/probe/analyze/src/stats.ts` | Percentiles |
| `tools/probe/analyze/src/timeline.ts` | Segments by reboot and restart |
| `tools/probe/analyze/src/types.ts` | Probe log types |
| `tools/probe/analyze/test/analyze.test.ts` | Analysis tests |
| `tools/probe/analyze/test/helpers.ts` | Log builders |
| `tools/probe/worker/package.json` | Probe Worker package (own install) |
| `tools/probe/worker/package-lock.json` | Locked dependencies for the probe Worker |
| `tools/probe/worker/tsconfig.json` | TypeScript settings |
| `tools/probe/worker/wrangler.jsonc` | Probe Worker config |
| `tools/probe/worker/src/index.ts` | Probe Worker entry and Durable Object |
| `tools/probe/worker/src/handler.ts` | Probe routes |
| `tools/probe/worker/test/handler.test.ts` | Route tests |
| `tools/probe/worker/test/integration.test.ts` | Probe Worker in the local runtime |
| `tools/probe/android/.gitignore` | Android Studio and build files kept out of git |
| `tools/probe/android/settings.gradle.kts` | Gradle settings |
| `tools/probe/android/build.gradle.kts` | Top-level Gradle file |
| `tools/probe/android/gradle.properties` | Gradle flags |
| `tools/probe/android/gradlew` | Gradle wrapper (Unix) |
| `tools/probe/android/gradlew.bat` | Gradle wrapper (Windows) |
| `tools/probe/android/gradle/wrapper/gradle-wrapper.jar` | Gradle wrapper binary |
| `tools/probe/android/gradle/wrapper/gradle-wrapper.properties` | Gradle version |
| `tools/probe/android/app/build.gradle.kts` | Probe app module |
| `tools/probe/android/app/src/main/AndroidManifest.xml` | Probe app manifest |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/MainActivity.kt` | Debug screen |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/ProbeApp.kt` | Application class; logs session starts |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/ProbeJobService.kt` | The charging job under test |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/ReferenceService.kt` | Foreground service that records the reference time |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/RestartPolicy.kt` | What to do when the job is stopped |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Scheduler.kt` | Schedules the job |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/AlarmTest.kt` | Can the alarm sound from the job process |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Facts.kt` | Phone state reads for log rows |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Json.kt` | Minimal JSON |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Model.kt` | One log row |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Prefs.kt` | Probe settings |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/ProbeLog.kt` | Local log database |
| `tools/probe/android/app/src/main/kotlin/app/outage/probe/Uploader.kt` | Uploads the log to the probe Worker |
| `tools/probe/android/app/src/test/kotlin/app/outage/probe/ProbeContractTest.kt` | Reads the shared sample export |
| `tools/probe/android/app/src/test/kotlin/app/outage/probe/RestartPolicyTest.kt` | Restart decision |

### `powers/grid-sensing/` Kiro Power

| Path | What it does |
|---|---|
| `powers/grid-sensing/README.md` | What the Power offers |
| `powers/grid-sensing/plugin.json` | Agent Plugin manifest |
| `powers/grid-sensing/mcp.json` | MCP servers the Power uses |
| `powers/grid-sensing/skills/blackout-detection/SKILL.md` | Skill: blackout detection from charging events |
| `powers/grid-sensing/skills/blackout-detection/references/algorithm.md` | Algorithm and properties |
| `powers/grid-sensing/skills/blackout-detection/scripts/poisson.mjs` | Poisson helper |
| `powers/grid-sensing/skills/blackout-detection/scripts/test/poisson.test.mjs` | Poisson helper tests |
| `powers/grid-sensing/skills/charging-sensor/SKILL.md` | Skill: Android charging sensor |
| `powers/grid-sensing/skills/charging-sensor/references/android-facts.md` | Platform facts with sources |
| `powers/grid-sensing/skills/charging-sensor/references/decision-table.md` | What a job stop becomes |
| `powers/grid-sensing/skills/charging-sensor/references/device-probe.md` | What to measure on a device |
| `powers/grid-sensing/skills/oem-battery-guide/SKILL.md` | Skill: OEM battery steps |
| `powers/grid-sensing/skills/oem-battery-guide/references/oem-guide.json` | Copy of the guide shipped with the Power |
| `powers/grid-sensing/skills/oem-battery-guide/references/sources.md` | Sources per entry |
| `powers/grid-sensing/skills/oem-battery-guide/references/verification-protocol.md` | How to verify one phone |
| `powers/grid-sensing/skills/oem-battery-guide/scripts/validate-guide.mjs` | Guide validator |
| `powers/grid-sensing/skills/oem-battery-guide/scripts/test/validate-guide.test.mjs` | Validator tests |

### `.kiro/` Kiro configuration

| Path | What it does |
|---|---|
| `.kiro/approved-dependencies.json` | Dependencies the hooks allow without asking |
| `.kiro/git-mode.json` | Commit to main or open PRs |
| `.kiro/steering/product.md` | Product, hooks for one phone, claims discipline |
| `.kiro/steering/tech.md` | Tech stack and dependency rules |
| `.kiro/steering/structure.md` | Repository structure rules |
| `.kiro/steering/privacy.md` | Privacy rules |
| `.kiro/steering/definition-of-done.md` | When a task is done; git rules |
| `.kiro/steering/testing.md` | Testing rules |
| `.kiro/steering/detection.md` | Detection engine rules |
| `.kiro/steering/event-time.md` | Event time rules |
| `.kiro/steering/android-background.md` | Android background design |
| `.kiro/steering/copy.md` | UI copy rules |
| `.kiro/steering/demo-mode.md` | Demo and simulated data rules |
| `.kiro/steering/docs-servers.md` | Which documentation server to use for each platform |
| `.kiro/steering/gridwatch-lessons.md` | Lessons from GridWatch |
| `.kiro/steering/field-test.md` | The `/field-test` command |
| `.kiro/steering/judge-demo.md` | The `/judge-demo` command |
| `.kiro/steering/release.md` | The `/release` command |
| `.kiro/specs/README.md` | Spec index, build order, cross-spec amendments |
| `.kiro/specs/alerts-and-light-alarm/` | Spec: alerts and Light Alarm (requirements, design, tasks) |
| `.kiro/specs/app-map-insights/` | Spec: app map and Insights |
| `.kiro/specs/app-shell/` | Spec: app shell, navigation, settings, delete-my-data |
| `.kiro/specs/area-cells/` | Spec: area actors and cells |
| `.kiro/specs/demo-mode/` | Spec: demo mode and simulation |
| `.kiro/specs/detection-engine/` | Spec: detection engine |
| `.kiro/specs/event-ingest/` | Spec: phone-to-server ingest |
| `.kiro/specs/feasibility-probe/` | Spec: Milestone 1 probe |
| `.kiro/specs/field-telemetry/` | Spec: field telemetry and daily report |
| `.kiro/specs/home-watch/` | Spec: Home Watch |
| `.kiro/specs/onboarding/` | Spec: onboarding and OEM battery steps |
| `.kiro/specs/power-log/` | Spec: Power Log and supply promise |
| `.kiro/specs/sensor-android/` | Spec: Android charging sensor |
| `.kiro/specs/station-mode/` | Spec: station mode |
| `.kiro/specs/ux-redesign/` | Spec: landing page, web app, simulation, app dock |
| `.kiro/specs/web-and-area-pages/` | Spec: public website and area pages |
| `.kiro/hooks/README.md` | Every hook, its trigger and behaviour |
| `.kiro/hooks/session-context.json` | SessionStart: print status |
| `.kiro/hooks/privacy-guard.json` | Block writes that store exact location or personal data |
| `.kiro/hooks/secrets-guard.json` | Block secrets in tracked files |
| `.kiro/hooks/repo-guards.json` | Protect `.kiro`, block skipped tests, ask before new dependencies |
| `.kiro/hooks/paid-service-check.json` | Remind about the zero budget when a service is mentioned |
| `.kiro/hooks/detection-tests.json` | Run detection tests after engine writes |
| `.kiro/hooks/file-checks.json` | Kotlin tests and demo-label check after file saves |
| `.kiro/hooks/spec-sync.json` | Keep spec documents in sync after a spec write |
| `.kiro/hooks/verify-on-stop.json` | Typecheck, lint and test on stop |
| `.kiro/hooks/kiro-log.json` | Write the log entry and commit message on stop |
| `.kiro/hooks/push-to-main.json` | Commit and push to main on stop (with confirm) |
| `.kiro/hooks/property-traceability.json` | Check every property has a test |
| `.kiro/hooks/property-suite-full.json` | Full 2000-run property suite (with confirm) |
| `.kiro/hooks/compaction-notes.json` | Save and restore session notes around compaction |
| `.kiro/scripts/lib.mjs` | Shared helpers for hook scripts |
| `.kiro/scripts/scan.mjs` | Pattern scanners for the guards |
| `.kiro/scripts/session-context.mjs` | SessionStart script |
| `.kiro/scripts/guard-privacy.mjs` | Privacy guard script |
| `.kiro/scripts/guard-secrets.mjs` | Secrets guard script |
| `.kiro/scripts/guard-repo.mjs` | Repo guard script |
| `.kiro/scripts/paid-service-check.mjs` | Zero-budget reminder script |
| `.kiro/scripts/detection-tests.mjs` | Detection test runner for the hook |
| `.kiro/scripts/property-suite-full.mjs` | Full property suite runner |
| `.kiro/scripts/traceability.mjs` | Property-to-test check; regenerates part of `docs/traceability.md` |
| `.kiro/scripts/verify.mjs` | Stop-time verification |
| `.kiro/scripts/push-to-main.mjs` | Commit and push script |
| `.kiro/scripts/push-confirm.mjs` | Decides when a Stop hook asks for confirmation |
| `.kiro/scripts/spec-lint.mjs` | Cross-document consistency check |
| `.kiro/scripts/spec-sync-notice.mjs` | Tells the agent what to sync after a spec edit |
| `.kiro/scripts/compaction.mjs` | Session notes across compaction |
| `.kiro/scripts/kotlin-check.mjs` | Kotlin unit tests after Kotlin edits |
| `.kiro/scripts/demo-label-check.mjs` | Fails when a simulated event lacks `simulated: true` |
| `.kiro/scripts/claims-check.mjs` | Claims register check for public text |
| `.kiro/scripts/detection-audit.mjs` | Static audit of the detection engine |
| `.kiro/scripts/kiro-story.mjs` | Generates "How Kiro built this" |
| `.kiro/scripts/mcp-call.mjs` | Calls one MCP tool from the shell |
| `.kiro/scripts/mcp-check.mjs` | Checks the MCP servers really answer |
| `.kiro/scripts/android-sandbox.sh` | Builds Android code inside the Kiro sandbox |
| `.kiro/scripts/link-workspace-root.sh` | Links the sandbox root to the repository |
| `.kiro/scripts/test/agents.test.mjs` | Custom agents are valid |
| `.kiro/scripts/test/agents-support.test.mjs` | Detection audit and Kiro story helpers |
| `.kiro/scripts/test/architecture.test.mjs` | Every tracked file is in `ARCHITECTURE.md`, and every path in it exists |
| `.kiro/scripts/test/claims-check.test.mjs` | Claims check |
| `.kiro/scripts/test/hooks.test.mjs` | Hook scripts |
| `.kiro/scripts/test/mcp-check.test.mjs` | MCP check against a mock server |
| `.kiro/scripts/test/post-deploy-check.test.mjs` | Post-deploy check passes and fails on the right pages |
| `.kiro/scripts/test/power.test.mjs` | Power conforms to the Agent Plugins spec |
| `.kiro/scripts/test/spec-lint.test.mjs` | Spec lint |
| `.kiro/skills/README.md` | The repository's skills |
| `.kiro/skills/test/skills.test.mjs` | Every skill has a valid format |
| `.kiro/skills/field-report/SKILL.md` | Skill: daily field report |
| `.kiro/skills/field-report/references/metrics.md` | Metrics and gates |
| `.kiro/skills/field-report/references/report-template.md` | Report template |
| `.kiro/skills/field-report/references/signatures.md` | Failure signatures |
| `.kiro/skills/field-report/scripts/check-report.mjs` | Checks a report before commit |
| `.kiro/skills/field-report/scripts/check-report.d.mts` | Types for the checker |
| `.kiro/skills/field-report/scripts/new-bugfix.mjs` | Files a Bugfix Spec for a new failure |
| `.kiro/skills/field-report/scripts/new-bugfix.d.mts` | Types for the bugfix planner |
| `.kiro/skills/field-report/scripts/test/field-report.test.mjs` | Field report skill scripts |
| `.kiro/skills/oem-battery-guide/SKILL.md` | Skill: OEM battery steps |
| `.kiro/skills/oem-battery-guide/references/sources.md` | Sources per entry |
| `.kiro/skills/oem-battery-guide/references/verification-protocol.md` | How to verify one phone |
| `.kiro/skills/oem-battery-guide/scripts/validate-guide.mjs` | Guide validator |
| `.kiro/skills/oem-battery-guide/scripts/test/validate-guide.test.mjs` | Validator tests |
| `.kiro/skills/release-apk/SKILL.md` | Skill: build and publish an APK |
| `.kiro/skills/release-apk/references/github-release.md` | GitHub release steps |
| `.kiro/skills/release-apk/references/gradle-release.md` | Signed Gradle builds |
| `.kiro/skills/release-apk/references/smoke-test.md` | Device smoke test |
| `.kiro/skills/release-apk/scripts/apk-info.mjs` | Inspects a built APK |
| `.kiro/skills/release-apk/scripts/preflight.mjs` | Pre-release checks |
| `.kiro/skills/release-apk/scripts/test/release.test.mjs` | Release script tests |
| `.kiro/agents/detection-auditor.json` | Agent: audits the detection engine |
| `.kiro/agents/pitch-writer.json` | Agent: writes the pitch |
| `.kiro/agents/sensor-engineer.json` | Agent: Android sensor work |
| `.kiro/agents/prompts/detection-auditor.md` | Prompt for the detection auditor |
| `.kiro/agents/prompts/pitch-writer.md` | Prompt for the pitch writer |
| `.kiro/agents/prompts/sensor-engineer.md` | Prompt for the sensor engineer |
| `.kiro/schedules/field-test.md` | Daily 07:00 field-test schedule |
| `.kiro/settings/cli.json` | Kiro CLI settings |
| `.kiro/settings/mcp.json` | MCP servers (documentation servers) |

### `docs/` decisions, logs and evidence

| Path | What it does |
|---|---|
| `docs/status.md` | Current milestone, gate and next step (printed at session start) |
| `docs/session-notes.md` | Open decisions and questions during a session |
| `docs/kiro-log.md` | Log of every completed task |
| `docs/traceability.md` | Requirement to property to test to task links |
| `docs/deploy.md` | How to deploy the Worker |
| `docs/mcp-servers.md` | MCP servers and agent settings |
| `docs/kiroignore.suggested` | Suggested `.kiroignore` contents |
| `docs/probe-checklist.md` | Step-by-step probe run on a phone |
| `docs/probe/2026-11-14-emu-api35.md` | Probe result: Android 15 emulator |
| `docs/probe/2026-11-15-samsung-a.md` | Probe result: Samsung phone |
| `docs/probe/2026-11-15-samsung-a.json` | Raw numbers behind the Samsung result |
| `docs/probe/2026-11-15-samsung-b.md` | Probe result: Samsung phone, second run (probe v0.0.2) |
| `docs/probe/2026-11-15-samsung-b.json` | Raw numbers behind the second Samsung result |
| `docs/wip/detection-engine-notes.md` | Working notes for the detection engine |
| `docs/adr/` | Architecture decision records 0001 to 0037, one decision each (context, decision, alternatives, consequences) |
| `docs/visual/` | Website screenshots written by `workers/api/visual/check.mjs` (390 x 844 and `-desktop` 1280 x 800) |
