// Task 10: hints (R7). Unit tests plus a property that hints never change the engine's own numbers.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Context, type Level, applyHints, evaluate, hintProblems, initialState } from '../src/index.ts';
import { HOUR, MIN, T0, armAll, ev, ids, input, P } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';

const ctx = (neighbors: Context['neighbors'], manualReports = 0): Context => ({ neighbors, manualReports });
const none = ctx([]);

describe('R7 hints', () => {
  it('R7_2_a_neighbor_raises_possible_to_confirmed_when_some_scope_has_k3', () => {
    expect(applyHints('POSSIBLE', 2, ctx([{ level: 'CONFIRMED', maxK: 5, linked: false }]), 3)).toEqual({
      level: 'CONFIRMED',
      raisedBy: 'NEIGHBOR',
    });
  });

  it('R7_3_never_to_confirmed_without_k3_anywhere', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.array(fc.record({ level: fc.constantFrom<Level>('NORMAL', 'POSSIBLE', 'CONFIRMED'), maxK: fc.integer({ min: 0, max: 2 }), linked: fc.boolean() }), { maxLength: 4 }),
        fc.integer({ min: 0, max: 5 }),
        (kHere, neighbors, manual) => {
          expect(applyHints('POSSIBLE', kHere, ctx(neighbors, manual), 3).level).toBe('POSSIBLE');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R7_2_a_raise_is_at_most_one_step_and_a_confirmed_stays_confirmed', () => {
    expect(applyHints('CONFIRMED', 9, ctx([{ level: 'CONFIRMED', maxK: 9, linked: false }], 4), 3)).toEqual({ level: 'CONFIRMED' });
    expect(applyHints('POSSIBLE', 3, none, 3)).toEqual({ level: 'POSSIBLE' });
    expect(applyHints('POSSIBLE', 3, ctx([{ level: 'NORMAL', maxK: 9, linked: false }]), 3)).toEqual({ level: 'POSSIBLE' });
  });

  it('R7_4_the_hint_kind_is_named', () => {
    expect(applyHints('POSSIBLE', 3, ctx([{ level: 'POSSIBLE', maxK: 2, linked: true }]), 3).raisedBy).toBe('LINKED');
    expect(applyHints('POSSIBLE', 3, ctx([], 2), 3).raisedBy).toBe('MANUAL');
    expect(applyHints('POSSIBLE', 3, ctx([{ level: 'POSSIBLE', maxK: 2, linked: false }]), 3).raisedBy).toBe('NEIGHBOR');
  });

  it('R7_4_R7_5_the_engine_records_the_raise_and_keeps_its_own_numbers', () => {
    // n = 10 and k = 3 is only Possible (needs k = 5). A neighbor with k = 6 raises the outage to Confirmed.
    const phones = ids(10);
    const events = [...armAll(phones, T0), ...phones.slice(0, 3).map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const now = T0 + 5 * MIN;
    const plain = evaluate(initialState(), input(events, now), P).outputs;
    const hinted = evaluate(initialState(), input(events, now, { context: ctx([{ level: 'CONFIRMED', maxK: 6, linked: false }]) }), P).outputs;
    expect(plain.areaStatus.level).toBe('POSSIBLE');
    expect(hinted.areaStatus.level).toBe('CONFIRMED');
    const raised = hinted.decisions.find((d) => d.kind === 'RAISED');
    expect(raised?.explanation.raisedBy).toBe('NEIGHBOR');
    expect(plain.decisions.length).toBe(1);
    const p0 = plain.decisions[0].explanation;
    const r0 = raised?.explanation;
    expect([r0?.k, r0?.n, r0?.muValue, r0?.p]).toEqual([p0.k, p0.n, p0.muValue, p0.p]);
    expect(hinted.pushes.map((x) => x.kind)).toEqual(['CONFIRMED']);
  });

  it('R7_hints_apply_only_to_open_outages', () => {
    const phones = ids(10);
    const events = [...armAll(phones, T0), ...phones.slice(0, 3).map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const hint = ctx([{ level: 'CONFIRMED', maxK: 6, linked: false }]);
    const late = evaluate(initialState(), input(events, T0 + 13 * HOUR, { context: hint }), P).outputs.decisions;
    expect(late.some((d) => d.level === 'CONFIRMED')).toBe(false);
  });

  it('R7_1_invalid_hints_are_ignored_and_reported', () => {
    const bad = ctx([{ level: 'CONFIRMED', maxK: Number.NaN, linked: false }, { level: 'POSSIBLE', maxK: -1, linked: true }], Number.NaN);
    expect(hintProblems(bad)).toHaveLength(3);
    expect(applyHints('POSSIBLE', 3, bad, 3)).toEqual({ level: 'POSSIBLE' });
    expect(evaluate(initialState(), input([], T0, { context: bad }), P).outputs.rejected).toHaveLength(3);
  });
});
