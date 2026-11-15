import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  coOutageCounts,
  diffLinks,
  groupsFromLinks,
  LINK_WINDOW_MS,
  linkedPairs,
  type OutageRecord,
  pairKey,
  planGroups,
  pruneRecords,
} from '../src/area/links.ts';
import { NUM_RUNS } from './runs.ts';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;
const CELLS = ['c1', 'c2', 'c3', 'c4', 'c5'];
const sameParent = () => 'p';
const recArb: fc.Arbitrary<OutageRecord> = fc.record({
  outageKey: fc.constantFrom('o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'),
  startMs: fc.integer({ min: NOW - 9 * DAY, max: NOW }),
  dropsByCell: fc.dictionary(fc.constantFrom(...CELLS), fc.integer({ min: 0, max: 3 })),
});
const rec = (key: string, daysAgo: number, cells: string[]): OutageRecord => ({
  outageKey: key,
  startMs: NOW - daysAgo * DAY,
  dropsByCell: Object.fromEntries(cells.map((c) => [c, 1])),
});

describe('A4 link rule', () => {
  it('A4_link_rule: a pair is linked exactly when it has 3 or more co-outages in the trailing 7 days', () => {
    fc.assert(
      fc.property(fc.array(recArb, { maxLength: 20 }), (records) => {
        // Reference count, written independently: one entry per distinct outage key.
        const byKey = new Map<string, { start: number; drops: Map<string, number> }>();
        for (const r of records) {
          const e = byKey.get(r.outageKey) ?? { start: r.startMs, drops: new Map<string, number>() };
          e.start = Math.min(e.start, r.startMs);
          for (const [c, n] of Object.entries(r.dropsByCell)) e.drops.set(c, Math.max(e.drops.get(c) ?? 0, n));
          byKey.set(r.outageKey, e);
        }
        const expected: string[] = [];
        for (let i = 0; i < CELLS.length; i++) {
          for (let j = i + 1; j < CELLS.length; j++) {
            let n = 0;
            for (const e of byKey.values()) {
              if (
                NOW - e.start <= LINK_WINDOW_MS &&
                (e.drops.get(CELLS[i]) ?? 0) >= 1 &&
                (e.drops.get(CELLS[j]) ?? 0) >= 1
              )
                n++;
            }
            if (n >= 3) expected.push(pairKey(CELLS[i], CELLS[j]));
          }
        }
        expect(linkedPairs(records, NOW, sameParent)).toEqual(expected.sort());
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A4_link_rule: two co-outages do not link, three do, and the link goes when old ones age out', () => {
    const two = [rec('a', 1, ['c1', 'c2']), rec('b', 2, ['c1', 'c2'])];
    expect(linkedPairs(two, NOW, sameParent)).toEqual([]);
    const three = [...two, rec('c', 3, ['c1', 'c2', 'c3'])];
    expect(linkedPairs(three, NOW, sameParent)).toEqual(['c1|c2']);
    expect(linkedPairs(three, NOW + 4 * DAY, sameParent)).toEqual(['c1|c2']); // oldest is exactly 7 days old: still counts
    expect(linkedPairs(three, NOW + 5 * DAY, sameParent)).toEqual([]); // the 8-day-old outage ages out
  });

  it('A4_link_rule: an outage counts once per pair, a cell without an eligible drop does not count, pairs across parents never link', () => {
    const dup = [rec('a', 1, ['c1', 'c2']), rec('a', 1, ['c1', 'c2']), rec('a', 1, ['c1', 'c2'])];
    expect(coOutageCounts(dup, NOW, sameParent).get('c1|c2')).toBe(1);
    const zero: OutageRecord[] = ['a', 'b', 'c'].map((k) => ({
      outageKey: k,
      startMs: NOW - DAY,
      dropsByCell: { c1: 2, c2: 0 },
    }));
    expect(linkedPairs(zero, NOW, sameParent)).toEqual([]);
    const three = [rec('a', 1, ['c1', 'c2']), rec('b', 1, ['c1', 'c2']), rec('c', 1, ['c1', 'c2'])];
    expect(linkedPairs(three, NOW, sameParent)).toEqual(['c1|c2']);
    expect(linkedPairs(three, NOW, (c) => c)).toEqual([]);
  });

  it('A4_link_rule: diffs and pruning', () => {
    expect(diffLinks(['a|b', 'c|d'], ['c|d', 'e|f'])).toEqual({ formed: ['e|f'], removed: ['a|b'] });
    const old = rec('o', 8, ['c1']);
    expect(pruneRecords([old, rec('n', 1, ['c1'])], NOW)).toHaveLength(1);
  });
});

describe('A5 groups', () => {
  it('A5_groups_deterministic: groups are the connected components, equal for any insertion order', () => {
    fc.assert(
      fc.property(fc.array(recArb, { maxLength: 20 }), fc.nat(), (records, seed) => {
        const shuffled = [...records].sort((a, b) => ((a.startMs * 31 + seed) % 7) - ((b.startMs * 31 + seed) % 7));
        const reversed = [...records].reverse();
        const g1 = groupsFromLinks(linkedPairs(records, NOW, sameParent));
        expect(groupsFromLinks(linkedPairs(shuffled, NOW, sameParent))).toEqual(g1);
        expect(groupsFromLinks(linkedPairs(reversed, NOW, sameParent))).toEqual(g1);
        // Reordering the link pairs themselves does not matter either.
        expect(groupsFromLinks([...linkedPairs(records, NOW, sameParent)].reverse())).toEqual(g1);
        // Components are disjoint and each has at least two cells.
        const seen = new Set<string>();
        for (const g of g1) {
          expect(g.cells.length).toBeGreaterThanOrEqual(2);
          for (const c of g.cells) {
            expect(seen.has(c)).toBe(false);
            seen.add(c);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A5_groups_deterministic: a chain a-b, b-c is one group; planning creates and retires engines only for changed groups', () => {
    const g = groupsFromLinks(['c1|c2', 'c2|c3', 'c5|c6']);
    expect(g).toEqual([{ cells: ['c1', 'c2', 'c3'] }, { cells: ['c5', 'c6'] }]);
    const next = groupsFromLinks(['c1|c2', 'c5|c6']);
    expect(planGroups(g, next)).toEqual({ create: [{ cells: ['c1', 'c2'] }], retire: ['group:c1'] });
    expect(planGroups(g, g)).toEqual({ create: [], retire: [] });
  });
});
