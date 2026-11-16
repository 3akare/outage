// Task 13: decisions, explanations, change diff, push filter and memory (R12, R13). P12, D3, D4, D6.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Decision,
  type EngineEvent,
  type EngineState,
  type Label,
  evaluate,
  initialState,
  levelFromExplanation,
  tail,
} from '../src/index.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P, replugAll } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { buildScenario, finalNow, permute, scenarioArb } from './helpers/scenario.ts';

/** Deliver `events` in `batches` (shuffled by `keys`), one evaluate per batch at the given `nows`; returns every call. */
function deliver(events: EngineEvent[], keys: number[], nows: number[]) {
  const shuffled = permute(events, keys);
  const calls = [];
  let state: EngineState = initialState();
  for (let b = 0; b < nows.length; b++) {
    const batch = shuffled.filter((_, i) => i % nows.length === b);
    const r = evaluate(state, input(batch, nows[b]), P);
    calls.push({ nowMs: nows[b], ...r });
    state = r.state;
  }
  return calls;
}

describe('P12_no_stale_push', () => {
  it('P12_no_stale_push: no push is older than 10 minutes at the call that emits it', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.integer({ min: -2 * HOUR, max: 14 * HOUR }), { minLength: 1, maxLength: 5 }),
        (scenario, keys, offsets) => {
          const events = buildScenario(scenario);
          const base = T0 + 40 * MIN;
          const nows = offsets.map((o) => base + o);
          for (const call of deliver(events, keys, nows)) {
            for (const push of call.outputs.pushes) {
              expect(push.decisionTimeMs).toBeGreaterThanOrEqual(call.nowMs - P.pushMaxAgeMs);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P12_no_stale_push: events delivered hours late give decisions and no pushes', () => {
    const phones = ids(30);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100)), ...replugAll(phones, T0 + HOUR)];
    const r = evaluate(initialState(), input(events, T0 + 3 * HOUR), P).outputs;
    expect(r.decisions.length).toBe(3);
    expect(r.pushes).toEqual([]);
  });

  it('P12_no_stale_push: fresh decisions push, and exactly at 10 minutes still pushes', () => {
    const phones = ids(30);
    const drops = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const fresh = evaluate(initialState(), input(drops, T0 + 5 * MIN), P).outputs;
    expect(fresh.pushes.map((x) => x.kind)).toEqual(['CONFIRMED']);
    const edge = evaluate(initialState(), input(drops, T0 + 600 * SEC + 600), P).outputs; // raise at T0 + 600
    expect(edge.pushes.map((x) => x.kind)).toEqual(['CONFIRMED']);
    const stale = evaluate(initialState(), input(drops, T0 + 600 * SEC + 601), P).outputs;
    expect(stale.pushes).toEqual([]);
  });

  it('P12_no_stale_push: a Possible decision never pushes, and suppressing a push never changes a decision', () => {
    const phones = ids(10);
    const events = [...armAll(phones, T0), ...phones.slice(0, 3).map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const r = evaluate(initialState(), input(events, T0 + 5 * MIN), P).outputs;
    expect(r.decisions.map((d) => d.level)).toEqual(['POSSIBLE']);
    expect(r.pushes).toEqual([]);
    const late = evaluate(initialState(), input(events, T0 + 5 * HOUR), P).outputs;
    expect(late.decisions).toEqual(r.decisions);
  });
});

describe('D6_push_once', () => {
  it('D6_push_once: across any sequence of calls each (outage, kind) pushes at most once', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.integer({ min: 0, max: 14 * HOUR }), { minLength: 2, maxLength: 7 }),
        (scenario, keys, offsets) => {
          const events = buildScenario(scenario);
          const nows = offsets.map((o) => T0 + 20 * MIN + o);
          const seen = new Map<string, number>();
          for (const call of deliver(events, keys, nows)) {
            for (const push of call.outputs.pushes) {
              const k = `${push.outageId}:${push.kind}`;
              seen.set(k, (seen.get(k) ?? 0) + 1);
            }
          }
          for (const count of seen.values()) expect(count).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('D6_push_once: repeating the same call pushes nothing the second time', () => {
    const phones = ids(30);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const a = evaluate(initialState(), input(events, T0 + 2 * MIN), P);
    const b = evaluate(a.state, input([], T0 + 3 * MIN), P);
    expect(a.outputs.pushes).toHaveLength(1);
    expect(b.outputs.pushes).toEqual([]);
    expect(b.outputs.changes).toEqual([]);
  });

  it('D6_push_once: a later, earlier drop that renames the outage does not push the same alert twice', () => {
    const phones = ids(30);
    const rest = [...armAll(phones, T0), ...phones.slice(1).map((id, i) => ev(id, 2, 'UNPLUG', T0 + (i + 1) * 100))];
    const a = evaluate(initialState(), input(rest, T0 + 2 * MIN), P);
    const b = evaluate(a.state, input([ev('i0', 2, 'UNPLUG', T0 - 5 * SEC)], T0 + 3 * MIN), P);
    expect(a.outputs.pushes).toHaveLength(1);
    expect(b.outputs.pushes).toEqual([]);
    expect(b.outputs.decisions[0].outageId).not.toBe(a.outputs.decisions[0].outageId);
  });

  it('D6_push_once: restored pushes once too', () => {
    const phones = ids(30);
    const drops = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const back = replugAll(phones, T0 + HOUR, 500);
    const a = evaluate(initialState(), input([...drops, ...back.slice(0, 16)], T0 + HOUR + 20 * SEC), P);
    const b = evaluate(a.state, input(back, T0 + HOUR + 30 * SEC), P);
    expect(a.outputs.pushes.map((x) => x.kind)).toEqual(['RESTORED']);
    expect(b.outputs.pushes).toEqual([]);
  });
});

describe('D3_explanations_complete', () => {
  const all = (d: Decision) => {
    const x = d.explanation;
    for (const v of [x.k, x.n, x.excludedNoisy, x.lambdaPerSec, x.muValue, x.p, x.windowMs]) expect(Number.isFinite(v)).toBe(true);
    expect(x.thresholds.possible.minK).toBe(P.possible.minK);
    expect(x.thresholds.confirmed.maxP).toBe(P.confirmed.maxP);
    expect(x.thresholds.minArmedForConfirm).toBe(P.minArmedForConfirm);
    expect(x.thresholds.weightCut).toBe(P.weight.cut);
    expect(x.windowMs).toBe(P.windowMs);
    expect(x.confidence.high + x.confidence.low).toBeGreaterThanOrEqual(x.k);
  };

  it('D3_explanations_complete: every field is present and p and the level recompute from the explanation', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const events = buildScenario(scenario);
        const r = evaluate(initialState(), input(events, finalNow(events)), P).outputs;
        for (const d of r.decisions) {
          all(d);
          const x = d.explanation;
          expect(x.muValue).toBeCloseTo(x.lambdaPerSec * x.n * (x.windowMs / 1000), 12);
          expect(x.p).toBe(tail(x.k, x.muValue));
          expect(levelFromExplanation(x)).toBe(d.level);
          if (d.kind === 'RESTORED') {
            const rs = x.restore;
            expect(rs).toBeDefined();
            expect(rs?.quorum).toBe(Math.max(P.restore.minQuorum, Math.ceil((rs?.d ?? 0) / 2)));
            expect(rs?.replugs).toBeGreaterThanOrEqual(rs?.quorum ?? 0);
            expect(rs?.wrMs).toBe(P.restore.baseMs + (rs?.p95Ms ?? 0));
          } else expect(x.restore).toBeUndefined();
          expect(JSON.stringify(d)).not.toMatch(/"i\d+"/); // counts only, never install IDs (R13.2)
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('D3_explanations_complete: a hint raise is named and the recomputed level stays Possible', () => {
    const phones = ids(10);
    const events = [...armAll(phones, T0), ...phones.slice(0, 3).map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const ctx = { neighbors: [{ level: 'CONFIRMED' as const, maxK: 6, linked: true }], manualReports: 0 };
    const d = evaluate(initialState(), input(events, T0 + 5 * MIN, { context: ctx }), P).outputs.decisions.at(-1);
    expect(d?.level).toBe('CONFIRMED');
    expect(d?.explanation.raisedBy).toBe('LINKED');
    expect(levelFromExplanation(d?.explanation as never)).toBe('POSSIBLE');
  });

  it('D3_explanations_complete: the HIGH and LOW confidence counts are recorded', () => {
    const phones = ids(5);
    const events = [
      ...armAll(phones, T0),
      ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100, { confidence: i < 2 ? 'LOW' : 'HIGH' })),
    ];
    const d = evaluate(initialState(), input(events, T0 + MIN), P).outputs.decisions.at(-1);
    expect(d?.explanation.confidence).toEqual({ high: 2, low: 2 }); // n = 5 confirms at k = 4: the window holds the first four drops
  });
});

describe('D4_labels', () => {
  const phones = ['a', 'b', 'c'];
  const trio = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];

  it('D4_labels: a label NO removes that unplug from k', () => {
    const none = evaluate(initialState(), input(trio, T0 + MIN), P).outputs.decisions;
    expect(none.some((d) => d.level === 'CONFIRMED')).toBe(true);
    const labeled = evaluate(initialState(), input(trio, T0 + MIN, { labels: [{ installId: 'c', unplugSeq: 2, answer: 'NO' }] }), P).outputs.decisions;
    expect(labeled.some((d) => d.level === 'CONFIRMED')).toBe(false);
    expect(labeled.at(-1)?.explanation.k).toBe(2);
  });

  it('D4_labels: a label NO adds the unplug to the baseline count', () => {
    const day1 = 20_000 * 86_400_000 - P.localOffsetMs;
    const fiveIds = ids(10);
    const mk = (labels: Label[]) => {
      const arm = fiveIds.map((id, i) => ev(id, 1, 'ARMED', day1 + i * SEC));
      const drops = fiveIds.slice(0, 5).map((id, i) => ev(id, 2, 'UNPLUG', day1 + 10 * HOUR + i * 100));
      const after = ['i7', 'i8', 'i9'].map((id, i) => ev(id, 5, 'UNPLUG', day1 + 86_400_000 + 10 * HOUR + 40 * MIN + i * 100));
      const r = evaluate(initialState(), input([...arm, ...drops, ...after], day1 + 4 * 86_400_000, { labels }), P).outputs.decisions;
      return r.find((x) => x.startMs === day1 + 86_400_000 + 10 * HOUR + 40 * MIN)?.explanation.lambdaPerSec as number;
    };
    // Five unplugs inside one 90 s window (a Confirmed outage at n = 10, k = 5): they are not isolated unplugs.
    // Labeling one of them NO makes it a human unplug that counts toward the next day's lambda.
    const without = mk([]);
    const withLabel = mk([{ installId: 'i0', unplugSeq: 2, answer: 'NO' }]);
    expect(withLabel).toBeGreaterThan(without);
  });

  it('D4_labels: a label YES changes no level, explanation or decision', () => {
    fc.assert(
      fc.property(scenarioArb, fc.array(fc.nat(60), { maxLength: 10 }), (scenario, picks) => {
        const events = buildScenario(scenario);
        const unplugs = events.filter((e) => e.type === 'UNPLUG');
        const labels: Label[] = unplugs.length === 0 ? [] : picks.map((i) => ({ installId: unplugs[i % unplugs.length].installId, unplugSeq: unplugs[i % unplugs.length].seq, answer: 'YES' as const }));
        const now = finalNow(events);
        const plain = evaluate(initialState(), input(events, now), P).outputs;
        const yes = evaluate(initialState(), input(events, now, { labels }), P).outputs;
        expect(yes.decisions).toEqual(plain.decisions);
        expect(yes.areaStatus).toEqual(plain.areaStatus);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('D4_labels: a YES drop covered by no outage is a spot state until the next REPLUG', () => {
    const events = [...armAll(['a', 'b', 'c'], T0), ev('a', 2, 'UNPLUG', T0 + HOUR)];
    const labels: Label[] = [{ installId: 'a', unplugSeq: 2, answer: 'YES' }];
    const r = evaluate(initialState(), input(events, T0 + 2 * HOUR, { labels }), P).outputs;
    expect(r.decisions).toEqual([]);
    expect(r.spotStates).toEqual([{ installId: 'a', state: 'SPOT_ONLY', sinceMs: T0 + HOUR }]);
    const back = evaluate(initialState(), input([...events, ev('a', 3, 'REPLUG', T0 + 90 * MIN)], T0 + 2 * HOUR, { labels }), P).outputs;
    expect(back.spotStates).toEqual([]);
  });

  it('D4_labels: a YES drop inside an outage gives no spot state', () => {
    const labels: Label[] = [{ installId: 'a', unplugSeq: 2, answer: 'YES' }];
    const r = evaluate(initialState(), input(trio, T0 + MIN, { labels }), P).outputs;
    expect(r.spotStates).toEqual([]);
  });

  it('D4_labels: label order does not matter and NO wins over YES', () => {
    const a = evaluate(initialState(), input(trio, T0 + MIN, { labels: [{ installId: 'c', unplugSeq: 2, answer: 'YES' }, { installId: 'c', unplugSeq: 2, answer: 'NO' }] }), P).outputs;
    const b = evaluate(initialState(), input(trio, T0 + MIN, { labels: [{ installId: 'c', unplugSeq: 2, answer: 'NO' }, { installId: 'c', unplugSeq: 2, answer: 'YES' }] }), P).outputs;
    expect(a.decisions).toEqual(b.decisions);
  });
});

describe('R12 changes', () => {
  it('R12_1_late_events_update_the_affected_outage_and_appear_in_changes', () => {
    const phones = ids(30);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + i * 100))];
    const a = evaluate(initialState(), input(events, T0 + 2 * MIN), P);
    const b = evaluate(a.state, input([ev('x', 1, 'ARMED', T0 - HOUR), ev('x', 2, 'UNPLUG', T0 + 10)], T0 + 3 * MIN), P);
    expect(b.outputs.changes.length).toBeGreaterThan(0);
    expect(b.outputs.pushes).toEqual([]);
  });

  it('R12_4_clock_skew_is_flagged_and_nothing_throws', () => {
    const r = evaluate(initialState(), input([ev('a', 1, 'ARMED', T0 + 3 * 86_400_000)], T0), P).outputs;
    expect(r.clockSkew).toBe(true);
  });
});
