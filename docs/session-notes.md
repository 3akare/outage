# Session notes

Decisions and open questions go here as they arise. The pre-compaction hook adds a snapshot block below, and the post-compaction hook puts this file back into the conversation.

## Decisions
- 2026-11-14 The human delegated open decisions ("make the right decisions"). Each is recorded in an ADR or in the spec's Decisions section.
- 2026-11-14 Hooks: blocking uses exit 2; post and Stop hooks report with `HOOK FAILED:` on stdout and exit 0.

## Handoff for the next session (2026-11-14, evening)
- Everything is on GitHub. `main` is green. The unfinished detection engine is on branch `wip/detection-engine` (126 of 128 tests pass; `D5_settle_equivalence` fails with seed 1989584878). Its notes are in `docs/wip/detection-engine-notes.md` on that branch. Do not merge until D5 passes, `node .kiro/scripts/detection-audit.mjs` is clean and `node .kiro/scripts/traceability.mjs --check` passes.
- Start of a new Kiro Web session:
  1. `bash .kiro/scripts/link-workspace-root.sh`, so Kiro loads steering, hooks, skills and agents. They are active from the next message.
  2. `.kiro/scripts/android-sandbox.sh setup` if the Android SDK is gone (it lives outside the repo in `/projects/sandbox/.toolchain`).
  3. Install dependencies from the repo root with `npm ci`, without a redirect.
- Done: probe 1 to 7, event-ingest 1 to 5 and 7 to 9, app-shell 1 to 8, area-cells 1 and 2, web-and-area-pages 2, 3, 4 and 6, onboarding 3 and 4, alerts 2. Built but unticked: area-cells 3, 7 and 8 (code and tests pass), web task 5 (needs a deployed domain). Details are in `docs/kiro-log.md`.

## Open questions for the human (collected 2026-11-14)
- Ingest R2.5: the register limit hashes `cf-connecting-ip` in memory (never stored or logged). Keep it or drop the limit?
- App: `ACCESS_NETWORK_STATE` (normal permission) for the Offline label; the area cache stores a `simulated` flag; move to compileSdk 37 for the newest Compose?
- Detection: the P8 time shift moves the local offset by minus the shift, which keeps local time unchanged (the spec says "the same constant"); the baseline numerator counts eligible installs only.
- Area: does a scope that stops being public send a NORMAL notice? Does a move keep the phone armed? Is the group's 3-member floor counted over all its members?
- Web: a person must check each catalog centre (`checkedBy`); Lekki is missing.
- Onboarding: the re-onboarding skip rule (skip notifications, battery, self-test and Station offer when everything is already set).
- Privacy strings in the app: one `privacy-guard:allow` marker on the privacy notice in `strings.xml` (it says no phone number or email is collected).

## Open questions
- Does Kiro Web load `.kiro/hooks` from the repo folder (`/projects/sandbox/outage`) or only from the workspace root (`/projects/sandbox`)? Check with Configuration Sync.
- `.kiroignore` is still missing (write denied for the agent).
- 2026-11-14 D5 fixed: settle keeps a closed outage until start + 12 h (design 8 says 'end'; the D5 test uses start + 12 h). Confirm this reading of design section 8 and amend the text.
- 2026-11-14 area-cells task 9: A12 failed with previous-round hints (seed 1278203691). Fixed by base-level hints plus one re-hint pass (ADR 0014). This bends R11.4 (a scope may run twice in a request). The human decides: amend R11.4, or drop same-parent hints.
- 2026-11-14 area-cells task 9: co-outage records for linking are built from UNPLUG events within one detection window of the outage start, per cell, and one blackout seen by several scopes is merged by start time within one window. Confirm this definition of "eligible drop".
- 2026-11-14 area-cells task 10: the area model is stored in one SQLite table `area_model` (rows per field, engine states split into 16 install buckets) instead of the seven tables drawn in design section 10. The data is the same as the design lists (members with cell and weight, per-scope engine states, co-outage counts, links, notices, episodes, public history) plus the area's event log with cells, which the engine states already hold without cells. No new kind of data. Confirm, or ask for the separate tables.
- 2026-11-14 area-cells task 10: pushes from the area actor are counted and dropped until alerts-and-light-alarm provides the push sender (R10.3).
- 2026-11-14 web task 8: `/judge` and `/api/v1/public/judge/replay` are not routed yet (tasks 9 and 10), so the footer link to Judge mode gives the 404 page until then. The install values are Worker vars `APK_URL`, `APK_VERSION`, `APK_SIZE_BYTES`, `APK_SHA256` and `SITE_ORIGIN` (unset: the page says the app is not published). The release-apk skill still says `wrangler.toml`; the repo uses `wrangler.jsonc`.
- 2026-11-14 web task 9: the replay builder strips `simulated` only on the copy it passes to the engine at build time (ADR 0015, PROPOSED). Confirm. The replay is SYNTHETIC with 0 real devices until the field test records an outage. `replay.json` is written to `packages/shared/fixtures/` so the app (demo-mode) and the Worker (task 10) can read the same file. tools/sim is now an npm workspace.

## Review follow-up 2026-11-15 (task-merge-d5-and-continue review)
- Fixed review issue 1: `AreaActor.deleteInstall` now drains the outbox (`afterChange`). Model-level test in `area-model.test.ts` covers the queued public-index removal. No actor-level test: a published area needs a 3-phone outage in the runtime, which the integration test does not build.
- Review issue 4 (notice loss): by design. Notices are idempotent and latest-wins (A6), removals retry on the next move, only the public-index batch is requeued. No change.
- Open for the human: ADR 0014 (re-hint pass vs R11.4), ADR 0015 (replay builder strips `simulated` on the engine copy). Both stay PROPOSED.
- Open for the orchestrator: merge `work/detection-d5` into `main` and push (definition of done item 7).
- area-cells task 12 is partly done: README and traceability (A1 to A12) exist. Still open: ADR 0006 addendum with measured startup and CPU numbers (needs the detection-engine task 17 benchmark and a deployed measurement).
