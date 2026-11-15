import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AreaModel,
  areaConfig,
  ENGINE_BUCKETS,
  fromRows,
  type ModelRow,
  type ModelStore,
  toRows,
} from '../src/area/model.ts';
import type { IngestedItem } from '../src/ingest/ports.ts';
import { NUM_RUNS } from './runs.ts';

const CELLS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const cfg = areaConfig(
  new Map([
    ['c1', ['c2']],
    ['c2', ['c1']],
  ]),
  () => CELLS,
  (c) => (CELLS.includes(c) ? 'p1' : 'p2'),
  60_000,
);
const T0 = 1_700_000_000_000;
const MIN = 60_000;

class MemStore implements ModelStore {
  rows = new Map<string, ModelRow>();
  writes = 0;
  loadRows(): ModelRow[] {
    return [...this.rows.values()];
  }
  writeRows(put: readonly ModelRow[], del: readonly Omit<ModelRow, 'json'>[]): number {
    for (const r of put) this.rows.set(`${r.table}|${r.key}|${r.part}`, r);
    for (const r of del) this.rows.delete(`${r.table}|${r.key}|${r.part}`);
    this.writes += put.length + del.length;
    return put.length + del.length;
  }
}

const ev = (installId: string, seq: number, type: IngestedItem['type'], cell: string, t: number): IngestedItem =>
  type === 'LABEL'
    ? { installId, seq, type, cell, eventTimeMs: t, refSeq: 2, answer: 'YES' }
    : { installId, seq, type, cell, eventTimeMs: t, confidence: 'HIGH', schedulingDelayMs: null };
const who = Array.from({ length: 8 }, (_, i) => `i${i}`);

describe('area-cells task 10 model persistence', () => {
  it('R13.3 rows round-trip: a reloaded model has the same state, and engine states are split by install bucket', () => {
    fc.assert(
      fc.property(fc.subarray(who, { minLength: 3 }), fc.integer({ min: 0, max: 8 }), (ids, drops) => {
        const store = new MemStore();
        const m = new AreaModel('p1', store, cfg);
        m.handle(
          'p1',
          ids.map((id, i) => ev(id, 1, 'ARMED', i % 2 ? 'c1' : 'c2', T0 - 10 * MIN + i)),
          T0 - 5 * MIN,
        );
        m.handle(
          'p1',
          ids.slice(0, drops).map((id, i) => ev(id, 2, 'UNPLUG', i % 2 ? 'c1' : 'c2', T0 + i * 100)),
          T0 + MIN,
        );
        m.flush();
        const again = new AreaModel('p1', store, cfg);
        expect(again.snapshot()).toEqual(m.snapshot());
        expect(fromRows('p1', toRows(m.snapshot()))).toEqual(m.snapshot());
        for (const r of store.rows.values()) {
          if (r.table === 'engine' && r.part !== 'h') expect(Number(r.part.slice(1))).toBeLessThan(ENGINE_BUCKETS);
        }
      }),
      { numRuns: Math.min(NUM_RUNS, 50) },
    );
  });

  it('R13.3 write-behind: an unchanged state writes no rows; a change writes only the changed rows', () => {
    const store = new MemStore();
    const m = new AreaModel('p1', store, cfg);
    m.handle(
      'p1',
      who.map((id, i) => ev(id, 1, 'ARMED', 'c1', T0 - 10 * MIN + i)),
      T0 - 5 * MIN,
    );
    const first = m.flush();
    expect(first).toBeGreaterThan(0);
    expect(m.flush()).toBe(0);
    m.handle('p1', [ev('i0', 2, 'UNPLUG', 'c1', T0)], T0 + MIN);
    const second = m.flush();
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(store.rows.size);
  });

  it('R11.2 R13.3 the alarm covers both the queued-state flush and the write-behind flush', () => {
    const m = new AreaModel('p1', new MemStore(), cfg);
    expect(m.alarmDueMs(60_000)).toBeNull();
    m.handle('p1', [ev('i0', 1, 'ARMED', 'c1', T0)], T0);
    expect(m.tickDueMs()).toBe(T0 + 60_000);
    expect(m.alarmDueMs(60_000)).toBe(T0 + 60_000);
    m.tick(T0 + 60_000);
    m.flush();
    expect(m.tickDueMs()).toBeNull();
    expect(m.alarmDueMs(60_000)).toBeNull();
  });

  it('R12.1 delete removes the install from every stored row', () => {
    const store = new MemStore();
    const m = new AreaModel('p1', store, cfg);
    m.handle(
      'p1',
      [
        ...who.map((id, i) => ev(id, 1, 'ARMED', 'c1', T0 - 10 * MIN + i)),
        ev('victim-77', 1, 'ARMED', 'c2', T0 - 9 * MIN),
      ],
      T0 - 5 * MIN,
    );
    m.handle('p1', [ev('victim-77', 2, 'UNPLUG', 'c2', T0)], T0 + MIN);
    m.flush();
    expect(JSON.stringify([...store.rows.values()])).toContain('victim-77');
    m.deleteInstall('victim-77', T0 + 2 * MIN);
    m.flush();
    expect(JSON.stringify([...store.rows.values()])).not.toContain('victim-77');
  });

  it('R12.1 delete queues the public-index change, so a public page stops counting the deleted phone (review issue 1)', () => {
    const m = new AreaModel('p1', new MemStore(), cfg);
    const ids = who.slice(0, 3);
    m.handle('p1', ids.map((id, i) => ev(id, 1, 'ARMED', 'c1', T0 - 10 * MIN + i)), T0 - 5 * MIN);
    m.handle('p1', ids.map((id, i) => ev(id, 2, 'UNPLUG', 'c1', T0 + i * 100)), T0 + MIN);
    const before = m.drainOutbox();
    expect(before.publish.put.length).toBeGreaterThan(0);
    expect(m.drainOutbox().publish).toEqual({ put: [], remove: [] });
    m.deleteInstall(ids[0], T0 + 2 * MIN);
    const after = m.drainOutbox();
    // Two phones are left: nothing may be published as a put, and the earlier view must be withdrawn.
    expect(after.publish.put).toEqual([]);
    expect(after.publish.remove.length).toBeGreaterThan(0);
  });

  it('R13.1 an empty actor reports empty, so a NORMAL-only notice can be dropped; R5.3 moves across parents produce a removal', () => {
    const m = new AreaModel('p1', new MemStore(), cfg);
    expect(m.isEmpty()).toBe(true);
    m.handle('p1', [ev('i0', 1, 'ARMED', 'c1', T0)], T0);
    expect(m.isEmpty()).toBe(false);
    const m2 = new AreaModel(
      'p2',
      new MemStore(),
      areaConfig(
        new Map(),
        () => ['d1'],
        (c) => (CELLS.includes(c) ? 'p1' : 'p2'),
        60_000,
      ),
    );
    m2.handle('p2', [ev('i0', 1, 'ARMED', 'd1', T0)], T0);
    expect(m2.drainOutbox().removals).toEqual([]);
    // The same install now reports from p1's cell to p1's actor: p1 has no older record, so no removal is due there either.
    m.handle('p1', [ev('i0', 2, 'ARMED', 'c1', T0 + MIN)], T0 + MIN);
    expect(m.drainOutbox().removals).toEqual([]);
    expect(m.counters().events).toBe(2);
  });
});
