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
- [ANSWERED yes, 2026-11-15] Task 2 assumption: the field delay gate pools job and receiver scheduling delays; the field maker gate is Tecno or Infinix only (R10.1) while the probe gate also accepts Samsung (ADR 0013). Confirm whether the field gate should accept Samsung too (`GATE_OEM_MAKERS` in `packages/shared/src/field-metrics.ts`).
- [ANSWERED yes, 2026-11-15] Task 1 assumption: gap histogram edges are 1, 5, 15, 60 and 240 minutes plus an open-ended bucket (`GAP_EDGES_MS`). Design says only "fixed edges". The Kotlin aggregator (task 4) must use the same edges.
- [ANSWERED yes, 2026-11-15] Task 3: `OUTAGE_RECORD` has one field not in design section 4: `withdrawn` (boolean). Without it an all-"No" false alarm cannot be reported, because the engine drops the outage. Confirm, or pick another way. The record also has `key` (opaque hash) so a later update replaces the earlier one.
- [ANSWERED yes, 2026-11-15] Task 3 stored data: the area actor state gains `fieldSent` (per reported outage: opaque key, scope key, cells, start, last counts) and `missPending` (install ID, unplug seq, due time, removed by delete-my-data). Both hold only what the actor's log and engine states already hold, inside the same actor, for at most 30 days (`fieldSent`) or one window (`missPending`). The emitted records themselves are not stored anywhere yet (task 5, ADR 0011). Confirm this is within ADR 0011.
- [DECIDED per cell, 2026-11-15] Task 3: the miss armed count is the "recently armed" members in the unplug's cell at the time the miss is resolved (one window after the unplug).
- `workers/api` integration test needs `XDG_CONFIG_HOME` writable in this sandbox (wrangler writes `~/.config/.wrangler`); without it the suite fails on main too. CI is unaffected.

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
