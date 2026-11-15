// field-telemetry task 3: OUTAGE_RECORD and MISS from the area reducer (R5, F4 reducer part).
import { DEFAULT_PARAMS } from '@outage/detection';
import { type FieldRecord, classifyOutage } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { type AreaConfig, type AreaState, emptyAreaState, nextAlarm, reduce } from '../src/area/reducer.ts';
import type { IngestedItem } from '../src/ingest/ports.ts';

const CELLS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const cfg: AreaConfig = {
  params: DEFAULT_PARAMS,
  stateFlushMs: 60_000,
  deferStateOnly: true,
  neighborsOf: () => [],
  childrenOf: () => CELLS,
  parentOf: () => 'p1',
};
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

type Phone = { id: string; cell: string; seq: number };
const phones = (cell: string, n: number): Phone[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${cell}-secretinstall${i}`, cell, seq: 0 }));
const base = (p: Phone, t: number) => ({ installId: p.id, seq: ++p.seq, cell: p.cell, eventTimeMs: t });
const plain = (p: Phone, type: 'ARMED' | 'UNPLUG' | 'REPLUG', t: number): IngestedItem => ({
  ...base(p, t),
  type,
  confidence: 'HIGH',
  schedulingDelayMs: null,
});
const label = (p: Phone, refSeq: number, answer: 'YES' | 'NO', t: number): IngestedItem => ({
  ...base(p, t),
  type: 'LABEL',
  refSeq,
  answer,
});
const arm = (ps: Phone[], t: number) => ps.map((p, i) => plain(p, 'ARMED', t + i * 1000));
const cut = (ps: Phone[], t: number) => ps.map((p, i) => plain(p, 'UNPLUG', t + i * 150));

const step = (s: AreaState, items: IngestedItem[], nowMs: number) => reduce(s, { type: 'EVENTS', nowMs, items }, cfg);
const tick = (s: AreaState, nowMs: number) => reduce(s, { type: 'TICK', nowMs }, cfg);
const outages = (r: FieldRecord[]) => r.filter((x) => x.kind === 'OUTAGE_RECORD');
const misses = (r: FieldRecord[]) => r.filter((x) => x.kind === 'MISS');

/** 30 phones in c3, armed, all unplugged at T0: a Confirmed outage (area-scenarios R4.2). */
function confirmedOutage() {
  const ps = phones('c3', 30);
  let s = emptyAreaState('p1');
  s = step(s, arm(ps, T0 - 40 * MIN), T0 - 5 * MIN).state;
  const r = step(s, cut(ps, T0), T0 + 2 * MIN);
  return { ps, s: r.state, out: r.out };
}

describe('F4_outage_classes (reducer)', () => {
  it('R5.1 a Confirmed outage emits one OUTAGE_RECORD (its CELL scope, not also the parent) with counts only', () => {
    const { out } = confirmedOutage();
    const recs = outages(out.fieldRecords);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      kind: 'OUTAGE_RECORD',
      scopeClass: 'CELL',
      level: 'CONFIRMED',
      endMs: null,
      labelsYes: 0,
      labelsNo: 0,
      labelsNone: 30,
      withdrawn: false,
    });
    expect(recs[0].drops).toBeGreaterThanOrEqual(3);
    expect(recs[0].armedN).toBe(30);
    expect(recs[0].confirmedMs).not.toBeNull();
  });

  it('R5.1 labels change the counts and re-emit the record; nothing changes, nothing is emitted', () => {
    const { ps, s, out } = confirmedOutage();
    const first = outages(out.fieldRecords)[0];
    // UNPLUG seq is 2 (ARMED was 1). Five No, one Yes.
    const labels = [
      ...ps.slice(0, 5).map((p, i) => label(p, 2, 'NO', T0 + 3 * MIN + i)),
      label(ps[5], 2, 'YES', T0 + 3 * MIN + 9),
    ];
    const r = step(s, labels, T0 + 4 * MIN);
    const next = outages(r.out.fieldRecords);
    expect(next).toHaveLength(1);
    // The engine treats the 5 No drops as human unplugs and re-dates the outage; the record keeps its key and start.
    expect(next[0]).toMatchObject({
      key: first.key,
      startMs: T0,
      withdrawn: false,
      labelsYes: 1,
      labelsNo: 5,
      labelsNone: 24,
    });
    expect(classifyOutage(next[0])).toBe('CONFIRMED_TRUE');
    const again = tick(r.state, T0 + 5 * MIN);
    expect(again.out.fieldRecords).toEqual([]);
  });

  it('R5.2 all No on every drop is a false alarm: the engine drops the outage, the record is withdrawn with the counts', () => {
    const { ps, s, out } = confirmedOutage();
    const first = outages(out.fieldRecords)[0];
    const r = step(
      s,
      ps.map((p, i) => label(p, 2, 'NO', T0 + 3 * MIN + i)),
      T0 + 4 * MIN,
    );
    const rec = outages(r.out.fieldRecords)[0];
    expect(rec).toMatchObject({
      key: first.key,
      level: 'CONFIRMED',
      withdrawn: true,
      labelsYes: 0,
      labelsNo: 30,
      labelsNone: 0,
    });
    expect(classifyOutage(rec)).toBe('FALSE_ALARM');
  });

  it('R5.1 the record is updated when the outage closes', () => {
    const { ps, s } = confirmedOutage();
    const r = step(
      s,
      ps.map((p, i) => plain(p, 'REPLUG', T0 + 30 * MIN + i * 1000)),
      T0 + 40 * MIN,
    );
    const rec = outages(r.out.fieldRecords)[0];
    expect(rec.endMs).not.toBeNull();
    expect(rec.level).toBe('CONFIRMED');
  });

  it('R1.2 no record holds an install ID, a cell, a scope key or the parent', () => {
    const { ps, s, out } = confirmedOutage();
    const r = step(s, [label(ps[0], 2, 'YES', T0 + 3 * MIN)], T0 + 4 * MIN);
    const text = JSON.stringify([...out.fieldRecords, ...r.out.fieldRecords]);
    expect(text).not.toContain('secretinstall');
    expect(text).not.toMatch(/c3|cell:|parent:|p1/);
    for (const rec of outages([...out.fieldRecords, ...r.out.fieldRecords])) expect(rec.key).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('R5.5 MISS', () => {
  const W = DEFAULT_PARAMS.windowMs;
  const lone = () => {
    const solo = phones('c5', 1);
    let s = emptyAreaState('p1');
    s = step(s, arm(solo, T0 - 30 * MIN), T0 - 20 * MIN).state;
    s = step(s, cut(solo, T0), T0 + 1000).state;
    return { solo, s };
  };

  it('a Yes label on a lone phone that no outage covers becomes a MISS after one window, with the armed count and no identifier', () => {
    const { solo, s } = lone();
    const r = step(s, [label(solo[0], 2, 'YES', T0 + 20_000)], T0 + 20_000);
    expect(misses(r.out.fieldRecords)).toEqual([]); // the engine has not had its full window yet
    expect(r.state.missPending).toHaveLength(1);
    expect(nextAlarm(r.state, cfg)).toBeLessThanOrEqual(T0 + W);
    const later = tick(r.state, T0 + W + 1000);
    expect(misses(later.out.fieldRecords)).toEqual([{ kind: 'MISS', atMs: T0, armedN: 1 }]);
    expect(JSON.stringify(later.out.fieldRecords)).not.toMatch(/secretinstall|c5|p1/);
    const again = tick(later.state, T0 + 2 * HOUR);
    expect(misses(again.out.fieldRecords)).toEqual([]); // reported once
  });

  it('a Yes label whose unplug is inside an outage is not a miss', () => {
    const { ps, s } = confirmedOutage();
    let r = step(s, [label(ps[0], 2, 'YES', T0 + 3 * MIN)], T0 + 4 * MIN);
    r = tick(r.state, T0 + W + 10 * MIN);
    expect(misses(r.out.fieldRecords)).toEqual([]);
    expect(r.state.missPending).toEqual([]);
  });

  it('a No label is never a miss, and No on the same unplug cancels a Yes', () => {
    const { solo, s: s0 } = lone();
    let s = step(s0, [label(solo[0], 2, 'NO', T0 + 10_000)], T0 + 10_000).state;
    expect(s.missPending).toEqual([]);
    s = step(s, [label(solo[0], 2, 'YES', T0 + 20_000)], T0 + 20_000).state;
    expect(s.missPending).toHaveLength(1);
    const r = tick(s, T0 + W + 1000);
    expect(misses(r.out.fieldRecords)).toEqual([]);
  });

  it("delete-my-data drops the install's pending Yes label", () => {
    const { solo, s: s0 } = lone();
    let s = step(s0, [label(solo[0], 2, 'YES', T0 + 20_000)], T0 + 20_000).state;
    expect(s.missPending).toHaveLength(1);
    s = reduce(s, { type: 'DELETE', nowMs: T0 + 30_000, installId: solo[0].id }, cfg).state;
    expect(s.missPending).toEqual([]);
    expect(misses(tick(s, T0 + W + 1000).out.fieldRecords)).toEqual([]);
  });
});
