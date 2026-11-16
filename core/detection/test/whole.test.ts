// Whole-engine properties P3 and P8 (design 11.2). fast-check: https://fast-check.dev/docs/core-blocks/properties/
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Decision, type Params, evaluate, initialState } from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, input, P } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { buildScenario, finalNow, permute, scenarioArb } from './helpers/scenario.ts';

const shiftDecision = (d: Decision, s: number): Decision => ({
  ...d,
  decisionTimeMs: d.decisionTimeMs + s,
  startMs: d.startMs + s,
  ...(d.restoredAtMs === undefined ? {} : { restoredAtMs: d.restoredAtMs + s }),
});

describe('P3_order_and_delay_independence', () => {
  it('P3_order_and_delay_independence: any order, any batches, any delay give the same final decisions', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 80 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 80 }),
        fc.array(fc.integer({ min: 0, max: 6 * HOUR }), { minLength: 4, maxLength: 4 }),
        (scenario, orderKeys, batchKeys, laterBy) => {
          const events = buildScenario(scenario);
          const now = finalNow(events);
          const reference = evaluate(initialState(), input(events, now), P);
          const shuffled = permute(events, orderKeys);
          let state = initialState();
          // Each event is delivered in one of four batches; batch b is received `laterBy[b]` after the previous one.
          let at = Math.min(...events.map((e) => e.eventTimeMs));
          for (let b = 0; b < 4; b++) {
            const batch = shuffled.filter((_, i) => (batchKeys[i % batchKeys.length] ?? 0) === b);
            at += laterBy[b];
            state = evaluate(state, input(batch, at), P).state;
          }
          const final = evaluate(state, input([], now), P);
          expect(final.outputs.decisions).toEqual(reference.outputs.decisions);
          expect(final.outputs.areaStatus).toEqual(reference.outputs.areaStatus);
          expect(final.outputs.spotStates).toEqual(reference.outputs.spotStates);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('P8_time_shift_invariance', () => {
  // Local time must not move: the local offset moves by -shift when the times move by +shift (see notes).
  it('P8_time_shift_invariance: shifting events, nowMs and the local offset together shifts every decision', () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer({ min: -400 * DAY_MS, max: 900 * DAY_MS }), (scenario, shift) => {
        const events = buildScenario(scenario);
        const now = finalNow(events);
        const base = evaluate(initialState(), input(events, now), P);
        const shiftedParams: Params = { ...P, localOffsetMs: P.localOffsetMs - shift };
        const shifted = evaluate(
          initialState(),
          input(
            events.map((e) => ({ ...e, eventTimeMs: e.eventTimeMs + shift })),
            now + shift,
          ),
          shiftedParams,
        );
        expect(shifted.outputs.decisions).toEqual(base.outputs.decisions.map((d) => shiftDecision(d, shift)));
        expect(shifted.outputs.areaStatus.level).toEqual(base.outputs.areaStatus.level);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P8_time_shift_invariance: the literal reading, offset and times shifted by whole days', () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer({ min: -300, max: 300 }), (scenario, days) => {
        const events = buildScenario(scenario);
        const now = finalNow(events);
        const shift = days * DAY_MS;
        const base = evaluate(initialState(), input(events, now), P);
        const shifted = evaluate(
          initialState(),
          input(
            events.map((e) => ({ ...e, eventTimeMs: e.eventTimeMs + shift })),
            now + shift,
          ),
          { ...P, localOffsetMs: P.localOffsetMs + shift },
        );
        expect(shifted.outputs.decisions).toEqual(base.outputs.decisions.map((d) => shiftDecision(d, shift)));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
