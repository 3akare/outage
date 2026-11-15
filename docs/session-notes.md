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
