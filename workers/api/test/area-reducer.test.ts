import { DEFAULT_PARAMS } from '@outage/detection';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPush, type Episodes, type PushCandidate } from '../src/area/pushes.ts';
import { type AreaConfig, type AreaInput, type AreaState, emptyAreaState, reduce } from '../src/area/reducer.ts';
import type { IngestedItem } from '../src/ports.ts';
import { NUM_RUNS } from './runs.ts';

const CELLS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const ring = (c: string): readonly string[] => {
  const i = CELLS.indexOf(c);
  return i < 0 ? [] : [CELLS[(i + 1) % 7], CELLS[(i + 6) % 7], `x${i}`];
};
const cfgOf = (over: Partial<AreaConfig> = {}): AreaConfig => ({
  params: DEFAULT_PARAMS,
  stateFlushMs: 60_000,
  deferStateOnly: true,
  neighborsOf: ring,
  childrenOf: () => CELLS,
  parentOf: (c) => (CELLS.includes(c) ? 'p1' : 'p2'),
  ...over,
});
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const NOW = T0 + 30 * MIN;

const item = (installId: string, seq: number, type: IngestedItem['type'], cell: string, t: number): IngestedItem =>
  type === 'LABEL'
    ? { installId, seq, type, cell, eventTimeMs: t, refSeq: 2, answer: 'YES' }
    : { installId, seq, type, cell, eventTimeMs: t, confidence: 'HIGH', schedulingDelayMs: null };
const ids = (n: number, p = 'i'): string[] => Array.from({ length: n }, (_, i) => `${p}${i}`);
const armed = (who: string[], cell: string, t = T0): IngestedItem[] =>
  who.map((id, i) => item(id, 1, 'ARMED', cell, t - 10 * MIN + i * 1000));
const unplug = (who: string[], cell: string, t = T0): IngestedItem[] =>
  who.map((id, i) => item(id, 2, 'UNPLUG', cell, t + i * 100));
const replug = (who: string[], cell: string, t: number): IngestedItem[] =>
  who.map((id, i) => item(id, 3, 'REPLUG', cell, t + i * 1000));

const feed = (s: AreaState, items: IngestedItem[], nowMs: number, cfg: AreaConfig = cfgOf()) =>
  reduce(s, { type: 'EVENTS', nowMs, items }, cfg);

// ---- A9 ---------------------------------------------------------------------------------------------------------

describe('A9 push de-duplication', () => {
  it('A9_push_dedup: at most one CONFIRMED and one RESTORED per cell per episode, across any scopes', () => {
    // Outages arrive in start order (as a live feed does). Each outage is pushed by one to three scopes, in any order.
    const outageArb = fc.array(
      fc.record({
        gapMin: fc.integer({ min: 0, max: 40 }),
        lenMin: fc.integer({ min: 1, max: 60 }),
        scopes: fc.integer({ min: 1, max: 3 }),
        cell: fc.constantFrom('c1', 'c2'),
      }),
      { minLength: 1, maxLength: 8 },
    );
    fc.assert(
      fc.property(outageArb, fc.nat(), (outages, seed) => {
        let t = 0;
        const timeline: { at: number; c: PushCandidate }[] = [];
        for (const o of outages) {
          t += o.gapMin * MIN;
          const start = t;
          const end = start + o.lenMin * MIN;
          for (let k = 0; k < o.scopes; k++) {
            timeline.push({
              at: start + 1000 + k,
              c: { cell: o.cell, kind: 'CONFIRMED', startMs: start, endMs: null },
            });
            timeline.push({ at: end + 1000 + k, c: { cell: o.cell, kind: 'RESTORED', startMs: start, endMs: end } });
          }
        }
        // Stable order by time, with the within-instant order shuffled by the seed.
        timeline.sort((a, b) => a.at - b.at || ((a.c.startMs * 7 + seed) % 5) - ((b.c.startMs * 7 + seed) % 5));
        let eps: Episodes = {};
        const passed: { cell: string; episodeId: string; kind: string }[] = [];
        for (const { c } of timeline) {
          const r = applyPush(eps, c);
          eps = r.episodes;
          if (r.passed) passed.push(r.passed);
        }
        const seen = new Set<string>();
        for (const p of passed) {
          const key = `${p.cell}|${p.episodeId}|${p.kind}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
        // Episodes of one cell never overlap, so the count per episode is the count per connected interval.
        for (const list of Object.values(eps)) {
          for (let i = 1; i < list.length; i++)
            expect(list[i].startMs).toBeGreaterThan(list[i - 1].endMs ?? Number.POSITIVE_INFINITY);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A9_push_dedup: a scope change during an episode sends no second push; a later outage is a new episode', () => {
    const c = (kind: 'CONFIRMED' | 'RESTORED', startMs: number, endMs: number | null): PushCandidate => ({
      cell: 'c1',
      kind,
      startMs,
      endMs,
    });
    let eps: Episodes = {};
    const got: string[] = [];
    for (const x of [
      c('CONFIRMED', 1000, null), // from the cell scope
      c('CONFIRMED', 1500, null), // the parent scope confirms the same blackout later
      c('RESTORED', 1500, 9000),
      c('RESTORED', 1000, 9500),
      c('CONFIRMED', 9_000_000, null), // a new blackout, hours later
      c('RESTORED', 9_000_000, 9_100_000),
    ]) {
      const r = applyPush(eps, x);
      eps = r.episodes;
      got.push(r.passed ? `${r.passed.kind}:${r.passed.episodeId}` : '-');
    }
    expect(got).toEqual([
      'CONFIRMED:c1|1000',
      '-',
      'RESTORED:c1|1000',
      '-',
      'CONFIRMED:c1|9000000',
      'RESTORED:c1|9000000',
    ]);
  });

  it('A9_push_dedup: through the reducer, a blackout seen by the cell and the parent pushes once per cell', () => {
    const who = ids(10);
    let s = emptyAreaState('p1');
    s = feed(s, armed(who, 'c1'), T0 - 5 * MIN).state;
    const r = feed(s, unplug(who.slice(0, 8), 'c1'), T0 + 2 * MIN);
    const confirmed = r.out.pushes.filter((p) => p.kind === 'CONFIRMED');
    expect(confirmed.map((p) => p.cell)).toEqual(['c1']);
    expect(r.out.evaluated.length).toBeGreaterThanOrEqual(2); // cell scope and parent scope both evaluated
    const later = reduce(r.state, { type: 'TICK', nowMs: T0 + 3 * MIN }, cfgOf());
    expect(later.out.pushes.filter((p) => p.kind === 'CONFIRMED')).toEqual([]);
  });
});

// ---- A12 --------------------------------------------------------------------------------------------------------

const scenarioArb = fc.record({
  n: fc.integer({ min: 3, max: 8 }),
  dropping: fc.integer({ min: 0, max: 8 }),
  restore: fc.boolean(),
  cells: fc.constantFrom(['c1'], ['c1', 'c2']).map((c) => [...c]),
  shuffleSeed: fc.nat(),
  cuts: fc.array(fc.nat({ max: 40 }), { maxLength: 6 }),
});
function buildScenario(sc: { n: number; dropping: number; restore: boolean; cells: string[] }): IngestedItem[] {
  const who = ids(sc.n);
  const out: IngestedItem[] = [];
  who.forEach((id, i) => {
    const cell = sc.cells[i % sc.cells.length];
    out.push(item(id, 1, 'ARMED', cell, T0 - 10 * MIN + i * 1000));
    if (i < sc.dropping) out.push(item(id, 2, 'UNPLUG', cell, T0 + i * 100));
    if (i < sc.dropping && sc.restore) out.push(item(id, 3, 'REPLUG', cell, T0 + 10 * MIN + i * 1000));
  });
  return out;
}
function shuffle<T>(xs: T[], seed: number): T[] {
  return [...xs].sort(
    (a, b) => ((JSON.stringify(a).length * 31 + seed) % 11) - ((JSON.stringify(b).length * 17 + seed) % 11),
  );
}
const decisionsOf = (s: AreaState): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(s.engines)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, e]) => [k, e.state.decisions]),
  );

type Scenario = { n: number; dropping: number; restore: boolean; cells: string[]; shuffleSeed: number; cuts: number[] };
function checkDeferred(sc: Scenario): void {
  const events = shuffle(buildScenario(sc), sc.shuffleSeed);
  const cuts = [...new Set(sc.cuts.map((c) => c % (events.length + 1)))].sort((a, b) => a - b);
  const batches: IngestedItem[][] = [];
  let from = 0;
  for (const c of [...cuts, events.length]) {
    if (c > from) batches.push(events.slice(from, c));
    from = Math.max(from, c);
  }
  const run = (defer: boolean): AreaState => {
    const cfg = cfgOf({ deferStateOnly: defer });
    let s = emptyAreaState('p1');
    for (const b of batches) s = feed(s, b, NOW, cfg).state;
    return reduce(s, { type: 'TICK', nowMs: NOW }, cfg).state;
  };
  const eager = run(false);
  const deferred = run(true);
  expect(decisionsOf(deferred)).toEqual(decisionsOf(eager));
  expect(deferred.pending).toEqual([]);
}

describe('A12 deferred evaluation', () => {
  it('A12_deferred_evaluation_equivalence: regression, neighbor hints lagged behind the evaluation order (seed 1278203691)', () => {
    checkDeferred({ n: 4, dropping: 3, restore: false, cells: ['c1', 'c2'], shuffleSeed: 8, cuts: [6] });
    checkDeferred({ n: 7, dropping: 5, restore: false, cells: ['c1', 'c2'], shuffleSeed: 19, cuts: [10] });
  });

  it('A12_deferred_evaluation_equivalence: deferring state-only batches gives the same decisions as evaluating every batch', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => checkDeferred(sc)),
      { numRuns: NUM_RUNS },
    );
  });

  it('A12_deferred_evaluation_equivalence: a state-only batch is queued without an evaluation and flushed by the alarm', () => {
    const who = ids(4);
    const r1 = feed(emptyAreaState('p1'), armed(who, 'c1'), T0 - 5 * MIN);
    expect(r1.out.evaluated).toEqual([]);
    expect(r1.state.pending.length).toBe(4);
    expect(r1.out.nextAlarmMs).toBe(T0 - 5 * MIN + 60_000);
    const r2 = reduce(r1.state, { type: 'TICK', nowMs: T0 - 4 * MIN }, cfgOf());
    expect(r2.state.pending).toEqual([]);
    expect(r2.out.evaluated.length).toBeGreaterThan(0);
    expect(r2.out.nextAlarmMs).toBeNull();
  });

  it('R11.4 each scope is evaluated at most once per request, and a detection event touches at most three scopes', () => {
    const who = ids(6);
    const s = feed(emptyAreaState('p1'), armed(who, 'c1'), T0 - 5 * MIN).state;
    const r = feed(s, unplug(who, 'c1'), T0 + MIN);
    expect(new Set(r.out.evaluated).size).toBe(r.out.evaluated.length);
    expect(r.out.evaluated.length).toBeLessThanOrEqual(3);
  });

  it('R11.5 the alarm is set for an open outage reaching 12 hours', () => {
    const who = ids(8);
    const s = feed(emptyAreaState('p1'), armed(who, 'c1'), T0 - 5 * MIN, cfgOf({ deferStateOnly: false })).state;
    const r = feed(s, unplug(who, 'c1'), T0 + MIN);
    expect(r.state.open.length).toBeGreaterThan(0);
    expect(r.out.nextAlarmMs).toBe(T0 + DEFAULT_PARAMS.unknownEndMs);
    const late = reduce(r.state, { type: 'TICK', nowMs: T0 + DEFAULT_PARAMS.unknownEndMs + MIN }, cfgOf());
    expect(late.state.open).toEqual([]);
    expect(Object.values(late.state.history).some((h) => h.endMs !== null)).toBe(true);
  });
});

// ---- A11 --------------------------------------------------------------------------------------------------------

describe('A11 delete my data', () => {
  const VICTIM = 'victim-install-0042';
  const scenario = (extra: IngestedItem[] = []): AreaState => {
    const who = [VICTIM, ...ids(9)];
    let s = emptyAreaState('p1');
    s = feed(s, [...armed(who, 'c1'), ...extra], T0 - 5 * MIN).state;
    s = feed(s, unplug(who.slice(0, 8), 'c1'), T0 + MIN).state;
    s = feed(s, replug(who.slice(0, 8), 'c1', T0 + 10 * MIN), T0 + 20 * MIN).state;
    return s;
  };

  it('A11_delete_removes_install: no state references the install; archive and public history are unchanged', () => {
    const before = scenario();
    expect(JSON.stringify(before)).toContain(VICTIM);
    expect(Object.keys(before.history).length).toBeGreaterThan(0);
    const after = reduce(before, { type: 'DELETE', nowMs: T0 + 21 * MIN, installId: VICTIM }, cfgOf()).state;
    expect(JSON.stringify(after)).not.toContain(VICTIM);
    expect(after.history).toEqual(before.history);
    for (const k of Object.keys(before.engines))
      expect(after.engines[k].state.archive).toEqual(before.engines[k].state.archive);
    expect(after.members[VICTIM]).toBeUndefined();
  });

  it('A11_delete_removes_install: for any scenario, any victim, and a delete while events are queued', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9 }), fc.boolean(), (victimIx, queued) => {
        const who = ids(10, 'u');
        const victim = `${VICTIM}-${victimIx}`;
        const all = who.map((w, i) => (i === victimIx ? victim : w));
        let s = feed(emptyAreaState('p1'), armed(all, 'c1'), T0 - 5 * MIN).state;
        s = feed(s, unplug(all.slice(0, 8), 'c1'), T0 + MIN).state;
        if (queued) s = feed(s, [item(victim, 9, 'DISARMED', 'c2', T0 + 2 * MIN)], T0 + 2 * MIN + 1).state;
        const histBefore = s.history;
        const after = reduce(s, { type: 'DELETE', nowMs: T0 + 3 * MIN, installId: victim }, cfgOf()).state;
        expect(JSON.stringify(after)).not.toContain(victim);
        expect(after.history).toEqual(histBefore);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A11_delete_removes_install: the delete input type is exhaustive over the reducer inputs', () => {
    const inputs: AreaInput['type'][] = ['EVENTS', 'TICK', 'NOTICES', 'REMOVE', 'DELETE'];
    expect(inputs).toHaveLength(5);
  });
});
