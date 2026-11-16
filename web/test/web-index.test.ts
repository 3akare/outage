import { DEFAULT_PARAMS } from '@outage/detection';
import { childrenOf, parentOf } from '@outage/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type AreaConfig, type AreaState, emptyAreaState, reduce } from '../api/area/reducer.ts';
import type { IngestedItem } from '../api/ingest/ports.ts';
import { applyBatch, type IndexStore, sanitizeView, snapshot } from '../api/public-index/core.ts';
import { indexReader } from '../api/public-index/reader.ts';
import { NUM_RUNS } from './runs.ts';
import { cellView, YABA } from './web-helpers.ts';

class MemIndex implements IndexStore {
  rows = new Map<string, string>();
  v = 0;
  writes = 0;
  all() {
    return [...this.rows].map(([scopeKey, json]) => ({ scopeKey, json }));
  }
  get(k: string) {
    return this.rows.get(k);
  }
  put(k: string, j: string) {
    this.rows.set(k, j);
    this.writes++;
  }
  delete(k: string) {
    this.rows.delete(k);
    this.writes++;
  }
  version() {
    return this.v;
  }
  setVersion(v: number) {
    this.v = v;
  }
}

const CELL = YABA.cells[0] as string;
const PARENT = parentOf(CELL);
const CHILDREN = childrenOf(PARENT);
const cfg: AreaConfig = {
  params: DEFAULT_PARAMS,
  stateFlushMs: 60_000,
  deferStateOnly: false,
  neighborsOf: () => [],
  childrenOf,
  parentOf,
};
const T0 = 1_700_000_000_000;
const MIN = 60_000;
const arm = (id: string, seq: number, t: number, cell = CELL): IngestedItem => ({
  installId: id,
  seq,
  type: 'ARMED',
  cell,
  eventTimeMs: t,
  confidence: 'HIGH',
  schedulingDelayMs: null,
});

describe('W2 public index', () => {
  it('W2_public_privacy: the index holds only whitelisted public fields and never a view without "3+"', () => {
    const anyJson = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.boolean());
    fc.assert(
      fc.property(
        fc.record({
          phones: fc.constantFrom<unknown>('3+', 2, '2', 1, undefined),
          extra: fc.dictionary(fc.constantFrom('installId', 'members', 'token', 'count', 'k'), anyJson),
          status: fc.constantFrom<unknown>('NORMAL', 'POSSIBLE', 'CONFIRMED', 'SPOT_ONLY'),
        }),
        ({ phones, extra, status }) => {
          const store = new MemIndex();
          const v = { ...cellView(CELL), ...extra, phones, status, installId: 'leak-install-id' };
          applyBatch(store, { put: [{ scopeKey: `cell:${CELL}`, view: v }], remove: [] }, T0);
          const snap = JSON.stringify(snapshot(store));
          expect(snap).not.toContain('leak-install-id');
          for (const k of Object.keys(extra)) expect(snap).not.toContain(`"${k}"`);
          if (phones !== '3+' || status === 'SPOT_ONLY') expect(store.rows.size).toBe(0);
          else expect(snapshot(store).views[0]).toEqual(sanitizeView(v));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('W2_public_privacy: bad scope keys and bad boundaries are rejected; an unchanged put writes nothing', () => {
    const store = new MemIndex();
    expect(applyBatch(store, { put: [{ scopeKey: 'cell:nope', view: cellView(CELL) }], remove: [] }, T0).rejected).toBe(
      1,
    );
    expect(
      applyBatch(store, { put: [{ scopeKey: `cell:${CELL}`, view: cellView('not-a-cell') }], remove: [] }, T0).rejected,
    ).toBe(1);
    expect(
      applyBatch(store, { put: [{ scopeKey: `cell:${CELL}`, view: cellView(CELL) }], remove: [] }, T0).changed,
    ).toBe(1);
    const writes = store.writes;
    expect(
      applyBatch(store, { put: [{ scopeKey: `cell:${CELL}`, view: cellView(CELL) }], remove: [] }, T0).changed,
    ).toBe(0);
    expect(store.writes).toBe(writes);
    expect(store.v).toBe(1);
  });

  it('W2_public_privacy: tombstone, a scope whose members fall below 3 is removed from the index', () => {
    const ids = ['a', 'b', 'c'];
    let s: AreaState = emptyAreaState(PARENT);
    const store = new MemIndex();
    const step = (input: Parameters<typeof reduce>[1]) => {
      const r = reduce(s, input, cfg);
      s = r.state;
      applyBatch(store, r.out.publish, input.nowMs);
      return r.out.publish;
    };
    step({ type: 'EVENTS', nowMs: T0, items: ids.map((id, i) => arm(id, 1, T0 - 5 * MIN + i)) });
    expect([...store.rows.keys()].sort()).toEqual([`cell:${CELL}`, `parent:${PARENT}`]);
    // Same data again: nothing to publish.
    expect(step({ type: 'TICK', nowMs: T0 + 1 })).toEqual({ put: [], remove: [] });
    // One member deletes their data: 2 left, both the cell and the parent drop below the floor.
    const pub = step({ type: 'DELETE', nowMs: T0 + MIN, installId: 'c' });
    expect(pub.remove.sort()).toEqual([`cell:${CELL}`, `parent:${PARENT}`]);
    expect(store.rows.size).toBe(0);
    // A member in another child cell brings the parent back to 3, but not the cell.
    const other = CHILDREN.find((c) => c !== CELL) as string;
    step({ type: 'EVENTS', nowMs: T0 + 2 * MIN, items: [arm('d', 1, T0 + 2 * MIN, other)] });
    expect([...store.rows.keys()]).toEqual([`parent:${PARENT}`]);
    expect(JSON.stringify(snapshot(store))).not.toMatch(/"[abcd]"/);
  });

  it('R8.1 the reader returns null when the index fails, so pages show no status', async () => {
    expect(await indexReader(async () => ({ views: [] })).views()).toEqual([]);
    expect(await indexReader(async () => Promise.reject(new Error('down'))).views()).toBeNull();
  });
});
