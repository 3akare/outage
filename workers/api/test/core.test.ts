import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { admit, type Kind, newBucket } from '../src/bucket.ts';
import { dayOf } from '../src/budget.ts';
import { CONFIG } from '../src/config.ts';
import { handleRequest } from '../src/handlers.ts';
import { SeqWindow } from '../src/seqwindow.ts';
import type { AreaEvent } from '../src/area-core.ts';
import { ID, makeCore, makeWorld, NOW, PARENT, post, ROOMY, SIBLINGS, tokenFor, wire, CELL } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';

const ev = (seq: number, type: AreaEvent['type'], over: Partial<AreaEvent> = {}): AreaEvent => ({
  installId: ID,
  seq,
  type,
  cell: CELL,
  eventTimeMs: NOW - seq,
  confidence: 'HIGH',
  schedulingDelayMs: null,
  ...(type === 'LABEL' ? { refSeq: 1, answer: 'YES' as const } : {}),
  ...over,
});
const input = (events: AreaEvent[], receiveTimeMs = NOW) => ({ parent: PARENT, receiveTimeMs, events });

// ---- I4 --------------------------------------------------------------------------------------------------------

describe('R6 token bucket', () => {
  it('I4_bucket_invariants: tokens stay within 0..capacity, and no state event is admitted while a detection event is dropped', () => {
    const call = fc.record({
      dt: fc.integer({ min: -5_000, max: 120_000 }),
      kinds: fc.array(fc.constantFrom<Kind>('detection', 'state'), { maxLength: 40 }),
    });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 30_000 }), fc.array(call, { maxLength: 30 }), (capacity, refillMs, calls) => {
        let now = 1_000_000;
        let bucket = newBucket(capacity, now);
        for (const { dt, kinds } of calls) {
          now += dt;
          const before = Math.floor(Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.atMs) / refillMs));
          const a = admit(bucket, now, kinds, capacity, refillMs);
          bucket = a.bucket;
          expect(bucket.tokens).toBeGreaterThanOrEqual(0);
          expect(bucket.tokens).toBeLessThanOrEqual(capacity);
          expect(a.admitted.filter(Boolean).length).toBeLessThanOrEqual(before);
          const droppedDetection = kinds.some((k, i) => k === 'detection' && !a.admitted[i]);
          const admittedState = kinds.some((k, i) => k === 'state' && a.admitted[i]);
          expect(droppedDetection && admittedState).toBe(false);
          expect(a.retryAfterMs > 0).toBe(a.admitted.some((x, i) => !x && i >= 0));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I4_bucket_invariants: in the actor a short bucket drops state events and keeps detection events', async () => {
    const { core, store } = makeCore({ ...CONFIG, BUCKET_CAPACITY: 3 });
    const res = await core.ingest(input([ev(1, 'ARMED'), ev(2, 'DISARMED'), ev(3, 'UNPLUG'), ev(4, 'REPLUG'), ev(5, 'LABEL')]));
    expect(res.results.map((r) => r.status)).toEqual(['rejected', 'rejected', 'accepted', 'accepted', 'accepted']);
    expect(res.results[0].code).toBe('RATE_LIMITED');
    expect(res.retryAfterMs).toBeGreaterThan(0);
    expect(store.detection.size).toBe(3);
    // A dropped event was not recorded as seen: it can be resent later and is then accepted.
    const later = await core.ingest(input([ev(1, 'ARMED')], NOW + 60_000));
    expect(later.results[0].status).toBe('accepted');
  });

  it('R6.1 duplicates cost no token and buckets are per install', async () => {
    const { core } = makeCore({ ...CONFIG, BUCKET_CAPACITY: 2 });
    await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'REPLUG')]));
    const again = await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'REPLUG'), ev(3, 'UNPLUG', { installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' })]));
    expect(again.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'accepted']);
  });
});

// ---- I2 --------------------------------------------------------------------------------------------------------

describe('R5 idempotency', () => {
  const pool = fc
    .array(
      fc.record({
        type: fc.constantFrom<AreaEvent['type']>('ARMED', 'DISARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG', 'LABEL'),
        cell: fc.constantFrom(...SIBLINGS),
        eventTimeMs: fc.integer({ min: NOW - 5_000, max: NOW - 4_990 }), // narrow range: ties happen
      }),
      { minLength: 1, maxLength: 25 },
    )
    .map((rows) => rows.map((r, i) => ev(i, r.type, { cell: r.cell, eventTimeMs: r.eventTimeMs })));

  it('I2_idempotent_any_batching: any repeats and batching give one stored event, one engine notice and the same final state', async () => {
    await fc.assert(
      fc.asyncProperty(
        pool,
        fc.array(fc.nat(), { maxLength: 40 }),
        fc.array(fc.nat(), { minLength: 80, maxLength: 80 }),
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 10 }),
        async (events, extraPicks, sortKeys, sizes) => {
          const ref = makeCore(ROOMY);
          await ref.core.ingest(input(events));
          ref.core.flush();

          const picks = [...events.keys(), ...extraPicks.map((x) => x % events.length)];
          const order = picks.map((p, i) => ({ p, k: sortKeys[i] })).sort((a, b) => a.k - b.k).map((x) => x.p);
          const run = makeCore(ROOMY);
          let at = 0;
          let s = 0;
          while (at < order.length) {
            const size = sizes[s++ % sizes.length];
            await run.core.ingest(input(order.slice(at, at + size).map((p) => events[p])));
            at += size;
          }
          run.core.flush();

          const detectionKeys = (m: Map<string, unknown>) => [...m.keys()].sort();
          expect(detectionKeys(run.store.detection)).toEqual(detectionKeys(ref.store.detection));
          const notified = run.port.calls.flatMap((c) => c.items.map((i) => `${i.installId}|${i.seq}`)).sort();
          const expected = ref.port.calls.flatMap((c) => c.items.map((i) => `${i.installId}|${i.seq}`)).sort();
          expect(notified).toEqual(expected);
          expect(new Set(notified).size).toBe(notified.length);
          const a = run.store.getInstall(ID);
          const b = ref.store.getInstall(ID);
          expect(a?.armed).toBe(b?.armed);
          expect(a?.lastEventMs).toBe(b?.lastEventMs);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R5.2 an already-seen key answers duplicate, stores nothing and notifies nothing', async () => {
    const { core, store, port } = makeCore();
    await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'ARMED')]));
    const res = await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'ARMED'), ev(1, 'UNPLUG')]));
    expect(res.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    expect(port.calls).toHaveLength(1);
    expect(store.detection.size).toBe(1);
  });

  it('R5.2 a repeat inside one batch takes the final answer of its first copy, so a dropped event is never acked as duplicate', async () => {
    const { core } = makeCore({ ...CONFIG, BUCKET_CAPACITY: 1 });
    const res = await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'ARMED'), ev(2, 'ARMED')]));
    expect(res.results.map((r) => r.status)).toEqual(['accepted', 'rejected', 'rejected']);
  });

  it('R5.4 SeqWindow: below-window seq is a duplicate, memory stays bounded', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 5000 }), { maxLength: 300 }), (seqs) => {
        const w = new SeqWindow(16);
        for (const s of seqs) w.add(s);
        const max = Math.max(-1, ...seqs);
        for (const s of seqs) if (s > max - 16) expect(w.has(s)).toBe(true);
        if (max >= 16) expect(w.has(0)).toBe(true);
        expect(w.has(max + 1)).toBe(false);
        // @ts-expect-error reading a private field to assert the bound
        expect(w.seen.size).toBeLessThanOrEqual(17);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R5.4 retained window in the actor: an old state seq is a duplicate, an old detection seq is judged by its stored key', async () => {
    const { core } = makeCore({ ...CONFIG, IDEMPOTENCY_WINDOW: 4 });
    await core.ingest(input([ev(100, 'ARMED')]));
    const res = await core.ingest(input([ev(5, 'DISARMED'), ev(6, 'UNPLUG')]));
    expect(res.results.map((r) => r.status)).toEqual(['duplicate', 'accepted']);
  });
});

// ---- I6 --------------------------------------------------------------------------------------------------------

describe('R10 excluded events', () => {
  it('I6_excluded_events: simulated and non-OK timeQuality events never reach rows, state or the port', async () => {
    const bad = fc.oneof(
      fc.constantFrom('ARMED', 'DISARMED', 'UNPLUG', 'REPLUG', 'BATTERY_FULL' as const).map((type) => (seq: number) => ({ ...wire({ seq, type }), simulated: true })),
      fc.constantFrom('ARMED', 'UNPLUG', 'REPLUG' as const).chain((type) =>
        fc.constantFrom('LOST', 'ok', 'NONE', '').map((q) => (seq: number) => ({ ...wire({ seq, type }), timeQuality: q })),
      ),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat({ max: 200 }), { minLength: 2, maxLength: 20 }),
        fc.array(bad, { minLength: 20, maxLength: 20 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        async (seqs, makers, isBad) => {
          const world = makeWorld();
          const batch = seqs.map((seq, i) => (isBad[i] ? makers[i](seq) : wire({ seq, type: seq % 2 ? 'UNPLUG' : 'ARMED' })));
          await handleRequest(await post('/v1/events', { installId: ID, events: batch }, await tokenFor()), world.deps);
          const goodSeqs = new Set(seqs.filter((_, i) => !isBad[i]));
          const core = world.areas.get(PARENT);
          const seen = (core?.port.calls ?? []).flatMap((c) => c.items.map((i) => i.seq));
          expect(new Set(seen)).toEqual(goodSeqs);
          for (const row of core?.store.detection.values() ?? []) expect(goodSeqs.has(row.seq)).toBe(true);
          for (const call of world.areaCalls) for (const e of call.input.events) expect(goodSeqs.has(e.seq)).toBe(true);
          if (goodSeqs.size === 0) expect(world.areas.size).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---- I9 and write-behind ---------------------------------------------------------------------------------------

describe('R11 write-behind', () => {
  const INSTALLS = [ID, 'aaaaaaaaaaaaaaaaaaaaaaaaaa'];
  type Step = { kind: 'batch'; events: { who: number; armed: boolean; t: number }[] } | { kind: 'flush' };
  const steps = fc.array(
    fc.oneof(
      fc.record({
        kind: fc.constant('batch' as const),
        events: fc.array(fc.record({ who: fc.nat({ max: 1 }), armed: fc.boolean(), t: fc.integer({ min: 0, max: 30 }) }), { minLength: 1, maxLength: 6 }),
      }),
      fc.constant({ kind: 'flush' as const }),
    ),
    { minLength: 1, maxLength: 25 },
  );

  async function run(plan: Step[]) {
    const { core, store } = makeCore(ROOMY);
    let seq = 0;
    const all: { who: number; armed: boolean; t: number }[] = [];
    let flushes = 0;
    for (const s of plan) {
      if (s.kind === 'flush') {
        core.flush();
        flushes++;
        continue;
      }
      const events = s.events.map((e) => {
        all.push(e);
        return ev(seq++, e.armed ? 'ARMED' : 'DISARMED', { installId: INSTALLS[e.who], eventTimeMs: NOW + e.t });
      });
      await core.ingest(input(events));
    }
    core.flush();
    return { core, store, all, flushes: flushes + 1 };
  }

  const winner = (all: { who: number; armed: boolean; t: number }[], who: number) => {
    const mine = all.filter((e) => e.who === who);
    if (mine.length === 0) return undefined;
    const maxT = Math.max(...mine.map((e) => e.t));
    return !mine.filter((e) => e.t === maxT).some((e) => !e.armed); // a tie goes to DISARMED
  };

  it('I9_write_behind_state: stored armed state = last state event by event time, for any batching and flush timing', async () => {
    await fc.assert(
      fc.asyncProperty(steps, async (plan) => {
        const { store, all, flushes } = await run(plan);
        for (const [who, id] of INSTALLS.entries()) expect(store.getInstall(id)?.armed).toBe(winner(all, who));
        // At most one write per install per flush (R11.2).
        expect(store.installWrites).toBeLessThanOrEqual(flushes * INSTALLS.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I9_write_behind_state: arrival order does not change the stored state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ who: fc.nat({ max: 1 }), armed: fc.boolean(), t: fc.integer({ min: 0, max: 30 }) }), { minLength: 1, maxLength: 20 }),
        fc.array(fc.nat(), { minLength: 20, maxLength: 20 }),
        async (events, keys) => {
          const asBatch = (list: typeof events) => [{ kind: 'batch' as const, events: list }];
          const order = events.map((e, i) => ({ e, k: keys[i] })).sort((a, b) => a.k - b.k).map((x) => x.e);
          const a = await run(asBatch(events));
          const b = await run(asBatch(order));
          for (const id of INSTALLS) expect(b.store.getInstall(id)?.armed).toBe(a.store.getInstall(id)?.armed);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('I9_write_behind_state: unchanged state causes no write, including a gap that closes inside the flush interval', async () => {
    const { core, store } = makeCore();
    await core.ingest(input([ev(1, 'ARMED', { eventTimeMs: NOW })]));
    expect(core.flush()).toBe(1);
    expect(store.installWrites).toBe(1);
    // DISARMED then ARMED before the next flush: memory ends equal to what is stored.
    await core.ingest(input([ev(2, 'DISARMED', { eventTimeMs: NOW + 10 }), ev(3, 'ARMED', { eventTimeMs: NOW + 20 })], NOW + 30));
    expect(core.flush()).toBe(0);
    // Same state again, and detection events (touch last_seen only): still nothing, until last_seen is refresh-stale.
    await core.ingest(input([ev(4, 'ARMED', { eventTimeMs: NOW + 40 }), ev(5, 'UNPLUG')], NOW + 60_000));
    expect(core.flush()).toBe(0);
    await core.ingest(input([ev(6, 'ARMED', { eventTimeMs: NOW + 50 })], NOW + CONFIG.LAST_SEEN_REFRESH_MS + 1_000));
    expect(core.flush()).toBe(1);
    expect(store.installWrites).toBe(2);
    expect(store.getInstall(ID)?.lastSeenMs).toBe(NOW + CONFIG.LAST_SEEN_REFRESH_MS + 1_000);
  });

  it('R11.1 an older state event never overwrites a newer one; a tie goes to DISARMED', async () => {
    const { core, store } = makeCore();
    await core.ingest(input([ev(1, 'DISARMED', { eventTimeMs: NOW + 100 }), ev(2, 'ARMED', { eventTimeMs: NOW + 50 })]));
    core.flush();
    expect(store.getInstall(ID)?.armed).toBe(false);
    await core.ingest(input([ev(3, 'ARMED', { eventTimeMs: NOW + 100 })]));
    core.flush();
    expect(store.getInstall(ID)?.armed).toBe(false);
  });

  it('R11.3 memory lost before the flush leaves the install unarmed (safe direction), detection rows survive', async () => {
    const first = makeCore();
    await first.core.ingest(input([ev(1, 'ARMED'), ev(2, 'UNPLUG')]));
    // No flush; a new core over the same store stands in for an evicted actor.
    const restarted = makeCore();
    restarted.store.detection = first.store.detection;
    expect(restarted.core.armedState(ID)).toBeUndefined();
    expect(restarted.store.detection.size).toBe(1);
  });

  it('R11.2 flush timing: due STATE_FLUSH_MS after the first dirty event, none when idle', async () => {
    const { core } = makeCore();
    expect(core.flushDueMs()).toBeNull();
    await core.ingest(input([ev(1, 'ARMED')], NOW));
    expect(core.flushDueMs()).toBe(NOW + CONFIG.STATE_FLUSH_MS);
    core.flush();
    core.drainReport(NOW);
    expect(core.flushDueMs()).toBeNull();
  });

  it('R11.5 past the shed fraction of the daily limit state events are dropped and detection events kept', async () => {
    const { core } = makeCore();
    core.setGlobalRows(dayOf(NOW), CONFIG.DAILY_ROW_LIMIT * CONFIG.WRITE_BUDGET_SHED_FRACTION - 1);
    const ok = await core.ingest(input([ev(1, 'ARMED')]));
    expect(ok.results[0].status).toBe('accepted'); // just under the line
    // That event wrote nothing yet, push the count over the line with detection rows.
    core.setGlobalRows(dayOf(NOW), CONFIG.DAILY_ROW_LIMIT * CONFIG.WRITE_BUDGET_SHED_FRACTION);
    const res = await core.ingest(input([ev(2, 'ARMED'), ev(3, 'UNPLUG'), ev(4, 'DISARMED'), ev(5, 'REPLUG')]));
    expect(res.results.map((r) => [r.status, r.code])).toEqual([
      ['rejected', 'RATE_LIMITED'], ['accepted', undefined], ['rejected', 'RATE_LIMITED'], ['accepted', undefined],
    ]);
    expect(res.retryAfterMs).toBeGreaterThan(0);
    // A new day starts the count again.
    const next = await core.ingest(input([ev(2, 'ARMED')], NOW + 86_400_000));
    expect(next.results[0].status).toBe('accepted');
  });

  it('I9_write_behind_state: rows written by this actor count toward the budget through the report', async () => {
    const { core } = makeCore();
    await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'REPLUG'), ev(3, 'ARMED')]));
    core.flush();
    const report = core.drainReport(NOW);
    expect(report?.rows).toBe(3); // two detection rows and one armed row
    expect(report?.day).toBe(dayOf(NOW));
    expect(core.drainReport(NOW)).toBeNull();
  });

  it('R13.1 R13.2 counters are by result code and event type and hold no install id or cell', async () => {
    const { core } = makeCore({ ...CONFIG, BUCKET_CAPACITY: 2 });
    await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'ARMED'), ev(3, 'REPLUG'), ev(1, 'UNPLUG')]));
    const report = core.drainReport(NOW);
    expect(report?.counters).toMatchObject({ 'type.UNPLUG': 1, 'type.REPLUG': 1, 'result.accepted': 2, 'result.rejected': 1, 'result.duplicate': 1, 'code.RATE_LIMITED': 1 });
    const text = JSON.stringify(report);
    expect(text).not.toContain(ID);
    expect(text).not.toContain(CELL);
  });
});

// ---- retention and delete --------------------------------------------------------------------------------------

describe('R12 retention and delete', () => {
  it('R12.3 prune removes rows older than the retention period only, and is due a day later', async () => {
    const { core, store } = makeCore();
    await core.ingest(input([ev(1, 'UNPLUG')], NOW - CONFIG.RETENTION_MS - 1));
    await core.ingest(input([ev(2, 'UNPLUG')], NOW - 1000));
    expect(core.prune(NOW)).toBe(1);
    expect([...store.detection.values()].map((r) => r.seq)).toEqual([2]);
    expect(core.pruneDueMs(NOW)).toBe(NOW + 86_400_000);
  });

  it('R12.1 deleteInstall removes rows and every memory trace, and leaves other installs alone', async () => {
    const other = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';
    const { core, store } = makeCore();
    await core.ingest(input([ev(1, 'UNPLUG'), ev(2, 'ARMED'), ev(3, 'UNPLUG', { installId: other })]));
    core.flush();
    await core.ingest(input([ev(4, 'ARMED')]));
    expect(core.deleteInstall(ID)).toBeGreaterThanOrEqual(2);
    expect(core.armedState(ID)).toBeUndefined();
    expect([...store.detection.keys()]).toEqual([`${other}|3`]);
    expect(store.getInstall(ID)).toBeUndefined();
    core.flush(); // nothing left to write for the deleted install
    expect(store.getInstall(ID)).toBeUndefined();
  });
});
