# @outage/detection

Pure TypeScript detection engine. It runs only in the Worker and in `tools/sim`. The phone never runs it.

## Contract

```ts
evaluate(state: EngineState, input: EngineInput, params: Params): { state: EngineState; outputs: EngineOutputs }
```

- No I/O, no `Date.now()`, no randomness, no mutation of arguments. The clock is `input.nowMs`.
- Decisions are a pure function of the retained event set and `nowMs`, not of arrival order.
- Every decision carries an `Explanation` (counts, baseline, probability, thresholds) so the UI can show why.
- `settle` folds old days into compact state; `removeInstall` implements delete-my-data; `migrate` upgrades stored state.
- Parameters live in `src/params.ts` (ADR 0005). `assertParams` rejects impossible values. Do not change a threshold without the human.
- Shared types (`EngineEvent`, `Label`, `Context`, `Decision`, `Explanation`) live in `core/shared/src/engine.ts`.

## Golden fixtures

`fixtures/*.json` holds recorded real outages. `test/golden.test.ts` replays each one and compares the full decision list. The folder is empty until the field test records a fixture (see `fixtures/README.md`).

## Where to read more

- Spec: `.kiro/specs/detection-engine/` (requirements, design, tasks).
- Algorithm and properties P1 to P12, D1 to D6: `.kiro/steering/detection.md`.
- Tests: `npm test --workspace @outage/detection` (set `FC_NUM_RUNS=2000` for the CI run count).
