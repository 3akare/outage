// Task 7: armed intervals, stale expiry and weights (R3). Property P10 and the weight side of D4.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate, initialState } from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P, unplugAll } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';

/** `count` isolated unplug/replug cycles of one install, one every `stepMs` from `from`. Seq starts at `seq0`. */
const cycles = (id: string, count: number, from: number, stepMs: number, seq0: number) => {
  const out = [];
  for (let j = 0; j < count; j++) {
    out.push(ev(id, seq0 + 2 * j, 'UNPLUG', from + j * stepMs));
    out.push(ev(id, seq0 + 2 * j + 1, 'REPLUG', from + j * stepMs + 20 * SEC));
  }
  return out;
};

describe('P10_noisy_never_confirms', () => {
  it('P10_noisy_never_confirms: a noisy install is never one of the drops that confirm', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 9, max: 20 }), // isolated unplugs of the noisy install in 24 h
        fc.integer({ min: 0, max: 2 }), // clean installs that also drop
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 6, maxLength: 6 }), // jitter
        fc.integer({ min: 1, max: 5 }), // extra armed installs that stay up
        (noisyCount, cleanDrops, jitter, quiet) => {
          const clean = ids(cleanDrops, 'c');
          const stay = ids(quiet, 's');
          const noisy = 'noisy';
          const start = T0 + 5 * HOUR;
          const events = [
            ...armAll([noisy, ...clean, ...stay], start, 6 * HOUR),
            ...cycles(noisy, noisyCount, T0 + HOUR, 5 * MIN, 2),
            ...clean.map((id, i) => ev(id, 2, 'UNPLUG', start + jitter[i])),
            ev(noisy, 2 + 2 * noisyCount, 'UNPLUG', start + jitter[5]),
          ];
          const r = evaluate(initialState(), input(events, start + 13 * HOUR), P);
          // At most `cleanDrops` drops count, so with at most 2 clean drops nothing can reach k = 3.
          expect(r.outputs.decisions.filter((d) => d.level === 'CONFIRMED')).toEqual([]);
          for (const d of r.outputs.decisions) {
            expect(d.explanation.k).toBeLessThanOrEqual(cleanDrops);
            expect(d.explanation.excludedNoisy).toBeGreaterThanOrEqual(1);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P10_noisy_never_confirms: the same drops confirm once the noisy install is replaced by a clean one', () => {
    const start = T0 + 5 * HOUR;
    const base = [...armAll(['a', 'b', 'x'], start, 6 * HOUR), ev('a', 2, 'UNPLUG', start), ev('b', 2, 'UNPLUG', start + 500)];
    const noisy = [...base, ...cycles('x', 10, T0 + HOUR, 5 * MIN, 2), ev('x', 22, 'UNPLUG', start + 900)];
    const clean = [...base, ev('x', 2, 'UNPLUG', start + 900)];
    const a = evaluate(initialState(), input(noisy, start + 13 * HOUR), P).outputs.decisions;
    const b = evaluate(initialState(), input(clean, start + 13 * HOUR), P).outputs.decisions;
    expect(a.some((d) => d.level === 'CONFIRMED')).toBe(false);
    expect(a[0].explanation.k).toBe(2);
    expect(b.some((d) => d.level === 'CONFIRMED')).toBe(true);
  });

  it('P10_noisy_never_confirms: eight isolated unplugs keep weight 0.5 (u > 8 is the cut)', () => {
    const start = T0 + 5 * HOUR;
    const mk = (count: number) => [
      ...armAll(['a', 'b', 'x'], start, 6 * HOUR),
      ...cycles('x', count, T0 + HOUR, 5 * MIN, 2),
      ev('a', 2, 'UNPLUG', start),
      ev('b', 2, 'UNPLUG', start + 500),
      ev('x', 2 + 2 * count, 'UNPLUG', start + 900),
    ];
    const at8 = evaluate(initialState(), input(mk(8), start + 13 * HOUR), P).outputs.decisions;
    const at9 = evaluate(initialState(), input(mk(9), start + 13 * HOUR), P).outputs.decisions;
    expect(at8.some((d) => d.level === 'CONFIRMED' && d.explanation.k === 3)).toBe(true);
    expect(at9.some((d) => d.level === 'CONFIRMED')).toBe(false);
  });

  it('P10_noisy_never_confirms: isolated unplugs older than 24 h no longer count', () => {
    const start = T0 + 40 * HOUR;
    const events = [
      ...armAll(['a', 'b', 'x', 's1'], start, 45 * HOUR),
      ...cycles('x', 12, T0 + HOUR, 5 * MIN, 2),
      ev('a', 2, 'UNPLUG', start),
      ev('b', 2, 'UNPLUG', start + 500),
      ev('x', 26, 'UNPLUG', start + 900),
    ];
    const d = evaluate(initialState(), input(events, start + 13 * HOUR), P).outputs.decisions;
    expect(d.some((x) => x.level === 'CONFIRMED')).toBe(true);
  });

  it('P10_noisy_never_confirms: an unplug that belongs to an outage is not isolated', () => {
    // 12 real outages (each 3 installs) leave x with 12 unplugs, none isolated, so x keeps weight 1.
    const events = [...armAll(['a', 'b', 'x', 's1'], T0, 10 * MIN)];
    let seq = 2;
    for (let j = 0; j < 3; j++) {
      const t = T0 + (j + 1) * 3 * HOUR;
      events.push(ev('a', seq, 'UNPLUG', t), ev('b', seq, 'UNPLUG', t + 300), ev('x', seq, 'UNPLUG', t + 600));
      events.push(ev('a', seq + 1, 'REPLUG', t + 20 * MIN), ev('b', seq + 1, 'REPLUG', t + 20 * MIN + 5 * SEC), ev('x', seq + 1, 'REPLUG', t + 20 * MIN + 9 * SEC));
      seq += 2;
    }
    const d = evaluate(initialState(), input(events, T0 + 30 * HOUR), P).outputs.decisions;
    expect(d.filter((x) => x.kind === 'RESTORED')).toHaveLength(3);
    expect(d.every((x) => x.explanation.excludedNoisy === 0)).toBe(true);
  });
});

describe('R3 armed state', () => {
  it('R3_3_stale_armed_install_is_not_counted_in_n', () => {
    const start = T0 + 9 * DAY_MS;
    const live = ids(3, 'l');
    const events = [...armAll(['old'], T0, 0), ...armAll(live, start, 5 * MIN), ...unplugAll(live, start, 200)];
    const r = evaluate(initialState(), input(events, start + 13 * HOUR), P);
    expect(r.outputs.decisions[0].explanation.n).toBe(3);
  });

  it('R3_3_a_recent_event_keeps_an_install_armed', () => {
    const start = T0 + 9 * DAY_MS;
    const live = ids(3, 'l');
    const keepAlive = [ev('old', 1, 'ARMED', T0), ev('old', 2, 'BATTERY_FULL', T0 + 5 * DAY_MS)];
    const events = [...keepAlive, ...armAll(live, start, 5 * MIN), ...unplugAll(live, start, 200)];
    const r = evaluate(initialState(), input(events, start + 13 * HOUR), P);
    expect(r.outputs.decisions[0].explanation.n).toBe(4);
  });

  it('R3_2_replug_arms_the_install_again', () => {
    const start = T0 + 3 * HOUR;
    const live = ids(3, 'l');
    const events = [
      ...armAll(live, T0, 0),
      ...live.map((id, i) => ev(id, 2, 'UNPLUG', T0 + HOUR + i * SEC)),
      ...live.map((id, i) => ev(id, 3, 'REPLUG', T0 + 2 * HOUR + i * SEC)),
      ...live.map((id, i) => ev(id, 4, 'UNPLUG', start + i * 100)),
    ];
    const r = evaluate(initialState(), input(events, start + 13 * HOUR), P);
    const second = r.outputs.decisions.filter((d) => d.startMs >= start);
    expect(second[0].explanation.n).toBe(3);
  });

  it('R3_1_a_disarmed_install_is_not_counted_in_n', () => {
    const start = T0 + 3 * HOUR;
    const live = ids(3, 'l');
    const events = [
      ...armAll([...live, 'gone'], start, 20 * MIN),
      ev('gone', 2, 'DISARMED', start - 10 * MIN),
      ...unplugAll(live, start, 200),
    ];
    expect(evaluate(initialState(), input(events, start + 13 * HOUR), P).outputs.decisions[0].explanation.n).toBe(3);
  });

  it('R3_7_a_new_install_has_weight_one', () => {
    const start = T0 + 3 * HOUR;
    const events = [...armAll(['a', 'b', 'c'], start, 10 * MIN), ...unplugAll(['a', 'b', 'c'], start, 100)];
    const e = evaluate(initialState(), input(events, start + 13 * HOUR), P).outputs.decisions[0].explanation;
    expect(e.excludedNoisy).toBe(0);
    expect(e.k).toBeGreaterThanOrEqual(2);
  });
});
