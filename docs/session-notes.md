# Session notes

Decisions and open questions go here as they arise. The pre-compaction hook adds a snapshot block below, and the post-compaction hook puts this file back into the conversation.

## Decisions
- 2026-11-14 The human delegated open decisions ("make the right decisions"). Each is recorded in an ADR or in the spec's Decisions section.
- 2026-11-14 Hooks: blocking uses exit 2; post and Stop hooks report with `HOOK FAILED:` on stdout and exit 0.
- 2026-11-15 **Blanket approval.** The human: "I give you permission to go ahead with every single thing. Make the best decision, then proceed." Agents decide, record the choice and reasons in an ADR or the spec's Decisions section, and proceed. This covers dependencies, services, stored data, thresholds, pushes to `main`, and every open question below. Privacy rules stay as written (no exact location, no personal identifiers, delete-my-data); claims discipline in `product.md` is unchanged. Only a person can: run the probe on real phones, verify OEM steps on phones, create the Cloudflare and Firebase accounts and secrets, run the Kiro IDE correctness pass, trust the workspace, create `.kiroignore`.
- 2026-11-15 ADRs 0005, 0007, 0008, 0009, 0011, 0014, 0015, 0016 are ACCEPTED under the blanket approval. ADR 0013 stays PROPOSED until the probe Result is filled. ADR 0009 routing: option 1 (code carries the shard), as the ADR recommends.
- 2026-11-15 Open questions resolved (each picks the option the text or ADR leaned to):
  - Ingest R2.5 register limit: keep it. The IP hash lives in memory only, is never stored or logged, and protects the free tier.
  - App: keep `ACCESS_NETWORK_STATE` (normal permission, needed for the Offline label). Keep the `simulated` flag in the area cache (labels demo data honestly). Stay on compileSdk 36 as `tech.md` says; no reason to move.
  - Detection: keep the P8 shift that leaves local time unchanged, and the baseline numerator over eligible installs only. Both are already built and tested.
  - Area: a scope that stops being public sends no NORMAL notice (nothing public to announce, avoids leaking a floor change). A move does not keep the phone armed (it re-arms in the new cell). The group's 3-member floor counts over all its members.
  - Web: catalog centres stay marked unchecked until a person checks them (`checkedBy`); Lekki is added when its centre is checked. The page already works without it.
  - Onboarding: skip notifications, battery, self-test and Station offer when everything is already set (shorter, and the settings screen can redo each step).
  - Privacy strings: keep the single `privacy-guard:allow` marker on the privacy notice in `strings.xml`; it states what is not collected.
  - Kiro Web hooks location, `.kiroignore`: unresolved by an agent. `.kiroignore` is a human item (write denied by a permission rule).
  - D5 settle reading (closed outage kept until start + 12 h): accepted; design section 8 amended to say "start + 12 h" in a later doc pass.
  - Eligible-drop definition for co-outage records (UNPLUG events within one window of the outage start, merged by start time): accepted.
  - Area actor storage in one SQLite table `area_model`: accepted, same data as the design lists.
  - Area pushes counted and dropped until the push sender exists: accepted.
  - Web: `/judge` is routed now (tasks 9 and 10 done); install values stay Worker vars; the release-apk skill's `wrangler.toml` mention should read `wrangler.jsonc` (fix when that skill is next touched).
  - Replay builder (ADR 0015) and Judge service worker (ADR 0016): accepted.
  - Miss armed count (field-telemetry task 3): per cell, as built. It is the smallest scope, so it never overstates armed phones; R5.5 should read "in its cell".

## Handoff for the next session (2026-11-14, evening)
- Everything is on GitHub. `main` is green. The unfinished detection engine is on branch `wip/detection-engine` (126 of 128 tests pass; `D5_settle_equivalence` fails with seed 1989584878). Its notes are in `docs/wip/detection-engine-notes.md` on that branch. Do not merge until D5 passes, `node .kiro/scripts/detection-audit.mjs` is clean and `node .kiro/scripts/traceability.mjs --check` passes.
- Start of a new Kiro Web session:
  1. `bash .kiro/scripts/link-workspace-root.sh`, so Kiro loads steering, hooks, skills and agents. They are active from the next message.
  2. `.kiro/scripts/android-sandbox.sh setup` if the Android SDK is gone (it lives outside the repo in `/projects/sandbox/.toolchain`).
  3. Install dependencies from the repo root with `npm ci`, without a redirect.
- Done: probe 1 to 7, event-ingest 1 to 5 and 7 to 9, app-shell 1 to 8, area-cells 1 and 2, web-and-area-pages 2, 3, 4 and 6, onboarding 3 and 4, alerts 2. Built but unticked: area-cells 3, 7 and 8 (code and tests pass), web task 5 (needs a deployed domain). Details are in `docs/kiro-log.md`.

## Review follow-up 2026-11-15 (task-merge-d5-and-continue review)
- Fixed review issue 1: `AreaActor.deleteInstall` now drains the outbox (`afterChange`). Model-level test in `area-model.test.ts` covers the queued public-index removal. No actor-level test: a published area needs a 3-phone outage in the runtime, which the integration test does not build.
- Review issue 4 (notice loss): by design. Notices are idempotent and latest-wins (A6), removals retry on the next move, only the public-index batch is requeued. No change.
- ADR 0014 and ADR 0015: ACCEPTED 2026-11-15 under the blanket approval.
- Open for the orchestrator: merge `work/detection-d5` into `main` and push (definition of done item 7).
- area-cells task 12 is partly done: README and traceability (A1 to A12) exist. Still open: ADR 0006 addendum with measured startup and CPU numbers (needs the detection-engine task 17 benchmark and a deployed measurement).

## field-telemetry tasks 1 to 3 (2026-11-15)
- Answered by the human on 2026-11-15 ("yes to all"): questions 1 to 4 below (maker gate accepts Samsung, gap edges, `withdrawn` and `key` on `OUTAGE_RECORD`, stored `fieldSent` and `missPending` within ADR 0011). Applied: `GATE_OEM_MAKERS` now includes Samsung, R10.1 and design section 4 updated. The miss armed count is per cell (decided 2026-11-15).
- [ANSWERED yes, 2026-11-15] Task 2 assumption: the field delay gate pools job and receiver scheduling delays; the field maker gate is Tecno or Infinix only (R10.1) while the probe gate also accepts Samsung (ADR 0013). Confirm whether the field gate should accept Samsung too (`GATE_OEM_MAKERS` in `core/shared/src/field-metrics.ts`).
- [ANSWERED yes, 2026-11-15] Task 1 assumption: gap histogram edges are 1, 5, 15, 60 and 240 minutes plus an open-ended bucket (`GAP_EDGES_MS`). Design says only "fixed edges". The Kotlin aggregator (task 4) must use the same edges.
- [ANSWERED yes, 2026-11-15] Task 3: `OUTAGE_RECORD` has one field not in design section 4: `withdrawn` (boolean). Without it an all-"No" false alarm cannot be reported, because the engine drops the outage. Confirm, or pick another way. The record also has `key` (opaque hash) so a later update replaces the earlier one.
- [ANSWERED yes, 2026-11-15] Task 3 stored data: the area actor state gains `fieldSent` (per reported outage: opaque key, scope key, cells, start, last counts) and `missPending` (install ID, unplug seq, due time, removed by delete-my-data). Both hold only what the actor's log and engine states already hold, inside the same actor, for at most 30 days (`fieldSent`) or one window (`missPending`). The emitted records themselves are not stored anywhere yet (task 5, ADR 0011). Confirm this is within ADR 0011.
- [DECIDED per cell, 2026-11-15] Task 3: the miss armed count is the "recently armed" members in the unplug's cell at the time the miss is resolved (one window after the unplug).
- `web` integration test needs `XDG_CONFIG_HOME` writable in this sandbox (wrangler writes `~/.config/.wrangler`); without it the suite fails on main too. CI is unaffected.

## 2026-11-15 detection-engine task 17 (benchmark)
- Assumption: the free-plan Durable Object budget is 10 ms CPU per call. The DO limits table says 30 s, but its FAQ says Durable Objects follow the Worker plan's per-invocation limit (Free: 10 ms). We use the stricter reading.
- Assumption: "live events" means events inside the horizon held in one engine state; the timed call is one evaluate() with one new event.
- Numbers come from the sandbox VM, not CI or workerd. Re-measure on the deployed Worker for ADR 0006 (area-cells task 12).
- Open for the human: 5,000 live events exceed 10 ms (up to about 179 ms at 500 phones). No D1 follow-up opened, since the task's rule is about 500 events. Decide whether to open it now or wait for field counts.

## 2026-11-15 demo-mode tasks 2 and 3 (work/demo-mode-2-3)
- Task 2 assumption: the scanner does not look for email or phone-number shapes. `privacy-guard` blocks those words in source, and the fixture schema cannot hold them. If the human wants them scanned, the patterns need a reviewed allow marker.
- Task 2 assumption: a raw recording spanning two res-7 parents is refused, because the fixture format has one `cell`.
- Task 3 assumption: the engine run uses a nominal 5 min between the judge's unplug and replug. The phone plays replug frames at the judge's real replug time plus the frame offset, so the judge's real outage length does not change the frames. Restore is decided by quorum of replugs in the engine run; if a later engine change makes restore depend on the outage length, the build test fails.
- Task 3 assumption: margin means 2 extra drops over the smallest confirming number (the requirements' 7 drops against 5 needed), and the plan starts at 10 armed phones. Both are options of `demoPlan`, not thresholds.
- Task 3: the judge's drop is the `judgeEvent` marker on a frame, so no frame lists a non-simulated event (DM5 reading: "exactly one real drop" is the live unplug the phone waits for).

## 2026-11-15 probe job-restart fix (work/probe-immediate-reschedule)
- First Samsung probe run saved (`docs/probe/2026-11-15-samsung-a.json/.md`): armed 17.7% over 9.43 h; cause was `onStopJob` returning true (OS exponential backoff, doubling gaps), not the sensor idea. Fixed: return false + reschedule a fresh job (ADR 0001 addendum has the measured facts). `RestartPolicy` + JVM test added. Probe bumped to 0.0.2; orchestrator pushes tag `probe-v0.0.2`.
- Open for the human (not permission; needs a device): install the new APK and rerun the everyday-mode checklist to reach 12 h and re-measure armed time. feasibility-probe task 8 stays unticked.
- Still-open risk, separate from the backoff bug: arming after plug-in is slow on the Samsung too (~28 min, ~17 min; 0 of 5 within 10 min), matching the emulator. If the rerun still fails M1/M2, this points at Station mode (ADR 0004) as primary sensor, a task-9 decision for the human.

## 2026-11-15 event-ingest task 6 (work/ingest-6-powerlog-3): Uploader
- Decision: the Uploader reads `PendingEvent` from an `OutboxPort`, not the `SensorEvent` named in design section 9, because `sensor-android` is not built (its spec waits for the probe rerun) and this task must not build the sensor. `PendingEvent` is the Outbox-to-Uploader contract; event-ingest task 10 adapts the real `SensorEvent` to it and supplies the real `Transport`. No threshold, privacy or money decision, so recorded here rather than in an ADR.
- Decision (client tunables, not detection thresholds): back-off is full-jitter exponential with `backoffBaseMs=1000`, `backoffCapMs=300000`. The design fixes `MAX_BATCH_EVENTS=100` and client `STATE_MAX_WAIT_MS=900000` but leaves the client back-off envelope to the client; these values sit in `UploaderConfig` and can change freely (design section 4 rule).
- `elapsedMs` is computed as `sendElapsed - recordedElapsedMs` with one `sendElapsed` per batch (R9.6). The Outbox supplies `recordedElapsedMs` (a monotonic reference); task 10's sensor adapter maps the stored elapsed column to it.
- Not verified on a device or a real network: only JVM unit tests with a fake transport. The real HTTP transport, 401/registration handling and wiring to the sensor are event-ingest task 10.

## 2026-11-15 power-log task 3 (work/ingest-6-powerlog-3): band config
- Decision (ADR 0020): `bands.json` ships A 20, B 16, C 12, D 8, E 4 hours/day. Only Band C is marked verified (NERC 2021 notice fixes the 12 h floor via the D/E < 12 h boundary). A, B, D, E are unverified with sources; the human must confirm them against NERC's MYTO order PDFs (unreadable by the build tooling) before release. UI/Stats must treat unverified bands as unconfirmed; promise copy is always an estimate and never mentions refund, compensation or claim.
- Band config lives as an app asset (`app.outage.log.BandConfig`), not in core/shared: it is phone-only (the Worker never shows supply promise), so no shared single-source copy is needed and no build-time asset copy was added.

## 2026-11-15 field-telemetry tasks 5 to 7 (work/field-telemetry-5-7)
- Decision: the scheduled Kiro Web run opens a pull request; it cannot commit to `main` (ADR 0018). R7.3 amended.
- Decision: report rules the spec left open are in ADR 0017 (ARMED_CRITICAL supersedes LOW per class and day, outage signatures use `other:unknown:normal`, UPLOAD_GAP at two missing days, gap reasons printed only if safe).
- Open for the human: deploy the Worker (migration v4), `wrangler secret put FIELD_READ_TOKEN`, create the schedule in app.kiro.dev from `.kiro/schedules/field-test.md`. Task 4 (phone aggregator) is not done, so no real device-day exists yet.
- Note for the orchestrator: a kill-criterion line from one phone and 9 h of charging is what `evaluateGates` (task 2) returns; the probe note called the same run INCOMPLETE. Left as the spec says (R10.2); the report prints the hours so a reader can see the data is thin.

## 2026-11-21 verify LGA picker and share card removal
- Decision: the picture share card is gone (commit 9fe8b88). ADR 0040 is marked superseded; the text share stays.
- Decision: website download buttons are plain text, no icon.
- Fixed ADR 0056 spec-lint: it now has an Alternatives section (GPS, hand-placed areas, wards-only grid, NIPOST API).

## 2026-11-21 Lagos places proof and web status
- Added `core/shared/test/places.test.ts`: 20 LGAs numbered alphabetically (LA-01 to LA-20), 376 wards, 4,968 land hexes each owned by one ward and one LGA, valid res-8 anchors inside their ward (35 hexless wards anchor in a neighbour), a geo ring per hex, no postcode stored. Removing a ward, moving an anchor or swapping two postcode numbers makes it fail.
- Web ingest checks cells with `isValidRes8Cell` only, so any Lagos land hex is accepted. No change needed.
- Still on the old nine-area catalog (another agent is converting it, not touched here): `web/areas/catalog/` (source, generated JSON, schema), `web/worker.ts` (CATALOG, LISTED_AREAS), `web/routes.ts` (sitemap and map areas), `web/api/map/map-json.ts`, `web/areas/map-svg.ts`, `web/landing/landing.ts`, and their tests in `web/test/`.

## 2026-11-21 web converted to Lagos LGAs and wards (ADR 0056)
- The web catalog is now the 20 LGAs and 376 wards from `core/shared/fixtures/places/lagos-places.json`. `node web/areas/catalog/generate.mjs` builds `catalog.generated.json` (396 areas, about 310 KB) and `outlines.generated.json` (LGA outlines only, about 50 KB). `catalog.source.json` is gone. Ward names read "Ward, LGA". A ward smaller than a hex uses its anchor hex as its one cell.
- `/areas` draws the 20 LGA outlines (one path each, not one per hex), lists the LGAs, and has a plain search form (`/areas?q=`). `/area/<slug>` works for LGAs and wards: an LGA page lists its wards, a ward page links to its LGA. `GET /api/v1/public/search?q=` finds an LGA or ward by name or alternative name. The sitemap lists all 396 pages.
- Decision: `/api/map.json` and `/api/v1/public/map` carry the 20 LGAs (4,968 cells), not wards, to keep them small. Ward geometry stays out of the Worker.
- Decision: all areas are listed (checked) because the data is the official GRID3 boundaries accepted in ADR 0056. The `checkedBy` gate still exists in the code.
- Not changed on purpose: the simulated city (landing page map, `/app/simulate`, `demo-city.json`, `DemoCity.kt`) is made-up data with its own places. Its nine place coordinates moved into `tools/sim/scripts/build-demo-city.mjs`, and the output is identical. `core/shared/fixtures/map/map.json` is the Kotlin parser contract and keeps its own sample area, so the web tests read their area from that file.

## 2026-11-21 one History screen (ADR 0057)
- Insights and Power Log are now one History screen (third tab). One score function, `Stats.scoreOf`; no score before 7 days with enough data, only "Day N of 7" and a bar. Old links `log` and `insights` open History. Removed the `insights` package, `InsightsScreen` and `InsightsTest`.
- Read commits 81042dd and 7093f27. Now re-reads on plug change (`AndroidPlugObserver` through `RefreshOnPlugOrSensor`, with rechecks at 0, 0.4 and 1.5 s) and on every sensor event and start or stop (`SensorPulse`). Today meter reads `PowerLogView.todayWatchedPowerHours`; the Light Alarm row reads `AlarmHost.state()`. Both are real, nothing to remove. No problems found.
- Tests: score at 0, 6, 7 and 20 days, month score maths, Now reading new sensor state after a plug change (a fake source in `HomeReducerTest`). A view model test with a fake plug observer needs `kotlinx-coroutines-test` or Robolectric, which are not in the build, so it was not added.

## 2026-11-21 cut list (ADR 0058)
- Cut Freezer Guard, the tariff band and promise check, the diagnostics settings screen, the web Insights tab and the demo Settings rows that only said "On the phone this opens...". The telemetry opt-in stays (first run and Delete my data). Old `/app/insights` links still redirect.

## 2026-11-21 polish (ADR 0059)
- Screenshots of Now, the spot picker and History are made on the JVM with Robolectric and saved in `docs/visual/android-*.png` (ADR 0059). Roborazzi and kotlinx-coroutines-test were allowed but not needed, so they are not added. The Map tab cannot be drawn on the JVM (MapLibre is native code), so it has no screenshot.
- Hexless ward anchors: `tools/places/build_lagos.py` now stops if a ward with no hex of its own gets an anchor more than 500 m from the ward. The GRID3 file was downloaded and the script re-run: the fixtures came out byte for byte the same, so no Android or web catalog copy changed. The widest of the 35 is 384 m. `places.test.ts` checks the 500 m limit and the old 25-step rule is now 5 steps.
- `places.test.ts`: the weak "exactly one cell" test is replaced by one that checks every cell has one ward, every anchor resolves back to its ward, the land cells equal the map file, two known points fall in Ikeja and Surulere, and open sea has no ward.
- ADR 0040 now reads as history: the picture card is described in the past tense and as removed.
- Wording: the 30-day bar hint is now "Tap a day. A dashed line means not enough data that day." The empty map now says "The map fills in as phones near you report. Connect to the internet once to load it."
- Icons: `freezer` is removed from `core/shared/design/icons.json` and `tools/icon/lucide.mjs`, and `ic_sym_chart.xml` is generated again. The web still uses `chart`, and the icon test needs every generated file present. That test failed after the cut list commit and passes now.
- Known flaky test: `.kiro/scripts/test/post-deploy-check.test.mjs` fails now and then on the base commit as well. It was not changed here.

## 2026-11-21 CI fix: /areas map tap targets
- The visual check failed on /areas at 390 and 1280 px because each LGA outline on the map was a link, and many LGAs are smaller than 44 px. The check was not changed.
- Decision: the map is now a picture only. Outlines are plain paths (no links, no `<title>`) and the SVG is `aria-hidden`. The "Local governments" list under the map already links every LGA with its state, so nothing is lost for keyboard or screen reader users. Removed the map link hover style. Tests in `web/test/web-map.test.ts` updated.
- Could not run `web/visual/run.sh` here: Chromium installed, but the sandbox blocks starting `wrangler dev`. Typecheck, lint and TS tests pass. CI will confirm.

## 2026-11-21 all 20 LGAs on every map
- The data was never missing: lagos-geo.json and the web outlines hold all 20 LGAs, Epe included (the "missing" LGAs in the CI log were only the small-tap-target list). The real problem was the view. The Android Map tab opened at zoom 10.2 centred on Lagos, about 27 km wide, so Epe, Ibeju-Lekki, Badagry and Ojo were off screen. The web street maps (landing, simulation) drew only the 10 simulated places and no LGAs at all.
- Android: the Map tab now opens fitted to the box around every LGA outline (`PlacesGeo.lagosCorners`), and the "my location" button does the same when there is no spot. Test in `PlacesTest` checks all 20 outlines sit inside that box.
- Web street maps: new `/lga-outlines.json` (`web/areas/lga-geojson.ts`) with the 20 outlines, names and the box around them. `map.js` draws dashed LGA borders and names, and the landing map and the simulation's "no spot" view open fitted to all of Lagos.
- Tests in `web/test/lga-geojson.test.ts`: all 20 names in the /areas SVG, every path point inside its view box, 20 links, and the street-map box covers every LGA cell.
- Not run: `web/visual/run.sh` (wrangler dev does not start here) and a device check of the MapLibre fit.

## 2026-11-21 hex grid across all of Lagos on every map
- The user wants to see the hex grid itself over the whole of Lagos, not only LGA borders. All 4,968 land hexes (H3 resolution 8) are now drawn as thin lines on the Android Map tab, the web landing and simulation street maps (one `map.js` serves both, and the live map), and the /areas SVG. LGA borders and names stay on top.
- Decision: one MultiLineString where each edge shared by two hexes is written once (about 15,000 edges, not 30,000 ring sides), coordinates rounded to 5 decimals (about 1 m). Web: new `/lga-grid.json` (`web/areas/lga-grid.ts`), built once per Worker instance and cached for a day; about 790 KB raw, compresses well. Android builds the same lines once from the bundled `lagos-geo.json` (`HexGeoJson.grid`) in a single line layer under the outlines.
- /areas: the grid is one extra non-interactive `<path class="grid">`, so the 44 px tap-target check is unaffected.
- Grid lines fade in from zoom 6 (web) and get thicker as you zoom in; they are thin ink lines at 40% opacity so power colours and street names stay readable.
- Tests: `web/test/lga-geojson.test.ts` checks all 4,968 cells and every hex edge are in the served grid; `PlacesTest` checks the same for the Android grid layer data.
- Not run: `web/visual/run.sh` (wrangler dev) and a device check. `npm run lint` already reports errors in untouched files (fcm.ts, sender.ts, store.ts, generated JSON); my files pass biome. Android `:app:testDebugUnitTest`: 223 of 224 pass; the one failure is a Robolectric test that cannot create `/root/.m2` in the sandbox.

## 2026-11-21 tab bar centred, simulation runs on every place in Lagos (ADR 0060 idea, no new ADR file)
- Dock cause: when Insights was cut (ADR 0058) the phone tab bar in `web/ui/app/design.ts` kept `repeat(4, ...)` columns for 3 buttons, so they sat in the left three quarters. It is now `repeat(3, ...)`. A test checks the column count equals the number of tabs, and `web/visual/check.mjs` measures the left and right gaps. I also measured it in headless Chromium at 390 px wide: 8 px each side.
- Simulation: it no longer uses the nine made-up places. New `/lagos-sim.json` (`web/ui/simulate/lagos-sim.ts`) carries all 20 LGAs, 376 wards and 4,968 blocks with their corners: 485 KB raw, 87 KB gzipped, cached for a day, cached by the service worker too (cache name `sim-v8`). `web/public/js/places.js` turns it into places (pure code, unit tested).
- Ways to pick: three drop-downs on Now (LGA, then ward, then block), search by LGA or ward name, the LGA and ward lists in the area sheet, and tapping any block on the map. "Simulate a blackout here" in the sheet picks and starts in one tap.
- Decision: a block simulates itself and the blocks next door (about 1.1 km), a ward its own blocks, an LGA all its blocks. The outage replay and its states are unchanged. All blocks start as "no data" except the chosen place, which starts as "on".
- Decision: the old per-area "Last 30 days" numbers are gone from the sheet, because that history was made up for the nine old places and is not made for 376 wards. `data.js` still exists.
- Not changed: `/demo-city.json`, the Android demo city and the landing page hero map still use the old nine places (the Android code is generated from the same file). Say if you want the landing page switched too.
- "Use my location" in the welcome box is now "Choose a place" because the old one just picked Yaba.
- Not run: `web/visual/run.sh` (wrangler dev) and the Android tests (no shared code changed).

## 2026-11-22 dock, colours and map start (web)
- Measured on the live site in headless Chromium: the tab bar is full width with equal 8 px gaps at 360, 390, 412 and 768 px. So a fresh load is centred. The likely reason it still looked off centre: `/app.css` and the scripts keep the same address and were cached for an hour, and the service worker's "network first" fetch was answered from that same browser cache. Old 4-column CSS stayed on some phones after a deploy.
- Fix for the cause: every page now links `/app.css?v=<fingerprint of the stylesheet>`, so a changed stylesheet is a new address. The service worker cache is named after the same fingerprint and really asks the network (`cache: 'no-cache'`). The scripts in `/js/` are now sent with `Cache-Control: no-cache` (the browser asks each time, a quick 304 if nothing changed). Decision: no per-file hash on the scripts, because the Worker cannot read the files in `public/` at build time here.
- Tab bar CSS no longer counts buttons: equal columns for however many there are, plus side padding for the phone's safe area. The computer view is still a left column.
- Colours: new `core/shared/fixtures/places/lagos-states.json` (made by `tools/sim/scripts/build-lagos-states.mjs`, same every build) gives every one of the 4,968 blocks a made-up state: mostly on, patches of out, maybe and back in every local government, and about 2% no data on the edges. `/lagos-sim.json` carries it, the web map and the landing map use it. The chosen place still starts "on" so the blackout can cut it. The Android app will read the same file.
- Landing map now draws all Lagos blocks, not the nine old areas. The Now card there is Eti-Osa.
- Map start: every web map opens on the Lagos box from the first frame (and again once the page has its size), and cannot zoom out past zoom 7. It no longer starts as a world globe, even if `/lga-outlines.json` fails.
- Checked with `wrangler dev` and `web/visual/check.mjs` (now measures the dock gaps, middle button, map start and coloured cells). Looked at the 390 and 1280 shots: dock centred, whole of Lagos coloured, map on Lagos. On a tall phone, Lagos fills the width and shows a lot of land above it, because the state is wide and low.
- Follow-up: the Map tab now refits Lagos whenever the map changes size (tab switch, window resize) until the person moves the map or picks a place, so at 1280 Lagos fills the width (it was half). On phones the side padding is 8 px. The big "Power is on" card on the landing page had lost its style rules in an earlier clean-up (no background, centred, huge); they are back, text is left-aligned, the map credit sits at the top on phones, and the hero map keeps Lagos above the card. The visual check now tests all of this.

## 2026-11-22 Android catches up with the website
- The Map tab in demo mode now draws all 4,968 Lagos blocks, coloured from `core/shared/fixtures/places/lagos-states.json`, the same file the website reads. The 20 local governments are the areas. The nine made-up places (`DemoCity.kt`) are gone, and `build-demo-city.mjs` no longer writes Kotlin (it still writes `demo-city.json` for the landing page). The first-run picture map uses the same Lagos blocks.
- The build now copies `lagos-states.json` into the app's assets next to the other two places files.
- Opening view: the map view is created with the Lagos camera (zoom 8) and a minimum zoom of 7, so the first frame is Lagos and never the world. The box is the website's: lng 2.7 to 4.37, lat 6.36 to 6.71 (`LAGOS_BOUNDS`).
- The Map tab keeps the map on screen while loading, when there is nothing to show and after a failed load. The message is a small card over the map instead of a blank page.
- Simulated blackout on the Map tab, like the website: search an LGA or a ward, or tap a block, then press "Simulate a blackout here" in the sheet. A block runs on itself and the blocks next to it (about 1.1 km), a ward on its own blocks, an LGA on all of its blocks. The recorded replay then changes their colours over time, with the same pacing as the website. Until a place is chosen a card says "Choose a place". The words On, Maybe, Out, Back and No data are used on the state buttons.
- Decision: the rules live in `map/BlackoutSim.kt` (not in the demo package, because the demo package may only read the replay file). Tie order among equally near blocks can differ from the website, the set of blocks is the same.
- Not done: the three drop-downs (LGA, ward, block) of the website's Now tab are not copied. Android already has the LGA and ward picker for the real spot, and the Map tab uses search and tapping. The Now tab on the phone still shows the real engine's answer and is not driven by the simulation.
- Not checked: no emulator here and MapLibre does not draw on the JVM, so the camera, the colours and the replay on the map were not seen. Tests cover the data, the target rules, the pacing and the camera box. `ScreenshotTest` still fails here because Robolectric cannot make `/root/.m2` (same as before).
