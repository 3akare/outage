// Task 9: windows and levels (R5, R6). Properties P1, P2, P7, P11, and the ADR 0005 table.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyWindow, evaluate, initialState, tail } from '../src/index.ts';
import { levelRank } from '../src/window.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';

const LAMBDA = P.baseline.priorLambdaPerSec;
const maxLevel = (d: { level: string }[]) => (d.some((x) => x.level === 'CONFIRMED') ? 2 : d.length > 0 ? 1 : 0);

describe('P1_single_unplug_never_alerts', () => {
  it('P1_single_unplug_never_alerts: one UNPLUG among any number of armed installs gives no decision', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.integer({ min: 0, max: 10 * HOUR }),
        (n, at) => {
          const installs = ids(n);
          const events = [...armAll(installs, T0 + at, 20 * MIN), ev('i0', 2, 'UNPLUG', T0 + at)];
          const r = evaluate(initialState(), input(events, T0 + at + 13 * HOUR), P);
          expect(r.outputs.decisions).toEqual([]);
          expect(r.outputs.areaStatus.level).toBe('NORMAL');
          expect(r.outputs.pushes).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P1_single_unplug_never_alerts: one install unplugging again and again is never k >= 2', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), fc.integer({ min: 1, max: 80 * SEC }), (count, stepMs) => {
        const events = [...armAll(ids(10), T0, 5 * MIN)];
        for (let j = 0; j < count; j++) events.push(ev('i0', 2 + 2 * j, 'UNPLUG', T0 + j * stepMs));
        const r = evaluate(initialState(), input(events, T0 + 13 * HOUR), P);
        expect(r.outputs.decisions).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P1_single_unplug_never_alerts: classifyWindow with k = 1 is never a level, for any lambda and n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), fc.double({ min: 0, max: 10, noNaN: true }), (n, lambda) => {
        expect(classifyWindow(1, n, lambda, P).level).toBe('NONE');
        expect(classifyWindow(0, n, lambda, P).level).toBe('NONE');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('P2_confirmed_when_k3_p_small', () => {
  it('P2_confirmed_when_k3_p_small: classifyWindow gives Confirmed for n >= 3, k >= 3, p < 0.001, any lambda', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 400 }),
        fc.integer({ min: 3, max: 400 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (n, k, lambda) => {
          fc.pre(k <= n);
          const w = classifyWindow(k, n, lambda, P);
          if (w.p < P.confirmed.maxP) expect(w.level).toBe('CONFIRMED');
          else expect(w.level).not.toBe('CONFIRMED');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P2_confirmed_when_k3_p_small: the engine confirms whenever k >= 3 and p < 0.001 (jitter up to 2 s)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 40, maxLength: 40 }),
        (n, drops, jitter) => {
          const k = Math.min(drops, n);
          const installs = ids(n);
          const events = [...armAll(installs, T0 + HOUR, 10 * MIN)];
          for (let i = 0; i < k; i++) events.push(ev(installs[i], 2, 'UNPLUG', T0 + HOUR + jitter[i]));
          const r = evaluate(initialState(), input(events, T0 + 20 * HOUR), P);
          const p = tail(k, LAMBDA * n * 90);
          const expected = k >= 3 && p < 0.001;
          expect(r.outputs.decisions.some((d) => d.level === 'CONFIRMED')).toBe(expected);
          if (expected) expect(r.outputs.areaStatus.level).toBe('NORMAL'); // 20 h later the outage has ended unknown
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('P7_more_drops_never_lower', () => {
  it('P7_more_drops_never_lower: classifyWindow is monotone in k for fixed n and lambda', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 50 }),
        (n, lambda, k, more) => {
          const a = classifyWindow(k, n, lambda, P);
          const b = classifyWindow(k + more, n, lambda, P);
          expect(levelRank(b.level)).toBeGreaterThanOrEqual(levelRank(a.level));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P7_more_drops_never_lower: adding drops inside the window of an armed install never lowers the level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 30, maxLength: 30 }),
        (n, base, extra, jitter) => {
          const installs = ids(n);
          const kBase = Math.min(base, n);
          const kMore = Math.min(kBase + extra, n);
          const arm = armAll(installs, T0 + HOUR, 10 * MIN);
          const drops = (k: number) => installs.slice(0, k).map((id, i) => ev(id, 2, 'UNPLUG', T0 + HOUR + jitter[i]));
          const lo = evaluate(initialState(), input([...arm, ...drops(kBase)], T0 + 20 * HOUR), P).outputs.decisions;
          const hi = evaluate(initialState(), input([...arm, ...drops(kMore)], T0 + 20 * HOUR), P).outputs.decisions;
          expect(maxLevel(hi)).toBeGreaterThanOrEqual(maxLevel(lo));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('P11_sparse_never_confirms', () => {
  it('P11_sparse_never_confirms: fewer than 3 armed sensors never show Confirmed at the own level', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 8 }),
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 8, maxLength: 8 }),
        (armed, droppers, jitter) => {
          // `droppers` installs unplug; only `armed` of them were ever armed. k can be larger than n.
          const installs = ids(Math.max(droppers, armed));
          const events = [...armAll(installs.slice(0, armed), T0 + HOUR, 10 * MIN)];
          for (let i = 0; i < droppers; i++) events.push(ev(installs[i], 2, 'UNPLUG', T0 + HOUR + jitter[i]));
          const r = evaluate(initialState(), input(events, T0 + 20 * HOUR), P);
          expect(r.outputs.decisions.filter((d) => d.level === 'CONFIRMED')).toEqual([]);
          for (const d of r.outputs.decisions) expect(d.explanation.n).toBeLessThan(3);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P11_sparse_never_confirms: classifyWindow caps at Possible when n < 3, for any k and lambda', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 100 }), fc.double({ min: 0, max: 1, noNaN: true }), (n, k, lambda) => {
        expect(classifyWindow(k, n, lambda, P).level).not.toBe('CONFIRMED');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('R5 R6 level table (ADR 0005)', () => {
  const rows: [number, number, number][] = [
    [3, 2, 3],
    [5, 2, 4],
    [10, 3, 5],
    [20, 4, 6],
    [30, 5, 7],
    [50, 6, 10],
    [100, 10, 14],
  ];
  for (const [n, possible, confirmed] of rows) {
    it(`R6_table_n${n}: Possible from k=${possible}, Confirmed from k=${confirmed}`, () => {
      const level = (k: number) => classifyWindow(k, n, LAMBDA, P).level;
      expect(level(possible - 1)).toBe('NONE');
      expect(level(possible)).toBe(possible >= confirmed ? 'CONFIRMED' : 'POSSIBLE');
      expect(level(confirmed - 1)).not.toBe('CONFIRMED');
      expect(level(confirmed)).toBe('CONFIRMED');
    });
  }

  it('R6_engine_30_phones_drop_and_the_explanation_carries_the_counts', () => {
    const phones = ids(30);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 50))];
    const d = evaluate(initialState(), input(events, T0 + 13 * HOUR), P).outputs.decisions;
    const raised = d.find((x) => x.kind === 'RAISED');
    expect(raised?.explanation.k).toBe(7); // minimum k at n = 30
    expect(raised?.explanation.n).toBe(30);
    expect(raised?.explanation.lambdaPerSec).toBeCloseTo(LAMBDA, 12);
    expect(raised?.explanation.muValue).toBeCloseTo(LAMBDA * 30 * 90, 9);
  });

  it('R5_drops_more_than_one_window_apart_never_add_up', () => {
    const phones = ids(10);
    const events = [...armAll(phones, T0, 5 * MIN)];
    phones.forEach((id, i) => events.push(ev(id, 2, 'UNPLUG', T0 + i * 100 * SEC)));
    expect(evaluate(initialState(), input(events, T0 + 13 * HOUR), P).outputs.decisions).toEqual([]);
  });
});
