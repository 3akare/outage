// Runs SqlPairStore and HomeCore against real SQLite (node:sqlite) through a thin SqlStorage shim, so the SQL text is checked
// (same approach as alerts-sql.test.ts). Also checks that a shard made before ADR 0044 gets its two new columns.
import { describe, expect, it } from 'vitest';
import { HomeCore } from '../api/home/core.ts';
import { PairingCore } from '../api/pairing/core.ts';
import { SqlPairStore } from '../api/pairing/store.ts';
import { CONFIG } from '../config.ts';
import { CELL, FakeSender, ID, NOW } from './helpers.ts';

interface Db {
  prepare(q: string): { all(...b: unknown[]): unknown[]; run(...b: unknown[]): { changes: number | bigint } };
}
const SQLITE = 'node:sqlite'; // a variable, so the type checker (no Node types in this package) does not resolve it
const { DatabaseSync } = (await import(SQLITE)) as { DatabaseSync: new (path: string) => Db };

function shim(db: Db = new DatabaseSync(':memory:')): SqlStorage {
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

const VIEWER = 'bbbbbbbbbbbbbbbbbbbbbbbbbb';
const MIN = 60_000;

describe('Home Watch on real SQL (ADR 0044)', () => {
  it('pairs, tracks, pushes, expires silence, answers the viewer and deletes', async () => {
    const store = new SqlPairStore(shim());
    const pairing = new PairingCore(store, { ...CONFIG, BUCKET_CAPACITY: 1000 });
    const sender = new FakeSender();
    const home = new HomeCore(store, sender, NOW);

    expect(pairing.createOffer({ key: 'AB23', codeHash: 'h'.repeat(64), stationInstall: ID, stationCell: CELL, nowMs: NOW })).toMatchObject({ status: 'ok' });
    expect(store.getOffer('AB23')?.stationCell).toBe(CELL);
    const claim = pairing.claim({
      key: 'AB23', codeHash: 'h'.repeat(64), viewerInstall: VIEWER, pairId: 'AB' + '0'.repeat(32), fcmToken: 'tok', quietStartMin: 0, quietEndMin: 0,
      tzOffsetMin: 0, stationName: 'Mum', nowMs: NOW,
    });
    expect(claim).toMatchObject({ status: 'ok', stationInstall: ID, stationCell: CELL });
    expect(store.getPair('AB' + '0'.repeat(32))?.pushFailedMs).toBeNull();

    await home.observe(ID, [{ type: 'ARMED', eventTimeMs: NOW }], NOW);
    await home.observe(ID, [{ type: 'UNPLUG', eventTimeMs: NOW + MIN }], NOW + MIN);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].title).toBe('Mum: power off since 8:01 a.m.');
    expect(store.hasSent('AB' + '0'.repeat(32), NOW + MIN, 'OFF')).toBe(true);
    expect(store.listStations()).toEqual([{ stationInstall: ID, state: 'OFF', sinceMs: NOW + MIN, stateVersion: NOW + MIN, lastSeenMs: NOW + MIN, offline: false }]);

    const restarted = new HomeCore(store, sender, NOW);
    expect(restarted.view('AB' + '0'.repeat(32), VIEWER, NOW + 2 * MIN)).toMatchObject({ status: 'OFF', sinceMs: NOW + MIN, stationName: 'Mum' });
    await restarted.tick(NOW + 31 * MIN + MIN);
    expect(sender.sent[1].title).toBe('Mum station is offline');
    expect(store.listStations()[0].offline).toBe(true);

    await restarted.observe(ID, [{ type: 'REPLUG', eventTimeMs: NOW + 40 * MIN }], NOW + 40 * MIN);
    expect(sender.sent[2].title).toMatch(/^Mum: power is back since/);

    expect(store.markPushFailed('AB' + '0'.repeat(32), NOW)).toBe(1);
    expect(store.markPushFailed('AB' + '0'.repeat(32), NOW)).toBe(0); // only the first failure counts
    expect(store.removePairsFailedBefore(NOW + 1)).toBe(1);
    expect(store.pairsOfStation(ID)).toEqual([]);
    expect(store.pruneSent(Number.MAX_SAFE_INTEGER)).toBe(0); // the sent rows went with the pair

    restarted.dropIfUnpaired(ID);
    expect(store.listStations()).toEqual([]);
  });

  it('delete-my-data removes state and sent memory for a station and for a viewer', () => {
    const store = new SqlPairStore(shim());
    const pair = (id: string, viewer: string) =>
      store.putPair({ pairId: id, stationInstall: ID, viewerInstall: viewer, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
    pair('AB1', VIEWER);
    pair('AB2', 'cccccccccccccccccccccccccc');
    store.putStation({ stationInstall: ID, state: 'ON', sinceMs: NOW, stateVersion: NOW, lastSeenMs: NOW, offline: false });
    store.markSent('AB1', NOW, 'ON');
    store.markSent('AB2', NOW, 'ON');
    store.deleteInstall(VIEWER);
    expect(store.hasSent('AB1', NOW, 'ON')).toBe(false);
    expect(store.hasSent('AB2', NOW, 'ON')).toBe(true);
    expect(store.listStations()).toHaveLength(1); // the station row stays until `sweep` finds it unpaired
    store.deleteInstall(ID);
    expect(store.listStations()).toEqual([]);
    expect(store.hasSent('AB2', NOW, 'ON')).toBe(false);
    expect(store.pairsOfStation(ID)).toEqual([]);
  });

  it('a shard created before ADR 0044 gains station_cell and push_failed_ms', () => {
    const db = new DatabaseSync(':memory:');
    const old = shim(db);
    old.exec(`CREATE TABLE pair_offer (key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, station_install TEXT NOT NULL,
      expires_ms INTEGER NOT NULL, attempts INTEGER NOT NULL) WITHOUT ROWID`).toArray();
    old.exec(`CREATE TABLE pair (pair_id TEXT PRIMARY KEY, station_install TEXT NOT NULL, viewer_install TEXT NOT NULL, fcm_token TEXT NOT NULL,
      quiet_start_min INTEGER NOT NULL, quiet_end_min INTEGER NOT NULL, tz_offset_min INTEGER NOT NULL,
      station_name TEXT, created_ms INTEGER NOT NULL) WITHOUT ROWID`).toArray();
    old.exec("INSERT INTO pair VALUES ('AB1', 's', 'v', 't', 0, 0, 0, NULL, 1)").toArray();
    const store = new SqlPairStore(shim(db));
    expect(store.getPair('AB1')?.pushFailedMs).toBeNull();
    store.putOffer({ key: 'K', codeHash: 'h', stationInstall: 's', expiresMs: 5, attempts: 0, stationCell: CELL });
    expect(store.getOffer('K')?.stationCell).toBe(CELL);
    new SqlPairStore(shim(db)); // a second start with the columns already there does not fail
  });
});
