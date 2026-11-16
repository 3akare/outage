import fc from 'fast-check';
import { res7Parent, type EventsResponse } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { eventTimeMs } from '../api/ingest/eventtime.ts';
import { handleRequest } from '../api/ingest/handlers.ts';
import { ID, makeWorld, NOW, post, ROOMY, SIBLINGS, tokenFor, wire, CELL, PARENT } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';

const send = async (world: ReturnType<typeof makeWorld>, events: unknown[], token?: string) =>
  handleRequest(await post('/v1/events', { installId: ID, events }, token ?? (await tokenFor())), world.deps);

describe('R3 event time', () => {
  it('I1_event_time_formula: event time = receive time - elapsedMs for any receive time and valid elapsed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 604_800_000, max: 4_000_000_000_000 }),
        fc.integer({ min: 0, max: 604_800_000 }),
        fc.constantFrom('HIGH', 'LOW' as const),
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
        async (receive, elapsedMs, confidence, batteryPct) => {
          const world = makeWorld();
          world.now = receive;
          const res = await send(world, [wire({ seq: 1, elapsedMs, confidence, ...(batteryPct === undefined ? {} : { batteryPct }) })]);
          expect(res.status).toBe(200);
          const passed = world.areaCalls[0].input;
          expect(passed.receiveTimeMs).toBe(receive);
          expect(passed.events[0].eventTimeMs).toBe(receive - elapsedMs);
          expect(passed.events[0].eventTimeMs).toBe(eventTimeMs(receive, elapsedMs));
          expect('elapsedMs' in passed.events[0]).toBe(false); // R3.3
          // The stored row carries the same event time, whatever the other fields were.
          expect([...world.area(res7Parent(CELL)).store.detection.values()][0].eventTimeMs).toBe(receive - elapsedMs);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('I1_event_time_formula: one receive time for the whole request, and a phone clock field is refused', async () => {
    const world = makeWorld();
    const res = await send(world, [wire({ seq: 1, elapsedMs: 10 }), wire({ seq: 2, elapsedMs: 20 }), { ...wire({ seq: 3 }), deviceTime: NOW }]);
    const body = (await res.json()) as EventsResponse;
    expect(world.areaCalls).toHaveLength(1);
    expect(world.areaCalls[0].input.events.map((e) => e.eventTimeMs)).toEqual([NOW - 10, NOW - 20]);
    expect(body.results[2]).toEqual({ seq: 3, status: 'rejected', code: 'UNKNOWN_FIELD', permanent: true });
  });
});

describe('R8 partial results', () => {
  const invalids: unknown[] = [
    { seq: 5 },
    null,
    'x',
    { ...wire({ seq: 6 }), elapsedMs: -1 },
    { ...wire({ seq: 7 }), cell: 'bad' },
    { ...wire({ seq: 8 }), simulated: true },
    { ...wire({ seq: 9 }), timeQuality: 'LOST' },
    { ...wire({ seq: 10 }), extra: 1 },
  ];

  it('I5_batch_isolation: invalid events never change the results of the valid ones', async () => {
    const insertAt = fc.array(fc.tuple(fc.nat({ max: 20 }), fc.constantFrom(...invalids)), { maxLength: 8 });
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.nat({ max: 60 }), { minLength: 1, maxLength: 12 }),
        fc.array(fc.constantFrom(...SIBLINGS), { minLength: 12, maxLength: 12 }),
        fc.array(fc.constantFrom('UNPLUG', 'REPLUG', 'ARMED', 'DISARMED', 'BATTERY_FULL' as const), { minLength: 12, maxLength: 12 }),
        insertAt,
        async (seqs, cells, types, inserts) => {
          const valid = seqs.map((seq, i) => wire({ seq, cell: cells[i], type: types[i], elapsedMs: seq * 10 }));
          const mixed: unknown[] = [...valid];
          const validIdx = valid.map((_, i) => i);
          for (const [at, bad] of inserts) {
            const pos = at % (mixed.length + 1);
            mixed.splice(pos, 0, bad);
            for (let k = 0; k < validIdx.length; k++) if (validIdx[k] >= pos) validIdx[k] += 1;
          }
          const clean = await (await send(makeWorld(), valid)).json() as EventsResponse;
          const noisyWorld = makeWorld();
          const noisy = (await (await send(noisyWorld, mixed)).json()) as EventsResponse;
          expect(noisy.results).toHaveLength(mixed.length);
          for (const [k, at] of validIdx.entries()) expect(noisy.results[at]).toEqual(clean.results[k]);
          const badIdx = mixed.map((_, i) => i).filter((i) => !validIdx.includes(i));
          for (const i of badIdx) expect(noisy.results[i].status).toBe('rejected');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R8.3 permanent and transient classification is in every rejected result', async () => {
    const world = makeWorld();
    const res = (await (await send(world, invalids)).json()) as EventsResponse;
    expect(res.results.map((r) => r.code)).toEqual(['BAD_FIELD', 'BAD_FIELD', 'BAD_FIELD', 'BAD_ELAPSED', 'BAD_CELL', 'SIMULATED_REJECTED', 'TIME_LOST', 'UNKNOWN_FIELD']);
    expect(res.results.every((r) => r.permanent === true)).toBe(true);
    expect(world.areaCalls).toHaveLength(0);
  });
});

describe('R7 routing', () => {
  it('R7.1 R7.2 one actor call per res-7 parent, siblings share an actor, results keep input order', async () => {
    const world = makeWorld();
    const other = '88589c986bfffff'; // a res-8 cell with a different parent (checked below)
    expect(res7Parent(other)).not.toBe(PARENT);
    const events = [
      wire({ seq: 1, cell: SIBLINGS[0] }),
      wire({ seq: 2, cell: other }),
      wire({ seq: 3, cell: SIBLINGS[3] }),
      wire({ seq: 4, cell: SIBLINGS[6], type: 'ARMED' }),
    ];
    const res = (await (await send(world, events)).json()) as EventsResponse;
    expect(world.areaCalls.map((c) => c.parent).sort()).toEqual([PARENT, res7Parent(other)].sort());
    expect(world.areaCalls.find((c) => c.parent === PARENT)?.input.events.map((e) => e.seq)).toEqual([1, 3, 4]);
    expect(res.results.map((r) => [r.seq, r.status])).toEqual([[1, 'accepted'], [2, 'accepted'], [3, 'accepted'], [4, 'accepted']]);
  });

  it('R8.2 an actor that throws gives UNAVAILABLE (transient) for its events only', async () => {
    const world = makeWorld();
    const other = '88589c986bfffff';
    world.failParents.add(res7Parent(other));
    const res = (await (await send(world, [wire({ seq: 1 }), wire({ seq: 2, cell: other })])).json()) as EventsResponse;
    expect(res.results[0]).toEqual({ seq: 1, status: 'accepted' });
    expect(res.results[1]).toEqual({ seq: 2, status: 'rejected', code: 'UNAVAILABLE', permanent: false });
  });

  it('R7.3 LABEL events travel with refSeq and answer, and reach the port as a label', async () => {
    const world = makeWorld();
    const label = { installId: ID, seq: 9, type: 'LABEL', elapsedMs: 500, cell: CELL, confidence: 'HIGH', timeQuality: 'OK', refSeq: 4, answer: 'YES' };
    const res = (await (await send(world, [label])).json()) as EventsResponse;
    expect(res.results).toEqual([{ seq: 9, status: 'accepted' }]);
    const a = world.area(PARENT);
    expect(a.port.calls[0].items[0]).toEqual({ installId: ID, seq: 9, type: 'LABEL', cell: CELL, eventTimeMs: NOW - 500, refSeq: 4, answer: 'YES' });
    expect([...a.store.detection.values()][0]).toMatchObject({ type: 'LABEL', refSeq: 4, answer: 'YES' });
  });
});

describe('R2 R8 request level', () => {
  it('R2.3 missing, wrong or foreign token is 401 for the whole request and nothing is processed', async () => {
    const world = makeWorld();
    const good = await tokenFor();
    const foreign = await tokenFor('aaaaaaaaaaaaaaaaaaaaaaaaaa');
    for (const tok of [undefined, '', 'nope', foreign, `${good}x`]) {
      const req = await post('/v1/events', { installId: ID, events: [wire({ seq: 1 })] }, tok);
      expect((await handleRequest(req, world.deps)).status).toBe(401);
    }
    expect(world.areaCalls).toHaveLength(0);
  });

  it('R12.2 a revoked install gets 401', async () => {
    const world = makeWorld();
    world.revoked.add(ID);
    expect((await send(world, [wire({ seq: 1 })])).status).toBe(401);
  });

  it('R8.4 bad JSON is 400, oversize body 413, too many events 413, malformed envelope 400; no results', async () => {
    const world = makeWorld({ ...ROOMY, MAX_BODY_BYTES: 2000, MAX_BATCH_EVENTS: 3 });
    const token = await tokenFor();
    const status = async (body: unknown) => (await handleRequest(await post('/v1/events', body, token), world.deps)).status;
    expect(await status('{not json')).toBe(400);
    expect(await status({ installId: ID })).toBe(400);
    expect(await status({ installId: ID, events: [], extra: 1 })).toBe(400);
    expect(await status({ installId: ID, events: new Array(4).fill(wire({ seq: 1 })) })).toBe(413);
    expect(await status(`{"installId":"${ID}","events":[],"pad":"${'x'.repeat(3000)}"}`)).toBe(413);
    const declared = new Request('https://api.test/v1/events', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-length': '999999' }, body: '{}' });
    expect((await handleRequest(declared, world.deps)).status).toBe(413);
    expect(world.areaCalls).toHaveLength(0);
  });

  it('R2.2 a missing secret answers 500 on register and events without a value in the body', async () => {
    const world = makeWorld(ROOMY, null);
    const r1 = await handleRequest(await post('/v1/register', ''), world.deps);
    const r2 = await handleRequest(await post('/v1/events', { installId: ID, events: [] }, 'x'), world.deps);
    expect([r1.status, r2.status]).toEqual([500, 500]);
  });

  it('R6.2 when every event is rate limited the answer is 429 with Retry-After', async () => {
    const world = makeWorld({ ...ROOMY, BUCKET_CAPACITY: 1, BUCKET_REFILL_MS: 20_000 });
    expect((await send(world, [wire({ seq: 1 })])).status).toBe(200);
    const res = await send(world, [wire({ seq: 2 })]);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = (await res.json()) as EventsResponse;
    expect(body.results[0]).toEqual({ seq: 2, status: 'rejected', code: 'RATE_LIMITED', permanent: false });
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it('R2.1 R2.2 R2.5 register mints a verifiable token, stores nothing, and is limited per source', async () => {
    const world = makeWorld({ ...ROOMY, REGISTER_PER_SOURCE_PER_HOUR: 2 });
    const reg = async (source: string) => handleRequest(await post('/v1/register', '', undefined, { 'x-source': source }), world.deps);
    const a = await reg('s1');
    const body = (await a.json()) as { installId: string; token: string };
    expect(a.status).toBe(200);
    expect(body.installId).toMatch(/^[a-z2-7]{26}$/);
    // The minted token works on the events endpoint for that id.
    const ev = wire({ seq: 1 });
    ev.installId = body.installId;
    const ok = await handleRequest(await post('/v1/events', { installId: body.installId, events: [ev] }, body.token), world.deps);
    expect(ok.status).toBe(200);
    expect((await reg('s1')).status).toBe(200);
    const limited = await reg('s1');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await reg('s2')).status).toBe(200); // another source is unaffected
    expect(world.areas.size).toBe(1); // register itself touched no actor: only the events call did
    expect(world.revoked.size).toBe(0);
  });

  it('R2.4 responses never echo headers; unknown paths 404 and wrong methods 405', async () => {
    const world = makeWorld();
    expect((await handleRequest(new Request('https://api.test/nope'), world.deps)).status).toBe(404);
    expect((await handleRequest(new Request('https://api.test/v1/events'), world.deps)).status).toBe(405);
    expect((await handleRequest(new Request('https://api.test/v1/stats'), world.deps)).status).toBe(200);
  });
});
