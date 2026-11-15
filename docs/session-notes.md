# Session notes

Decisions and open questions go here as they arise. The pre-compaction hook adds a snapshot block below, and the post-compaction hook puts this file back into the conversation.

## Decisions
- 2026-11-14 The human delegated open decisions ("make the right decisions"). Each is recorded in an ADR or in the spec's Decisions section.
- 2026-11-14 Hooks: blocking uses exit 2; post and Stop hooks report with `HOOK FAILED:` on stdout and exit 0.

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
