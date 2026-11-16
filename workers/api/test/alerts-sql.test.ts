// Runs SqlAlertsStore against real SQLite (node:sqlite) through a thin SqlStorage shim, so the SQL text is checked.
import { describe, expect, it } from 'vitest';
import { AlertsCore } from '../src/alerts/core.ts';
import { runSends } from '../src/alerts/sender.ts';
import { SqlAlertsStore } from '../src/alerts/store.ts';
import { push } from './alerts-helpers.ts';
import { CELL, ID, NOW } from './helpers.ts';

interface Db {
  prepare(q: string): { all(...b: unknown[]): unknown[]; run(...b: unknown[]): { changes: number | bigint } };
}
const SQLITE = 'node:sqlite'; // a variable, so the type checker (no Node types in this package) does not resolve it
const { DatabaseSync } = (await import(SQLITE)) as { DatabaseSync: new (path: string) => Db };

function shim(): SqlStorage {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...bindings: (string | number | null)[]) {
      const stmt = db.prepare(query);
      const returns = /^\s*(SELECT|PRAGMA)/i.test(query);
      let rowsWritten = 0;
      let rows: unknown[] = [];
      if (returns) rows = stmt.all(...bindings);
      else rowsWritten = Number(stmt.run(...bindings).changes);
      return {
        toArray: () => rows,
        get rowsWritten() {
          return rowsWritten;
        },
      };
    },
  } as unknown as SqlStorage;
}
const follow = (installId = ID, cell = CELL) =>
  ({
    installId,
    cell,
    fcmToken: 'q'.repeat(40),
    kinds: ['CONFIRMED', 'RESTORED'],
    quietStartMin: 1320,
    quietEndMin: 360,
    tzOffsetMin: 60,
  }) as never;

describe('L7_token_hygiene_and_delete (SQL)', () => {
  it('stores, plans, queues, sends, remembers and deletes with the real SQL text', async () => {
    const store = new SqlAlertsStore(shim());
    const core = new AlertsCore(store);
    core.follow(follow(), NOW);
    core.follow(follow(), NOW + 1); // replaces
    expect(store.subscriptionsForCell(CELL)).toHaveLength(1);
    expect(core.onPushes([push()], NOW)).toBe(1);
    expect(core.onPushes([push()], NOW)).toBe(0);
    expect(store.nextDueMs()).toBe(NOW);
    const sent: string[] = [];
    const ok = {
      async send(m: { token: string; channel: string }) {
        sent.push(m.channel);
        return { kind: 'ok' as const, name: 'n' };
      },
    };
    expect((await runSends(store, ok, NOW)).sent).toBe(1);
    expect(store.nextDueMs()).toBeNull();
    expect(core.onPushes([push()], NOW + 10)).toBe(0); // remembered
    expect(core.prune(NOW + 8 * 86_400_000)).toBeGreaterThanOrEqual(0);
    core.onPushes([push({ kind: 'RESTORED' })], NOW + 20);
    const retry = {
      async send() {
        return { kind: 'retry' as const, reason: 'UNAVAILABLE' as const, retryAfterMs: null };
      },
    };
    await runSends(store, retry, NOW + 30);
    expect(store.nextDueMs()).toBe(NOW + 30 + 60_000);
    const gone = {
      async send() {
        return { kind: 'unregistered' as const };
      },
    };
    await runSends(store, gone, NOW + 30 + 60_000);
    expect(store.subscriptionsForCell(CELL)).toHaveLength(0);
    expect(store.nextDueMs()).toBeNull();
    core.follow(follow(), NOW);
    core.onPushes([push({ episodeId: 'e9' })], NOW);
    expect(core.deleteInstall(ID)).toBeGreaterThan(0);
    expect(store.subscriptionsForCell(CELL)).toHaveLength(0);
    expect(store.nextDueMs()).toBeNull();
  });
});
