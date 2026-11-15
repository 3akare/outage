// Task 11: outage lifecycle (R9): open, attach, stable identity, level history, d.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate, initialState, outageIdFor } from '../src/index.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P, replugAll } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { buildScenario, finalNow, permute, scenarioArb } from './helpers/scenario.ts';

describe('R9 outage lifecycle', () => {
  const phones = ids(30);
  const base = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];

  it('R9_1_start_is_the_earliest_drop_of_the_first_qualifying_window', () => {
    const d = evaluate(initialState(), input(base, T0 + MIN), P).outputs.decisions;
    expect(d[0].kind).toBe('OPENED');
    expect(d[0].startMs).toBe(T0);
    expect(d[0].level).toBe('POSSIBLE');
    expect(d[0].decisionTimeMs).toBe(T0 + 400); // n = 30: Possible needs k = 5 (ADR 0005), the fifth drop
  });

  it('R9_4_the_time_each_level_was_reached_is_recorded', () => {
    const d = evaluate(initialState(), input(base, T0 + MIN), P).outputs.decisions;
    const raised = d.find((x) => x.kind === 'RAISED');
    expect(raised?.level).toBe('CONFIRMED');
    expect(raised?.decisionTimeMs).toBe(T0 + 6 * 100); // k = 7 is the seventh drop
    expect(raised?.startMs).toBe(T0);
  });

  it('R9_2_later_drops_attach_and_open_no_second_outage', () => {
    const d = evaluate(initialState(), input(base, T0 + MIN), P).outputs.decisions;
    expect(new Set(d.map((x) => x.outageId)).size).toBe(1);
  });

  it('R9_6_d_counts_distinct_dropped_installs_through_the_quorum_rule', () => {
    // 30 dropped: quorum is 15. 14 replugs are not enough, 15 are.
    const back = (count: number) => replugAll(phones.slice(0, count), T0 + HOUR, 1000);
    const at14 = evaluate(initialState(), input([...base, ...back(14)], T0 + 2 * HOUR), P).outputs.decisions;
    const at15 = evaluate(initialState(), input([...base, ...back(15)], T0 + 2 * HOUR), P).outputs.decisions;
    expect(at14.some((x) => x.kind === 'RESTORED')).toBe(false);
    const restored = at15.find((x) => x.kind === 'RESTORED');
    expect(restored?.explanation.restore?.d).toBe(30);
    expect(restored?.explanation.restore?.quorum).toBe(15);
  });

  it('R9_5_identity_is_derived_from_the_earliest_drop_key', () => {
    const d = evaluate(initialState(), input(base, T0 + MIN), P).outputs.decisions;
    expect(d[0].outageId).toBe(outageIdFor('i0', 2));
    expect(outageIdFor('a', 1)).not.toBe(outageIdFor('a', 2));
    expect(outageIdFor('a', 1)).not.toBe(outageIdFor('b', 1));
  });

  it('R9_5_identity_is_stable_under_reordering_and_batching', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 40 }),
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 40 }),
        (scenario, order, batches) => {
          const events = buildScenario(scenario);
          const now = finalNow(events);
          const ref = evaluate(initialState(), input(events, now), P).outputs.decisions.map((d) => d.outageId);
          const shuffled = permute(events, order);
          let st = initialState();
          for (let b = 0; b < 3; b++) {
            st = evaluate(st, input(shuffled.filter((_, i) => (batches[i % batches.length] ?? 0) === b), now), P).state;
          }
          expect(evaluate(st, input([], now), P).outputs.decisions.map((d) => d.outageId)).toEqual(ref);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R9_1_a_new_outage_opens_after_the_first_one_is_restored', () => {
    const second = phones.map((id, i) => ev(id, 4, 'UNPLUG', T0 + 3 * HOUR + i * 100));
    const events = [...base, ...replugAll(phones, T0 + HOUR, 1000), ...second];
    const d = evaluate(initialState(), input(events, T0 + 20 * HOUR), P).outputs.decisions;
    expect(new Set(d.map((x) => x.outageId)).size).toBe(2);
    expect(d.filter((x) => x.kind === 'RESTORED')).toHaveLength(1);
    expect(d.filter((x) => x.kind === 'ENDED_UNKNOWN')).toHaveLength(1);
  });

  it('R9_a_late_earlier_drop_moves_the_start_earlier', () => {
    const late = ev('i29', 2, 'UNPLUG', T0 - 30 * SEC);
    const without = base.filter((e) => !(e.installId === 'i29' && e.type === 'UNPLUG'));
    const first = evaluate(initialState(), input(without, T0 + MIN), P);
    const second = evaluate(first.state, input([late], T0 + MIN), P);
    expect(second.outputs.decisions[0].startMs).toBe(T0 - 30 * SEC);
    expect(second.outputs.areaStatus.level).toBe('CONFIRMED');
  });

  it('R9_3_the_outage_level_is_the_highest_window_level', () => {
    const d = evaluate(initialState(), input(base, T0 + MIN), P).outputs.decisions;
    expect(Math.max(...d.map((x) => (x.level === 'CONFIRMED' ? 2 : 1)))).toBe(2);
    expect(evaluate(initialState(), input(base, T0 + MIN), P).outputs.areaStatus).toEqual({
      level: 'CONFIRMED',
      outageId: d[0].outageId,
      sinceMs: T0,
    });
  });
});
