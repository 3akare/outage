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
