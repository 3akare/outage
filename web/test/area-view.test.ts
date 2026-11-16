import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPublicView, HISTORY_MS, type ScopeKind, type ViewOutage } from '../api/area/view.ts';
import { NUM_RUNS } from './runs.ts';

const NOW = 1_000_000_000_000;
const PARENT = '87754e649ffffff';
const CELLS = ['88754e6499fffff', '88754e649bfffff', '88754e649dfffff'];
const PROBE_ID = 'kg4yq7mxwb2ndpr3tfhj5vcsaz'; // an install ID that must never appear in a view

const outageArb: fc.Arbitrary<ViewOutage> = fc
  .record({
    start: fc.integer({ min: NOW - 40 * 86_400_000, max: NOW }),
    len: fc.option(fc.integer({ min: 1, max: 3 * 86_400_000 }), { nil: null }),
    level: fc.constantFrom('POSSIBLE', 'CONFIRMED', 'SPOT_ONLY', 'NORMAL'),
    precision: fc.constantFrom('CELL', 'LINKED', 'COARSE' as const),
  })
  .map((o) => ({ startMs: o.start, endMs: o.len === null ? null : o.start + o.len, level: o.level, precision: o.precision }));

const KEYS = ['boundary', 'history30d', 'lastRestoredAtMs', 'openOutage', 'phones', 'precision', 'scopeKind', 'status'];

describe('A8 public view', () => {
  it('A8_public_view_privacy: no view under 3 members; no install ID, no count, only whitelisted fields and levels', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('CELL', 'GROUP', 'PARENT' as ScopeKind),
        fc.integer({ min: 0, max: 40 }),
        fc.array(outageArb, { maxLength: 12 }),
        fc.subarray(CELLS, { minLength: 1 }),
        (scopeKind, members, outages, cells) => {
          const input = { scopeKind, parent: PARENT, cells, members, outages, nowMs: NOW, installIds: [PROBE_ID], perInstall: { [PROBE_ID]: 1 } };
          const v = buildPublicView(input);
          if (members < 3) {
            expect(v).toBeNull();
            return;
          }
          expect(v).not.toBeNull();
          if (!v) return;
          const json = JSON.stringify(v);
          expect(json).not.toContain(PROBE_ID);
          expect(Object.keys(v).every((k) => KEYS.includes(k))).toBe(true);
          expect(v.phones).toBe('3+');
          expect(json).not.toMatch(/members|count|installId/i);
          // boundary is the scope's cells, or the parent; sorted union with no duplicates
          if (scopeKind === 'PARENT') expect(v.boundary).toEqual([PARENT]);
          else expect(v.boundary).toEqual([...new Set(cells)].sort());
          expect(v.precision).toBe({ CELL: 'CELL', GROUP: 'LINKED', PARENT: 'COARSE' }[scopeKind]);
          for (const h of v.history30d) {
            expect(['POSSIBLE', 'CONFIRMED']).toContain(h.level);
            expect((h.endMs ?? h.startMs) >= NOW - HISTORY_MS).toBe(true);
            expect(Object.keys(h).sort()).toEqual(['endMs', 'level', 'precision', 'startMs']);
          }
          const starts = v.history30d.map((h) => h.startMs);
          expect(starts).toEqual([...starts].sort((a, b) => b - a));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A8_status_open_outage_and_restore_time', () => {
    const v = buildPublicView({
      scopeKind: 'CELL',
      parent: PARENT,
      cells: [CELLS[0]],
      members: 3,
      nowMs: NOW,
      outages: [
        { startMs: NOW - 5000, endMs: null, level: 'POSSIBLE', precision: 'CELL' },
        { startMs: NOW - 90_000, endMs: NOW - 60_000, level: 'CONFIRMED', precision: 'CELL' },
        { startMs: NOW - 70_000, endMs: NOW - 65_000, level: 'SPOT_ONLY', precision: 'CELL' },
        { startMs: NOW - 40 * 86_400_000, endMs: NOW - 39 * 86_400_000, level: 'CONFIRMED', precision: 'CELL' },
      ],
    });
    expect(v?.status).toBe('POSSIBLE');
    expect(v?.openOutage).toEqual({ startMs: NOW - 5000, level: 'POSSIBLE', precision: 'CELL' });
    expect(v?.lastRestoredAtMs).toBe(NOW - 60_000);
    expect(v?.history30d).toHaveLength(2);
    expect(v?.history30d[0].endMs).toBeNull(); // unknown end is shown as null
    expect(buildPublicView({ scopeKind: 'CELL', parent: PARENT, cells: [CELLS[0]], members: 2, outages: [], nowMs: NOW })).toBeNull();
  });
});
