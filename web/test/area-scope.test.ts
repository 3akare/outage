import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Member, type Members, RECENTLY_ARMED_MS } from '../api/area/members.ts';
import {
  armedIn,
  cellKey,
  cellStatus,
  type Group,
  groupKey,
  type OpenOutage,
  parentKey,
  pinnedScopes,
  routeScopes,
  type SelectInput,
  selectScope,
} from '../api/area/scope.ts';
import { NUM_RUNS } from './runs.ts';

const PARENT = 'p1';
const CELLS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const NOW = 1_000_000_000_000;

const memberArb: fc.Arbitrary<Member> = fc
  .record({
    cell: fc.constantFrom(...CELLS),
    weight: fc.constantFrom(0.2, 0.5, 1),
    armed: fc.boolean(),
    ageH: fc.integer({ min: 0, max: 40 }),
  })
  .map(({ cell, weight, armed, ageH }) => ({
    cell,
    weight,
    armed,
    lastEventMs: NOW - ageH * 3_600_000,
    armedDecidedMs: NOW - ageH * 3_600_000,
    lastArmedMs: NOW - ageH * 3_600_000,
    armedSinceMs: armed ? NOW - ageH * 3_600_000 : null,
  }));
const membersArb: fc.Arbitrary<Members> = fc
  .array(memberArb, { maxLength: 30 })
  .map((ms) => new Map(ms.map((m, i) => [`i${i}`, m])));
const groupsArb: fc.Arbitrary<Group[]> = fc
  .array(fc.subarray(CELLS, { minLength: 2, maxLength: 4 }), { maxLength: 2 })
  .map((gs) => {
    // Disjoint groups only.
    const used = new Set<string>();
    const out: Group[] = [];
    for (const g of gs) {
      const cells = g.filter((c) => !used.has(c));
      if (cells.length < 2) continue;
      for (const c of cells) used.add(c);
      out.push({ cells });
    }
    return out;
  });
const sel = (members: Members, groups: Group[]): SelectInput => ({
  members,
  nowMs: NOW,
  parent: PARENT,
  parentCells: CELLS,
  groups,
});

describe('A1 scope selection', () => {
  it('A1_scope_selection: pure function of recently armed members and groups; sparse cells never use CELL; labels match the scope', () => {
    fc.assert(
      fc.property(membersArb, groupsArb, fc.constantFrom(...CELLS), (members, groups, cell) => {
        const s = selectScope(cell, sel(members, groups));
        expect(s).toEqual(
          selectScope(
            cell,
            sel(
              new Map(members),
              groups.map((g) => ({ cells: [...g.cells].reverse() })),
            ),
          ),
        );
        const own = armedIn(members, [cell], NOW);
        if (own < 3) expect(s.kind).not.toBe('CELL');
        else expect(s.kind).toBe('CELL');
        if (s.kind !== 'CELL') expect(s.precision).not.toBe('CELL');
        expect(s.precision).toBe({ CELL: 'CELL', GROUP: 'LINKED', PARENT: 'COARSE' }[s.kind]);
        if (s.kind === 'GROUP') {
          const g = groups.find((x) => x.cells.includes(cell));
          expect(g).toBeDefined();
          expect(armedIn(members, g?.cells ?? [], NOW)).toBeGreaterThanOrEqual(3);
          expect(s.key).toBe(groupKey(g?.cells ?? []));
        }
        if (s.kind === 'PARENT') expect(s.key).toBe(parentKey(PARENT));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A1_scope_selection: recently armed means armed within 24 hours, weight 0.5 or more', () => {
    const m = (cell: string, ageMs: number, weight = 1): Member => ({
      cell,
      weight,
      armed: false,
      lastEventMs: NOW - ageMs,
      armedDecidedMs: NOW - ageMs,
      lastArmedMs: NOW - ageMs,
      armedSinceMs: null,
    });
    const members: Members = new Map([
      ['a', m('c1', 1000)],
      ['b', m('c1', RECENTLY_ARMED_MS)],
      ['c', m('c1', RECENTLY_ARMED_MS + 1)],
      ['d', m('c1', 1000, 0.2)],
    ]);
    expect(armedIn(members, ['c1'], NOW)).toBe(2);
    expect(selectScope('c1', sel(members, [])).kind).toBe('PARENT');
  });

  it('A1_scope_selection: routing sends an event to its cell, its group and the parent, at most three scopes', () => {
    const r = routeScopes('c2', { parent: PARENT, parentCells: CELLS, groups: [{ cells: ['c2', 'c3'] }] });
    expect(r.map((s) => s.key)).toEqual([cellKey('c2'), groupKey(['c3', 'c2']), parentKey(PARENT)]);
    expect(routeScopes('c4', { parent: PARENT, parentCells: CELLS, groups: [{ cells: ['c2', 'c3'] }] })).toHaveLength(
      2,
    );
  });
});

const openArb = (groups: Group[]): fc.Arbitrary<OpenOutage[]> =>
  fc.array(
    fc.constantFrom(...CELLS).chain((cell) =>
      fc.record({
        outageId: fc.string({ minLength: 1, maxLength: 4 }),
        level: fc.constantFrom('POSSIBLE', 'CONFIRMED' as const),
        scope: fc.constantFrom(...routeScopes(cell, { parent: PARENT, parentCells: CELLS, groups })),
      }),
    ),
    { maxLength: 6 },
  );

describe('A2 no CONFIRMED for a sparse cell at CELL precision', () => {
  it('A2_no_confirmed_for_sparse_cell: any membership, groups and open outages', () => {
    fc.assert(
      fc.property(membersArb, groupsArb, fc.constantFrom(...CELLS), (members, groups, cell) =>
        fc.assert(
          fc.property(openArb(groups), (open) => {
            const st = cellStatus(cell, sel(members, groups), open);
            if (st.scope.kind === 'CELL' && armedIn(members, [cell], NOW) < 3) expect(st.level).not.toBe('CONFIRMED');
          }),
          { numRuns: 5 },
        ),
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A2_no_confirmed_for_sparse_cell: a CELL outage confirmed earlier is shown as POSSIBLE once the cell is sparse', () => {
    const open: OpenOutage[] = [{ outageId: 'o', level: 'CONFIRMED', scope: selectScope('c1', sel(new Map(), [])) }];
    const cellScope = routeScopes('c1', { parent: PARENT, parentCells: CELLS, groups: [] })[0];
    const st = cellStatus('c1', sel(new Map(), []), [{ ...open[0], scope: cellScope }]);
    expect(st).toMatchObject({ level: 'POSSIBLE', scope: { kind: 'CELL' } });
  });
});

describe('A3 open outages keep their scope', () => {
  it('A3_open_outage_keeps_scope: changing membership never changes, closes or duplicates an open outage', () => {
    fc.assert(
      fc.property(membersArb, membersArb, groupsArb, groupsArb, fc.constantFrom(...CELLS), (m1, m2, g1, g2, cell) =>
        fc.assert(
          fc.property(openArb(g1), (open) => {
            const before = cellStatus(cell, sel(m1, g1), open);
            const after = cellStatus(cell, sel(m2, g2), open);
            if (open.some((o) => o.scope.cells.includes(cell))) {
              // Same outage, same scope, none duplicated or dropped.
              expect(after.outageId).toBe(before.outageId);
              expect(after.scope).toEqual(before.scope);
              expect(new Set(pinnedScopes(cell, open).map((s) => s.key)).size).toBe(pinnedScopes(cell, open).length);
            }
          }),
          { numRuns: 5 },
        ),
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A3_open_outage_keeps_scope: with no open outage the new scope applies to new outages', () => {
    const rich: Members = new Map(
      ['a', 'b', 'c'].map((id) => [
        id,
        {
          cell: 'c1',
          weight: 1,
          armed: true,
          lastEventMs: NOW,
          armedDecidedMs: NOW,
          lastArmedMs: NOW,
          armedSinceMs: NOW,
        },
      ]),
    );
    expect(cellStatus('c1', sel(rich, []), []).scope.kind).toBe('CELL');
    expect(cellStatus('c1', sel(new Map(), []), []).scope.kind).toBe('PARENT');
  });
});
