# ADR 0015: The replay builder feeds the engine an unlabeled copy of simulated events

Status: ACCEPTED 2026-11-15, under the human's blanket approval. The `simulated` flag stays on every stored and served item; only the throwaway in-memory copy drops it.

## Context
Judge mode needs frames produced by the real detection engine (web-and-area-pages R6.6, W5). The replay fixture is simulated data, and every simulated event carries `simulated: true` (testing.md, demo-mode steering). The engine ignores every event marked `simulated` (detection-engine R14, property P9), so feeding the fixture as it is gives a replay where nothing ever happens.

## Decision
`tools/sim/src/replay.ts` keeps `simulated: true` on every fixture event, label, phone and frame, and on the replay itself. Only the in-memory copy passed to `evaluate` at build time drops the flag. That engine state is thrown away after each frame; it is never stored or sent anywhere. The builder refuses a fixture with any event or label that lacks the flag.

## Alternatives
1. **A build-only engine option that accepts simulated events.** Adds a switch to `packages/detection` that the Worker could turn on by mistake. Rejected: the engine's guard should have no off switch.
2. **Unlabeled fixture events.** Breaks the labeling rule and the `demo-label-check` hook.
3. **Hand-written frames.** Breaks W5 and R6.6.

## Consequences
- P9 still holds where it matters: the Worker passes events to the engine as they arrive, so a simulated event from a phone is ignored there.
- The flag stripping lives in one function (`engineInput`) with a comment; W5 runs the same prefix through the engine independently.
