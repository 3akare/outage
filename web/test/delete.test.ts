import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handleRequest } from '../api/ingest/handlers.ts';
import { mergeCounters, RevocationCache } from '../api/registry/revocation.ts';
import { CELL, ID, makeWorld, NOW, post, ROOMY, tokenFor, wire } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';

const OTHER = '88589c986bfffff';
const del = async (world: ReturnType<typeof makeWorld>, body: unknown, token?: string) =>
  handleRequest(await post('/v1/delete', body, token ?? (await tokenFor())), world.deps);
const events = async (world: ReturnType<typeof makeWorld>, evs: unknown[]) =>
  handleRequest(await post('/v1/events', { installId: ID, events: evs }, await tokenFor()), world.deps);

async function seeded() {
  const world = makeWorld(ROOMY);
  await events(world, [wire({ seq: 1, type: 'ARMED' }), wire({ seq: 2 }), wire({ seq: 3, cell: OTHER, type: 'REPLUG' })]);
  for (const a of world.areas.values()) a.core.flush();
  return world;
}

describe('R12 delete my data', () => {
  it('R12.1 removes rows and memory state in the listed cells only', async () => {
    const world = await seeded();
    const res = await del(world, { installId: ID, cells: [CELL] });
    expect(res.status).toBe(200);
    const [a, b] = [...world.areas.values()];
    expect(a.store.detection.size + a.store.installs.size).toBe(0);
    expect(a.core.armedState(ID)).toBeUndefined();
    expect(b.store.detection.size).toBe(1); // OTHER was not listed, so its row stays until retention expires it
  });

  it('R12.2 afterwards the token is rejected with 401, and a retried delete still completes', async () => {
    const world = await seeded();
    expect((await del(world, { installId: ID, cells: [CELL, OTHER] })).status).toBe(200);
    expect((await events(world, [wire({ seq: 10 })])).status).toBe(401);
    const retry = await del(world, { installId: ID, cells: [CELL, OTHER] });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ rows: 0 });
  });

  it('R12.1 an actor failure gives 502, the token is already revoked, and the retry removes what is left', async () => {
    const world = await seeded();
    const parentB = [...world.areas.keys()][1];
    world.failParents.add(parentB);
    expect((await del(world, { installId: ID, cells: [CELL, OTHER] })).status).toBe(502);
    expect(world.revoked.has(ID)).toBe(true);
    world.failParents.clear();
    expect((await del(world, { installId: ID, cells: [CELL, OTHER] })).status).toBe(200);
    for (const a of world.areas.values()) expect(a.store.detection.size).toBe(0);
  });

  it('R12.1 another install, a missing token or bad cells cannot delete', async () => {
    const world = await seeded();
    expect((await del(world, { installId: ID, cells: [CELL] }, await tokenFor('aaaaaaaaaaaaaaaaaaaaaaaaaa'))).status).toBe(401);
    expect((await del(world, { installId: ID, cells: [CELL] }, 'nope')).status).toBe(401);
    expect((await del(world, { installId: ID, cells: ['nope'] })).status).toBe(400);
    expect((await del(world, { installId: ID, cells: new Array(101).fill(CELL) })).status).toBe(400);
    expect([...world.areas.values()].reduce((n, a) => n + a.store.detection.size, 0)).toBe(2);
    expect(world.revoked.size).toBe(0);
  });

  it('R10.2 a deleted install cannot send events even for cells it never listed', async () => {
    const world = await seeded();
    await del(world, { installId: ID, cells: [CELL] });
    const before = world.areaCalls.length;
    expect((await events(world, [wire({ seq: 50, cell: OTHER })])).status).toBe(401);
    expect(world.areaCalls.length).toBe(before);
  });
});

describe('R12 revocation cache (ADR 0003 addendum)', () => {
  it('refreshes after its lifetime, knows local revocations at once, and fails closed when the registry is down', async () => {
    let fetches = 0;
    let list = ['h1'];
    let down = false;
    const cache = new RevocationCache(15_000, async () => {
      fetches++;
      if (down) throw new Error('down');
      return list;
    });
    expect(await cache.has('h1', NOW)).toBe(true);
    expect(await cache.has('h2', NOW + 1000)).toBe(false);
    expect(fetches).toBe(1);
    list = ['h1', 'h2'];
    expect(await cache.has('h2', NOW + 5000)).toBe(false); // still the cached snapshot
    cache.add('h3');
    expect(await cache.has('h3', NOW + 6000)).toBe(true);
    expect(await cache.has('h2', NOW + 15_000)).toBe(true); // refreshed
    down = true;
    await expect(cache.has('h2', NOW + 40_000)).rejects.toThrow();
  });

  it('R13 mergeCounters adds counts and keeps no ids', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom('a', 'b', 'c'), fc.nat(1000)), fc.dictionary(fc.constantFrom('a', 'b', 'c'), fc.nat(1000)), (x, y) => {
        const m = mergeCounters(x, y);
        for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) expect(m[k]).toBe((x[k] ?? 0) + (y[k] ?? 0));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('R10.2 an unreachable registry makes the events request fail as transient 503, not as accepted', async () => {
    const world = makeWorld(ROOMY);
    world.deps.registry.isRevoked = async () => {
      throw new Error('registry down');
    };
    const res = await events(world, [wire({ seq: 1 })]);
    expect(res.status).toBe(503);
    expect(world.areaCalls).toHaveLength(0);
  });
});
