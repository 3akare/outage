import { describe, expect, it } from 'vitest';
import { parentOf } from '@outage/shared';
import { AlertsCore } from '../api/alerts/core.ts';
import type { PushSender, SendResult } from '../api/alerts/fcm.ts';
import { publicPrecision, toAreaPushes } from '../api/alerts/hook.ts';
import { plan } from '../api/alerts/planner.ts';
import { runSends } from '../api/alerts/sender.ts';
import type { ScopeView } from '../api/area/reducer.ts';
import { MemAlertsStore } from './alerts-memory-store.ts';
import { push, sub } from './alerts-helpers.ts';
import { CELL, ID, NOW, PARENT, SIBLINGS, makeWorld, post, tokenFor } from './helpers.ts';

const TOKEN = 'y'.repeat(40);
const followBody = (over: Record<string, unknown> = {}) => ({
  installId: ID,
  cell: CELL,
  fcmToken: TOKEN,
  kinds: ['CONFIRMED', 'RESTORED'],
  quietStartMin: 22 * 60,
  quietEndMin: 6 * 60,
  tzOffsetMin: 60,
  ...over,
});
const sender = (r: SendResult): PushSender & { calls: number } => {
  const s = {
    calls: 0,
    async send() {
      s.calls++;
      return r;
    },
  };
  return s;
};

describe('L7_token_hygiene_and_delete', () => {
  it('UNREGISTERED removes the subscription and its queued messages', async () => {
    const store = new MemAlertsStore();
    const core = new AlertsCore(store);
    core.follow({ ...followBody(), fcmToken: TOKEN } as never, NOW);
    core.follow({ ...followBody(), installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' } as never, NOW);
    expect(core.onPushes([push()], NOW)).toBe(2);
    const r = await runSends(store, sender({ kind: 'unregistered' }), NOW);
    expect(r.removed).toBeGreaterThanOrEqual(1);
    expect(store.subscriptionsForCell(CELL).length).toBeLessThan(2);
    // every dead token is gone with its queue rows
    await runSends(store, sender({ kind: 'unregistered' }), NOW);
    expect(store.subscriptionsForCell(CELL)).toHaveLength(0);
    expect(store.queue.size).toBe(0);
  });

  it('delete-my-data removes every subscription, queued message and memory for the install, and nobody else', () => {
    const store = new MemAlertsStore();
    const core = new AlertsCore(store);
    const other = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';
    for (const cell of SIBLINGS.slice(0, 3)) {
      core.follow({ ...followBody({ cell }) } as never, NOW);
      core.follow({ ...followBody({ cell, installId: other }) } as never, NOW);
    }
    core.onPushes([push({ cell: SIBLINGS[0] as string })], NOW);
    store.markSent([...store.queue.values()][0] as never, NOW, null);
    expect(core.deleteInstall(ID)).toBeGreaterThan(0);
    expect([...store.subs.values()].some((s) => s.installId === ID)).toBe(false);
    expect([...store.queue.values()].some((m) => m.installId === ID)).toBe(false);
    expect([...store.sent.values()].some((m) => m.installId === ID)).toBe(false);
    expect([...store.subs.values()].filter((s) => s.installId === other)).toHaveLength(3);
  });

  it('one subscription per install and cell: a second follow replaces the token and window (R8.5)', () => {
    const store = new MemAlertsStore();
    const core = new AlertsCore(store);
    core.follow(followBody() as never, NOW);
    core.follow(followBody({ fcmToken: 'z'.repeat(40), kinds: ['RESTORED'] }) as never, NOW + 1);
    const subs = store.subscriptionsForCell(CELL);
    expect(subs).toHaveLength(1);
    expect(subs[0]?.fcmToken).toBe('z'.repeat(40));
    expect(subs[0]?.kinds).toEqual(['RESTORED']);
  });

  it('a sent push is remembered: the same episode and kind is never queued again (R6.4)', async () => {
    const store = new MemAlertsStore();
    const core = new AlertsCore(store);
    core.follow(followBody() as never, NOW);
    expect(core.onPushes([push()], NOW)).toBe(1);
    expect(core.onPushes([push()], NOW)).toBe(0); // queued
    await runSends(store, sender({ kind: 'ok', name: 'n' }), NOW);
    expect(core.onPushes([push()], NOW + 1000)).toBe(0); // sent
    expect(core.onPushes([push({ kind: 'RESTORED' })], NOW + 2000)).toBe(1);
  });

  it('prune forgets sent memory older than 7 days only', () => {
    const store = new MemAlertsStore();
    const core = new AlertsCore(store);
    core.follow(followBody() as never, NOW);
    core.onPushes([push()], NOW);
    store.markSent([...store.queue.values()][0] as never, NOW, null);
    core.prune(NOW + 6 * 86_400_000);
    expect(store.sent.size).toBe(1);
    core.prune(NOW + 8 * 86_400_000);
    expect(store.sent.size).toBe(0);
  });
});

describe('R6_R10 follow endpoints', () => {
  it('accepts a valid follow with the install token, stores it under the cell parent, and unfollows', async () => {
    const world = makeWorld();
    const res = await (await import('../api/ingest/handlers.ts')).handleRequest(
      await post('/v1/follow', followBody(), await tokenFor()),
      world.deps,
    );
    expect(res.status).toBe(200);
    expect(world.alertsOf(PARENT).subscriptionsForCell(CELL)).toHaveLength(1);
    const { handleRequest } = await import('../api/ingest/handlers.ts');
    const un = await handleRequest(
      await post('/v1/unfollow', { installId: ID, cell: CELL }, await tokenFor()),
      world.deps,
    );
    expect(un.status).toBe(200);
    expect(world.alertsOf(PARENT).subscriptionsForCell(CELL)).toHaveLength(0);
  });

  it('rejects bad input and bad auth without storing anything', async () => {
    const { handleRequest } = await import('../api/ingest/handlers.ts');
    const world = makeWorld();
    const bad = [
      followBody({ extra: 1 }),
      followBody({ fcmToken: 'short' }),
      followBody({ fcmToken: 'a b'.repeat(20) }),
      followBody({ cell: 'nope' }),
      followBody({ kinds: [] }),
      followBody({ kinds: ['CONFIRMED', 'CONFIRMED'] }),
      followBody({ kinds: ['OTHER'] }),
      followBody({ quietStartMin: 1440 }),
      followBody({ quietEndMin: null }),
      followBody({ tzOffsetMin: 900 }),
      followBody({ tzOffsetMin: 1.5 }),
      { ...followBody(), lat: 6.5 },
      'not an object',
    ];
    for (const b of bad) {
      const r = await handleRequest(await post('/v1/follow', b, await tokenFor()), world.deps);
      expect(r.status).toBe(400);
    }
    expect((await handleRequest(await post('/v1/follow', followBody(), 'wrong'), world.deps)).status).toBe(401);
    world.revoked.add(ID);
    expect((await handleRequest(await post('/v1/follow', followBody(), await tokenFor()), world.deps)).status).toBe(
      401,
    );
    expect(world.alertsOf(PARENT).subscriptionsForCell(CELL).length).toBe(0);
  });

  it('allows no window (both bounds null) and limits a flood per install', async () => {
    const { handleRequest } = await import('../api/ingest/handlers.ts');
    const world = makeWorld({ ...makeWorld().deps.cfg, FOLLOW_PER_INSTALL_PER_HOUR: 2 });
    const ok = followBody({ quietStartMin: null, quietEndMin: null });
    expect((await handleRequest(await post('/v1/follow', ok, await tokenFor()), world.deps)).status).toBe(200);
    expect((await handleRequest(await post('/v1/follow', ok, await tokenFor()), world.deps)).status).toBe(200);
    expect((await handleRequest(await post('/v1/follow', ok, await tokenFor()), world.deps)).status).toBe(429);
  });

  it('delete-my-data through /v1/delete removes the subscriptions in the listed cells', async () => {
    const { handleRequest } = await import('../api/ingest/handlers.ts');
    const world = makeWorld();
    await handleRequest(await post('/v1/follow', followBody(), await tokenFor()), world.deps);
    const del = await handleRequest(
      await post('/v1/delete', { installId: ID, cells: [CELL] }, await tokenFor()),
      world.deps,
    );
    expect(del.status).toBe(200);
    expect(world.alertsOf(PARENT).subscriptionsForCell(CELL)).toHaveLength(0);
  });
});

describe('R6.5 push hook', () => {
  const view = (over: Partial<ScopeView['view'] & object>, key = 'k'): ScopeView =>
    ({
      scopeKey: key,
      view: {
        scopeKind: 'CELL',
        precision: 'CELL',
        boundary: [CELL],
        status: 'CONFIRMED',
        history30d: [],
        phones: '3+',
        ...over,
      },
    }) as unknown as ScopeView;

  it('uses the finest public precision that covers the cell, and null when none does', () => {
    expect(publicPrecision(CELL, [], parentOf)).toBeNull();
    expect(publicPrecision(CELL, [{ scopeKey: 'k', view: null } as unknown as ScopeView], parentOf)).toBeNull();
    expect(
      publicPrecision(CELL, [view({ scopeKind: 'PARENT', precision: 'COARSE', boundary: [PARENT] })], parentOf),
    ).toBe('COARSE');
    expect(
      publicPrecision(
        CELL,
        [view({ scopeKind: 'PARENT', precision: 'COARSE', boundary: [PARENT] }), view({})],
        parentOf,
      ),
    ).toBe('CELL');
    expect(publicPrecision(SIBLINGS[1] as string, [view({})], parentOf)).toBeNull();
  });

  it('plans pushes only for cells with a public status', () => {
    const passed = [{ cell: CELL, episodeId: `${CELL}|1`, kind: 'CONFIRMED' as const }];
    const covered = plan(toAreaPushes(passed, [view({})], parentOf, NOW), [sub()], NOW, { has: () => false });
    const uncovered = plan(toAreaPushes(passed, [], parentOf, NOW), [sub()], NOW, { has: () => false });
    expect(covered).toHaveLength(1);
    expect(uncovered).toHaveLength(0);
  });
});
