// Task 6: merge and normalize (R2, R14). Properties P4 and P9 (input side).
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type EngineEvent, evaluate, initialState } from '../src/index.ts';
import { eventProblem, mergeInputs } from '../src/merge.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P, replugAll, unplugAll } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { buildScenario, finalNow, permute, scenarioArb } from './helpers/scenario.ts';

describe('P4_duplicates_change_nothing', () => {
  it('P4_duplicates_change_nothing: repeating events in the same call changes nothing', () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(fc.nat(500), { maxLength: 60 }), (scenario, picks) => {
        const events = buildScenario(scenario);
        const now = finalNow(events);
        const plain = evaluate(initialState(), input(events, now), P);
        const dups = picks.map((i) => events[i % events.length]);
        const withDups = evaluate(initialState(), input([...events, ...dups], now), P);
        expect(withDups.state).toEqual(plain.state);
        expect(withDups.outputs).toEqual(plain.outputs);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P4_duplicates_change_nothing: re-delivering held events in a later call changes nothing', () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(fc.nat(500), { maxLength: 60 }), (scenario, picks) => {
        const events = buildScenario(scenario);
        const now = finalNow(events);
        const first = evaluate(initialState(), input(events, now), P);
        const again = evaluate(first.state, input(picks.map((i) => events[i % events.length]), now), P);
        expect(again.state).toEqual(first.state);
        expect(again.outputs.decisions).toEqual(first.outputs.decisions);
        expect(again.outputs.changes).toEqual([]);
        expect(again.outputs.pushes).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P4_duplicates_change_nothing: a duplicate identity with other content keeps the first copy', () => {
    const a = ev('x', 1, 'UNPLUG', T0);
    const b = ev('x', 1, 'UNPLUG', T0 + 5 * SEC);
    const one = mergeInputs(initialState(), [a, b], []);
    const other = mergeInputs(initialState(), [a], []);
    expect(one.installs).toEqual(other.installs);
  });
});

describe('P9_simulated_never_counts', () => {
  it('P9_simulated_never_counts: simulated events and labels change no state, history, statistics or pushes', () => {
    fc.assert(
      fc.property(scenarioArb, scenarioArb, (real, fake) => {
        const events = buildScenario(real);
        const now = finalNow(events);
        const simulated: EngineEvent[] = buildScenario(fake).map((e) => ({ ...e, installId: `sim-${e.installId}`, simulated: true }));
        const plain = evaluate(initialState(), input(events, now), P);
        const mixed = evaluate(
          initialState(),
          input(permute([...events, ...simulated], [5, 1, 9, 3]), now, {
            labels: [{ installId: 'sim-i0', unplugSeq: 2, answer: 'NO', simulated: true }],
          }),
          P,
        );
        expect(mixed.state).toEqual(plain.state);
        expect({ ...mixed.outputs, ignoredSimulated: 0 }).toEqual({ ...plain.outputs, ignoredSimulated: 0 });
        expect(mixed.outputs.ignoredSimulated).toBe(simulated.length + 1);
        expect(mixed.outputs.pushes).toEqual(plain.outputs.pushes);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P9_simulated_never_counts: a 30-phone simulated outage alone gives nothing', () => {
    const phones = ids(30);
    const events = [...armAll(phones, T0), ...unplugAll(phones, T0), ...replugAll(phones, T0 + HOUR)].map((e) => ({
      ...e,
      simulated: true,
    }));
    const r = evaluate(initialState(), input(events, T0 + 2 * HOUR), P);
    expect(r.state).toEqual(initialState());
    expect(r.outputs.decisions).toEqual([]);
    expect(r.outputs.pushes).toEqual([]);
    expect(r.outputs.ignoredSimulated).toBe(90);
  });
});

describe('R2 merge and normalize', () => {
  it('R2_malformed_events_are_rejected_and_others_processed', () => {
    const good = ev('a', 1, 'ARMED', T0);
    const bad: unknown[] = [
      null,
      { ...good, installId: '' },
      { ...good, seq: -1 },
      { ...good, seq: 1.5 },
      { ...good, type: 'EXPLODE' },
      { ...good, eventTimeMs: Number.NaN },
      { ...good, eventTimeMs: 1.5 },
      { ...good, confidence: 'MEDIUM' },
      { ...good, schedulingDelayMs: -4 },
      { ...good, simulated: 'yes' },
    ];
    const r = evaluate(initialState(), input([...(bad as EngineEvent[]), good], T0 + MIN), P);
    expect(r.outputs.rejected).toHaveLength(bad.length);
    expect(Object.keys(r.state.installs)).toEqual(['a']);
    for (const b of bad) expect(eventProblem(b)).not.toBeNull();
    expect(eventProblem(good)).toBeNull();
  });

  it('R2_rejection_reasons_never_hold_install_ids', () => {
    const r = evaluate(initialState(), input([{ ...ev('secret-install', 1, 'ARMED', T0), type: 'NOPE' as never }], T0), P);
    expect(JSON.stringify(r.outputs.rejected)).not.toContain('secret-install');
  });

  it('R2_inputs_are_not_mutated', () => {
    const deepFreeze = <T>(x: T): T => {
      if (typeof x === 'object' && x !== null) {
        for (const v of Object.values(x)) deepFreeze(v);
        Object.freeze(x);
      }
      return x;
    };
    const events = [...armAll(ids(4), T0), ...unplugAll(ids(4), T0)];
    const first = evaluate(initialState(), input(events, T0 + MIN), P).state;
    deepFreeze(events);
    deepFreeze(first);
    const more = deepFreeze(input([ev('z', 1, 'ARMED', T0), ...replugAll(ids(4), T0 + 2 * MIN)], T0 + 3 * MIN));
    // Strict mode makes any write to a frozen argument throw.
    expect(() => evaluate(first, more, P)).not.toThrow();
  });

  it('R2_events_are_kept_in_total_order', () => {
    const shuffled = [ev('b', 2, 'UNPLUG', T0 + 5), ev('a', 1, 'ARMED', T0), ev('b', 1, 'ARMED', T0 - 5)];
    const m = mergeInputs(initialState(), shuffled, []);
    expect(m.installs.b.events.map((e) => e[2])).toEqual([T0 - 5, T0 + 5]);
  });

  it('R2_empty_input_returns_the_same_state_and_decisions', () => {
    const events = [...armAll(ids(5), T0), ...unplugAll(ids(5), T0)];
    const first = evaluate(initialState(), input(events, T0 + HOUR), P);
    const second = evaluate(first.state, input([], T0 + HOUR), P);
    expect(second.state).toEqual(first.state);
    expect(second.outputs.decisions).toEqual(first.outputs.decisions);
  });

  it('R2_prototype_pollution_ids_are_rejected', () => {
    const r = evaluate(initialState(), input([ev('__proto__', 1, 'ARMED', T0)], T0), P);
    expect(r.outputs.rejected).toHaveLength(1);
  });
});
