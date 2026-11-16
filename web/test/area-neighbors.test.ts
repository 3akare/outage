import { childrenOf, neighborsOf, parentOf } from '@outage/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  effectiveNotice,
  type Level,
  mergeNotice,
  NOTICE_TTL_MS,
  type Notice,
  type NoticeTable,
  neighborHint,
  planNotices,
  pruneNotices,
} from '../api/area/neighbors.ts';
import { NUM_RUNS } from './runs.ts';

const P1 = '87754e649ffffff';
const CELLS = ['c1', 'c2', 'c3'];
const NOW = 1_000_000_000_000;
const noticeArb: fc.Arbitrary<Notice> = fc.record({
  cell: fc.constantFrom(...CELLS, 'far'),
  level: fc.constantFrom('NORMAL', 'POSSIBLE', 'CONFIRMED' as const),
  maxK: fc.integer({ min: 0, max: 5 }),
  asOfMs: fc.integer({ min: NOW - 20 * 3_600_000, max: NOW + 2 * 86_400_000 }),
});
const isNb = (c: string) => CELLS.includes(c);
const fold = (ns: Notice[]): NoticeTable => ns.reduce<NoticeTable>((t, n) => mergeNotice(t, n, NOW, isNb).table, new Map());
const dump = (t: NoticeTable) => JSON.stringify([...t.values()].sort((a, b) => (a.cell < b.cell ? -1 : 1)));

describe('A6 neighbor notices', () => {
  it('A6_notice_convergence: any delivery order and any duplication give the same table', () => {
    fc.assert(
      fc.property(
        fc
          .array(noticeArb, { maxLength: 25 })
          .chain((ns) =>
            fc.tuple(fc.constant(ns), fc.shuffledSubarray(ns, { minLength: ns.length, maxLength: ns.length }), fc.array(fc.nat({ max: 24 }), { maxLength: 10 })),
          ),
        ([ns, shuffled, dups]) => {
          const dupes = dups.filter((i) => i < ns.length).map((i) => ns[i]);
          expect(dump(fold([...shuffled, ...dupes]))).toBe(dump(fold(ns)));
          const t = fold(ns);
          // re-merging anything already merged is a no-op
          for (const n of ns) if (isNb(n.cell)) expect(mergeNotice(t, n, NOW, isNb).table).toBe(t);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A6_notice_latest_wins_ties_to_higher_level_and_filters', () => {
    const base = { cell: 'c1', maxK: 3 };
    let t = fold([{ ...base, level: 'CONFIRMED', asOfMs: NOW - 2000 }]);
    t = mergeNotice(t, { ...base, level: 'NORMAL', asOfMs: NOW - 1000 }, NOW, isNb).table;
    expect(t.get('c1')?.level).toBe('NORMAL'); // restoration arrives later
    t = mergeNotice(t, { ...base, level: 'POSSIBLE', asOfMs: NOW - 1000 }, NOW, isNb).table;
    expect(t.get('c1')?.level).toBe('POSSIBLE'); // tie: higher level
    expect(mergeNotice(t, { ...base, cell: 'far', level: 'CONFIRMED', asOfMs: NOW }, NOW, isNb).verdict).toBe('ignored_not_neighbor');
    expect(mergeNotice(t, { ...base, level: 'CONFIRMED', asOfMs: NOW + 86_400_001 }, NOW, isNb).verdict).toBe('ignored_future');
    expect(mergeNotice(t, { ...base, level: 'CONFIRMED', asOfMs: NOW + 86_400_000 }, NOW, isNb).table.get('c1')?.level).toBe('CONFIRMED');
  });

  it('A6_notice_expiry_after_12_hours_reads_as_normal', () => {
    const n: Notice = { cell: 'c1', level: 'CONFIRMED', maxK: 4, asOfMs: NOW };
    expect(effectiveNotice(n, NOW + NOTICE_TTL_MS)).toEqual({ level: 'CONFIRMED', maxK: 4 });
    expect(effectiveNotice(n, NOW + NOTICE_TTL_MS + 1)).toEqual({ level: 'NORMAL', maxK: 0 });
    expect(effectiveNotice(undefined, NOW)).toEqual({ level: 'NORMAL', maxK: 0 });
    const t: NoticeTable = new Map([['c1', n]]);
    expect(pruneNotices(t, NOW + NOTICE_TTL_MS + 1).size).toBe(0);
    expect(neighborHint(t, ['c1', 'c2'], NOW + 5)).toEqual({ level: 'CONFIRMED', maxK: 4 });
    expect(neighborHint(t, ['c2'], NOW + 5).level).toBe('NORMAL');
  });

  it('A6_notice_creation_rules: changed public scopes only, outside neighbors only, one batch per receiver', async () => {
    const cells = childrenOf(P1);
    const nb = new Map<string, string[]>();
    for (const c of cells) nb.set(c, await neighborsOf(c));
    const nbOf = (c: string) => nb.get(c) ?? [];
    const edge = cells.find((c) => nbOf(c).some((n) => parentOf(n) !== P1));
    expect(edge).toBeDefined();
    const e = edge as string;
    const change = (over: Partial<Parameters<typeof planNotices>[1][number]> = {}) => ({
      cells: [e],
      public: true,
      prevLevel: 'NORMAL' as Level,
      level: 'CONFIRMED' as Level,
      maxK: 4,
      asOfMs: NOW,
      ...over,
    });
    const out = planNotices(P1, [change()], nbOf, parentOf);
    expect(out.length).toBeGreaterThan(0);
    for (const b of out) {
      expect(b.toParent).not.toBe(P1);
      expect(b.createIfMissing).toBe(true);
      expect(b.notices).toEqual([{ cell: e, level: 'CONFIRMED', maxK: 4, asOfMs: NOW }]);
    }
    expect(new Set(out.map((b) => b.toParent)).size).toBe(out.length);
    expect(planNotices(P1, [change({ public: false })], nbOf, parentOf)).toEqual([]); // R7.2
    expect(planNotices(P1, [change({ level: 'NORMAL' as Level, prevLevel: 'NORMAL' as Level })], nbOf, parentOf)).toEqual([]); // no change
    const back = planNotices(P1, [change({ prevLevel: 'CONFIRMED', level: 'NORMAL' })], nbOf, parentOf);
    expect(back.every((b) => !b.createIfMissing && b.notices[0].level === 'NORMAL')).toBe(true);
    // inner-only cells (all neighbors in the same parent) send nothing
    const inner = cells.find((c) => nbOf(c).every((n) => parentOf(n) === P1));
    if (inner) expect(planNotices(P1, [change({ cells: [inner] })], nbOf, parentOf)).toEqual([]);
  });
});
