// area-cells task 11: scenarios against the pure reducer (design section 12). The engine runs as a library.
import { DEFAULT_PARAMS } from '@outage/detection';
import { describe, expect, it } from 'vitest';
import { type AreaConfig, type AreaState, emptyAreaState, openOutages, reduce } from '../api/area/reducer.ts';
import { cellStatus } from '../api/area/scope.ts';
import type { IngestedItem } from '../api/ingest/ports.ts';

const P1_CELLS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const P2_CELLS = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'];
const parentOf = (c: string): string => (P1_CELLS.includes(c) ? 'p1' : 'p2');
// A line of cells: c1 - c2 - ... - c7 - x1 - x2 - ... ; c7 and x1 are neighbors across the parent border.
const LINE = [...P1_CELLS, ...P2_CELLS];
const neighborsOf = (c: string): readonly string[] => {
  const i = LINE.indexOf(c);
  return [LINE[i - 1], LINE[i + 1]].filter((x): x is string => x !== undefined);
};
const cfgFor = (_parent: string): AreaConfig => ({
  params: DEFAULT_PARAMS,
  stateFlushMs: 60_000,
  deferStateOnly: true,
  neighborsOf,
  childrenOf: (p) => (p === 'p1' ? P1_CELLS : P2_CELLS),
  parentOf,
});
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

type Phone = { id: string; cell: string; seq: number };
const phones = (cell: string, n: number, prefix = cell): Phone[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-p${i}`, cell, seq: 0 }));
const ev = (p: Phone, type: IngestedItem['type'], t: number): IngestedItem => {
  p.seq += 1;
  return type === 'LABEL'
    ? { installId: p.id, seq: p.seq, type, cell: p.cell, eventTimeMs: t, refSeq: 0, answer: 'YES' }
    : { installId: p.id, seq: p.seq, type, cell: p.cell, eventTimeMs: t, confidence: 'HIGH', schedulingDelayMs: null };
};
const arm = (ps: Phone[], t: number) => ps.map((p, i) => ev(p, 'ARMED', t + i * 1000));
const cut = (ps: Phone[], t: number) => ps.map((p, i) => ev(p, 'UNPLUG', t + i * 150));
const back = (ps: Phone[], t: number) => ps.map((p, i) => ev(p, 'REPLUG', t + i * 1000));

const step = (s: AreaState, items: IngestedItem[], nowMs: number) =>
  reduce(s, { type: 'EVENTS', nowMs, items }, cfgFor(s.parent));
const viewOf = (out: ReturnType<typeof step>['out'], key: string) => out.views.find((v) => v.scopeKey === key)?.view;
const sel = (s: AreaState, nowMs: number) => ({
  members: new Map(Object.entries(s.members)),
  nowMs,
  parent: s.parent,
  parentCells: P1_CELLS,
  groups: s.groups,
});

describe('area-cells scenarios', () => {
  it('R4 8 phones in one cell, 2 in a neighbor, 1 elsewhere: the dense cell is CELL, the sparse ones are COARSE and unpublished', () => {
    const dense = phones('c1', 8);
    const sparse = phones('c2', 2);
    const lone = phones('c5', 1);
    const all = [...dense, ...sparse, ...lone];
    let s = emptyAreaState('p1');
    s = step(s, arm(all, T0 - 20 * MIN), T0 - 10 * MIN).state;
    const r = step(s, cut(all, T0), T0 + 2 * MIN);
    s = r.state;
    const now = T0 + 2 * MIN;
    const open = openOutages(s);
    expect(cellStatus('c1', sel(s, now), open)).toMatchObject({ scope: { kind: 'CELL', precision: 'CELL' } });
    expect(cellStatus('c2', sel(s, now), open).scope.precision).toBe('COARSE');
    expect(cellStatus('c5', sel(s, now), open).scope.precision).toBe('COARSE');
    expect(viewOf(r.out, 'cell:c1')).toMatchObject({ precision: 'CELL', phones: '3+' });
    expect(viewOf(r.out, 'cell:c2')).toBeNull(); // 2 members: no boundary, no status (R9.2)
    expect(viewOf(r.out, 'cell:c5')).toBeNull();
    expect(viewOf(r.out, 'parent:p1')).toMatchObject({ precision: 'COARSE', boundary: ['p1'] });
    expect(JSON.stringify(r.out.views)).not.toContain('-p0');
  });

  it('R4.2 a 30-phone outage still confirms at CELL precision and pushes once for the cell', () => {
    const ps = phones('c3', 30);
    let s = emptyAreaState('p1');
    s = step(s, arm(ps, T0 - 40 * MIN), T0 - 5 * MIN).state;
    const r = step(s, cut(ps, T0), T0 + 2 * MIN);
    expect(viewOf(r.out, 'cell:c3')).toMatchObject({
      status: 'CONFIRMED',
      precision: 'CELL',
      openOutage: { level: 'CONFIRMED' },
    });
    expect(r.out.pushes.filter((p) => p.kind === 'CONFIRMED' && p.cell === 'c3')).toHaveLength(1);
    const restored = step(r.state, back(ps, T0 + 30 * MIN), T0 + 40 * MIN);
    expect(restored.out.pushes.filter((p) => p.kind === 'RESTORED' && p.cell === 'c3')).toHaveLength(1);
    expect(viewOf(restored.out, 'cell:c3')).toMatchObject({ status: 'NORMAL' });
  });

  it('R6 three sparse cells link after 3 co-outages, then the next outage confirms in the group at LINKED precision', () => {
    const a = phones('c2', 2);
    const b = phones('c3', 2);
    const c = phones('c4', 2);
    const all = [...a, ...b, ...c];
    let s = emptyAreaState('p1');
    s = step(s, arm(all, T0 - 20 * MIN), T0 - 10 * MIN).state;
    for (let k = 0; k < 3; k++) {
      const t = T0 + k * 6 * HOUR;
      s = step(s, cut(all, t), t + 2 * MIN).state;
      s = step(s, back(all, t + 20 * MIN), t + 30 * MIN).state;
    }
    expect(s.links).toEqual(['c2|c3', 'c2|c4', 'c3|c4']);
    expect(s.groups).toEqual([{ cells: ['c2', 'c3', 'c4'] }]);
    const t4 = T0 + 18 * HOUR;
    const sel4 = sel(s, t4);
    expect(cellStatus('c3', sel4, []).scope).toMatchObject({ kind: 'GROUP', precision: 'LINKED' });
    const r = step(s, cut(all, t4), t4 + 2 * MIN);
    expect(viewOf(r.out, 'group:c2')).toMatchObject({
      status: 'CONFIRMED',
      precision: 'LINKED',
      boundary: ['c2', 'c3', 'c4'],
    });
    expect(r.state.counters.links_formed).toBe(3);
    // One push per cell for the episode, though the group and the parent both confirmed it.
    const confirmed = r.out.pushes
      .filter((p) => p.kind === 'CONFIRMED')
      .map((p) => p.cell)
      .sort();
    expect(confirmed).toEqual([...new Set(confirmed)]);
  });

  it('R7 a level change on the parent border sends a notice to the neighbor parent, which hints its own scope', () => {
    const ps = phones('c7', 8);
    let s1 = emptyAreaState('p1');
    s1 = step(s1, arm(ps, T0 - 20 * MIN), T0 - 10 * MIN).state;
    const r1 = step(s1, cut(ps, T0), T0 + 2 * MIN);
    const toP2 = r1.out.notices.find((b) => b.toParent === 'p2');
    expect(toP2?.notices.map((n) => n.cell)).toContain('c7');
    expect(toP2?.createIfMissing).toBe(true);
    expect(toP2?.notices.every((n) => n.level === 'CONFIRMED' && n.maxK >= 3)).toBe(true);

    // In p2, x1 has 10 phones and 3 drop: k = 3 of n = 10 is only POSSIBLE alone; the neighbor notice raises it.
    const xs = phones('x1', 10);
    let s2 = emptyAreaState('p2');
    s2 = step(s2, arm(xs, T0 - 20 * MIN), T0 - 10 * MIN).state;
    const alone = step(s2, cut(xs.slice(0, 3), T0), T0 + 2 * MIN);
    expect(viewOf(alone.out, 'cell:x1')?.status).toBe('POSSIBLE');
    const hinted = reduce(
      alone.state,
      { type: 'NOTICES', nowMs: T0 + 3 * MIN, notices: toP2?.notices ?? [] },
      cfgFor('p2'),
    );
    expect(hinted.out.evaluated).toContain('cell:x1');
    expect(viewOf(hinted.out, 'cell:x1')?.status).toBe('CONFIRMED');
    const raised = hinted.state.engines['cell:x1'].state.decisions.find((d) => d.kind === 'RAISED');
    expect(raised?.explanation.raisedBy).toBe('NEIGHBOR');
    // Scopes that do not touch the notice cell are not re-evaluated (R7.6).
    expect(hinted.out.evaluated.every((k) => k === 'cell:x1' || k === 'parent:p2')).toBe(true);
  });
});
