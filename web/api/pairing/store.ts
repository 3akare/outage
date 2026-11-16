// SQLite storage for one pairing shard (ADR 0009). Tables are tiny (a few rows per station), so there are no secondary indexes:
// each index entry would count as a row written. API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import type { HomeKind } from '../home/planner.ts';
import type { StationRow } from '../home/core.ts';
import type { OfferRow, PairRow, PairStore } from './core.ts';

type PairSql = {
  pair_id: string;
  station_install: string;
  viewer_install: string;
  fcm_token: string;
  quiet_start_min: number;
  quiet_end_min: number;
  tz_offset_min: number;
  station_name: string | null;
  created_ms: number;
  push_failed_ms: number | null;
};

type StationSql = {
  station_install: string;
  state: 'UNKNOWN' | 'ON' | 'OFF';
  since_ms: number | null;
  state_version: number;
  last_seen_ms: number;
  offline: number;
};

export class SqlPairStore implements PairStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS pair_offer (
      key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, station_install TEXT NOT NULL,
      expires_ms INTEGER NOT NULL, attempts INTEGER NOT NULL, station_cell TEXT) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pair (
      pair_id TEXT PRIMARY KEY, station_install TEXT NOT NULL, viewer_install TEXT NOT NULL, fcm_token TEXT NOT NULL,
      quiet_start_min INTEGER NOT NULL, quiet_end_min INTEGER NOT NULL, tz_offset_min INTEGER NOT NULL,
      station_name TEXT, created_ms INTEGER NOT NULL, push_failed_ms INTEGER) WITHOUT ROWID`);
    // Home Watch (ADR 0044): station state and sent memory, only for paired stations.
    sql.exec(`CREATE TABLE IF NOT EXISTS station_state (
      station_install TEXT PRIMARY KEY, state TEXT NOT NULL, since_ms INTEGER, state_version INTEGER NOT NULL,
      last_seen_ms INTEGER NOT NULL, offline INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pair_sent (
      pair_id TEXT NOT NULL, state_version INTEGER NOT NULL, kind TEXT NOT NULL,
      PRIMARY KEY (pair_id, state_version, kind)) WITHOUT ROWID`);
    // A shard created before ADR 0044 lacks the two new columns.
    this.addColumn('pair_offer', 'station_cell', 'TEXT');
    this.addColumn('pair', 'push_failed_ms', 'INTEGER');
  }

  /** Adds a column to a table made before ADR 0044. Fails harmlessly with "duplicate column" when it is already there. */
  private addColumn(table: string, column: string, type: string): void {
    try {
      this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      // already present
    }
  }

  private run(query: string, ...bindings: (string | number | null)[]): number {
    const cursor = this.sql.exec(query, ...bindings);
    cursor.toArray();
    return cursor.rowsWritten;
  }

  getOffer(key: string): OfferRow | undefined {
    const r = this.sql
      .exec<{ key: string; code_hash: string; station_install: string; expires_ms: number; attempts: number; station_cell: string | null }>(
        'SELECT key, code_hash, station_install, expires_ms, attempts, station_cell FROM pair_offer WHERE key = ?',
        key,
      )
      .toArray()[0];
    return (
      r && {
        key: r.key,
        codeHash: r.code_hash,
        stationInstall: r.station_install,
        expiresMs: r.expires_ms,
        attempts: r.attempts,
        ...(r.station_cell ? { stationCell: r.station_cell } : {}),
      }
    );
  }

  putOffer(o: OfferRow): void {
    this.run(
      'INSERT OR REPLACE INTO pair_offer (key, code_hash, station_install, expires_ms, attempts, station_cell) VALUES (?, ?, ?, ?, ?, ?)',
      o.key, o.codeHash, o.stationInstall, o.expiresMs, o.attempts, o.stationCell ?? null,
    );
  }

  deleteOffer(key: string): number {
    return this.run('DELETE FROM pair_offer WHERE key = ?', key);
  }

  deleteOffersOfStation(stationInstall: string): number {
    return this.run('DELETE FROM pair_offer WHERE station_install = ?', stationInstall);
  }

  deleteExpiredOffers(nowMs: number): number {
    return this.run('DELETE FROM pair_offer WHERE expires_ms <= ?', nowMs);
  }

  nextOfferExpiry(): number | null {
    return this.sql.exec<{ at: number | null }>('SELECT MIN(expires_ms) AS at FROM pair_offer').toArray()[0]?.at ?? null;
  }

  countViewers(stationInstall: string, exceptViewer: string): number {
    return (
      this.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM pair WHERE station_install = ? AND viewer_install <> ?', stationInstall, exceptViewer)
        .toArray()[0]?.n ?? 0
    );
  }

  getPair(pairId: string): PairRow | undefined {
    const r = this.sql.exec<PairSql>('SELECT * FROM pair WHERE pair_id = ?', pairId).toArray()[0];
    return (
      r && {
        pairId: r.pair_id,
        stationInstall: r.station_install,
        viewerInstall: r.viewer_install,
        fcmToken: r.fcm_token,
        quietStartMin: r.quiet_start_min,
        quietEndMin: r.quiet_end_min,
        tzOffsetMin: r.tz_offset_min,
        stationName: r.station_name,
        createdMs: r.created_ms,
        pushFailedMs: r.push_failed_ms,
      }
    );
  }

  putPair(p: PairRow): void {
    this.run(
      `INSERT OR REPLACE INTO pair (pair_id, station_install, viewer_install, fcm_token, quiet_start_min, quiet_end_min, tz_offset_min,
        station_name, created_ms, push_failed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.pairId, p.stationInstall, p.viewerInstall, p.fcmToken, p.quietStartMin, p.quietEndMin, p.tzOffsetMin, p.stationName, p.createdMs, p.pushFailedMs,
    );
  }

  deletePair(pairId: string): number {
    this.run('DELETE FROM pair_sent WHERE pair_id = ?', pairId);
    return this.run('DELETE FROM pair WHERE pair_id = ?', pairId);
  }

  deletePairsBetween(stationInstall: string, viewerInstall: string): number {
    this.run('DELETE FROM pair_sent WHERE pair_id IN (SELECT pair_id FROM pair WHERE station_install = ? AND viewer_install = ?)', stationInstall, viewerInstall);
    return this.run('DELETE FROM pair WHERE station_install = ? AND viewer_install = ?', stationInstall, viewerInstall);
  }

  deleteInstall(installId: string): number {
    this.run('DELETE FROM pair_sent WHERE pair_id IN (SELECT pair_id FROM pair WHERE station_install = ? OR viewer_install = ?)', installId, installId);
    return (
      this.run('DELETE FROM pair_offer WHERE station_install = ?', installId) +
      this.run('DELETE FROM station_state WHERE station_install = ?', installId) +
      this.run('DELETE FROM pair WHERE station_install = ? OR viewer_install = ?', installId, installId)
    );
  }

  // ---- Home Watch (ADR 0044) ----------------------------------------------------------------------------------

  listStations(): StationRow[] {
    return this.sql
      .exec<StationSql>('SELECT station_install, state, since_ms, state_version, last_seen_ms, offline FROM station_state')
      .toArray()
      .map((r) => ({
        stationInstall: r.station_install,
        state: r.state,
        sinceMs: r.since_ms,
        stateVersion: r.state_version,
        lastSeenMs: r.last_seen_ms,
        offline: r.offline === 1,
      }));
  }

  putStation(s: StationRow): number {
    return this.run(
      'INSERT OR REPLACE INTO station_state VALUES (?, ?, ?, ?, ?, ?)',
      s.stationInstall, s.state, s.sinceMs, s.stateVersion, s.lastSeenMs, s.offline ? 1 : 0,
    );
  }

  deleteStation(stationInstall: string): number {
    return this.run('DELETE FROM station_state WHERE station_install = ?', stationInstall);
  }

  pairsOfStation(stationInstall: string): PairRow[] {
    return this.sql
      .exec<PairSql>('SELECT * FROM pair WHERE station_install = ?', stationInstall)
      .toArray()
      .map((r) => ({
        pairId: r.pair_id,
        stationInstall: r.station_install,
        viewerInstall: r.viewer_install,
        fcmToken: r.fcm_token,
        quietStartMin: r.quiet_start_min,
        quietEndMin: r.quiet_end_min,
        tzOffsetMin: r.tz_offset_min,
        stationName: r.station_name,
        createdMs: r.created_ms,
        pushFailedMs: r.push_failed_ms,
      }));
  }

  hasSent(pairId: string, version: number, kind: HomeKind): boolean {
    return (
      this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM pair_sent WHERE pair_id = ? AND state_version = ? AND kind = ?', pairId, version, kind).toArray()[0]?.n === 1
    );
  }

  markSent(pairId: string, version: number, kind: HomeKind): number {
    return this.run('INSERT OR IGNORE INTO pair_sent VALUES (?, ?, ?)', pairId, version, kind);
  }

  pruneSent(beforeVersion: number): number {
    return this.run('DELETE FROM pair_sent WHERE state_version < ?', beforeVersion);
  }

  markPushFailed(pairId: string, atMs: number): number {
    return this.run('UPDATE pair SET push_failed_ms = ? WHERE pair_id = ? AND push_failed_ms IS NULL', atMs, pairId);
  }

  removePairsFailedBefore(beforeMs: number): number {
    this.run('DELETE FROM pair_sent WHERE pair_id IN (SELECT pair_id FROM pair WHERE push_failed_ms IS NOT NULL AND push_failed_ms < ?)', beforeMs);
    return this.run('DELETE FROM pair WHERE push_failed_ms IS NOT NULL AND push_failed_ms < ?', beforeMs);
  }
}
