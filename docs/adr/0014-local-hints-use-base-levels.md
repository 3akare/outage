# ADR 0014: Same-parent hints use base levels, with one re-hint pass

Status: PROPOSED (2026-11-14). Needs the human: it bends R11.4 ("each scope at most once per request").

## Context
area-cells R7.5 passes neighbor and linked levels to the engine as hints. For cells in the same parent the area actor reads them from its own scopes. The first reducer read the levels of the previous evaluation. Property A12 (deferred state-only batches give the same decisions as evaluating every batch) then failed: fast-check seed 1278203691, counterexample `n 4, dropping 3, cells c1 and c2, cut at 6`. Eager evaluation runs more rounds, so a neighbor's level reaches a cell one round earlier, and the cell gets a RAISED decision that the deferred run does not have. The design's claim in section 9 ("every scope is pure") ignored the hint context.

## Decision
1. A local hint is a scope's **base level**: its level with every hint-raised CONFIRMED counted as POSSIBLE. It depends only on that scope's events and the time. Hints therefore never chain from one hinted scope to the next.
2. After the normal evaluations of a request (and after a new GROUP engine is built), any scope whose hint context differs from the context of its last evaluation is evaluated once more on its retained events. Base levels do not depend on hints, so one pass reaches the fixed point.
3. Pushes from both runs are kept; the engine's push record stops a repeat.

## Alternatives
1. **Keep previous-round levels.** Simplest and strictly once per scope, but A12 and R11.3 fail: decisions would depend on how batches were cut.
2. **Apply local hints in the Worker after the engine runs.** One evaluation per scope, but it reimplements the engine's hint and push rules outside `packages/detection`, which `structure.md` forbids.
3. **Drop same-parent hints.** The parent scope already pools the seven cells, so the loss is small, but R7.5 asks for them.

## Consequences
- A scope can be evaluated twice in one request, only when another scope's base level changed (in practice at the start and end of an outage). `evaluated` in the reducer output lists both runs, so the counters show it.
- The CPU benchmark (detection-engine task 17) must count the re-hint pass.
- The human decides whether R11.4 is amended to "at most once per request, plus one re-hint pass", or whether alternative 3 is preferred.
