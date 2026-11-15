// SQLite storage for one pairing shard (ADR 0009). Tables are tiny (a few rows per station), so there are no secondary indexes:
// each index entry would count as a row written. API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
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
};

export class SqlPairStore implements PairStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS pair_offer (
      key TEXT PRIMARY KEY, code_hash TEXT NOT NULL, station_install TEXT NOT NULL,
      expires_ms INTEGER NOT NULL, attempts INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pair (
      pair_id TEXT PRIMARY KEY, station_install TEXT NOT NULL, viewer_install TEXT NOT NULL, fcm_token TEXT NOT NULL,
      quiet_start_min INTEGER NOT NULL, quiet_end_min INTEGER NOT NULL, tz_offset_min INTEGER NOT NULL,
      station_name TEXT, created_ms INTEGER NOT NULL) WITHOUT ROWID`);
  }

  private run(query: string, ...bindings: (string | number | null)[]): number {
    const cursor = this.sql.exec(query, ...bindings);
    cursor.toArray();
    return cursor.rowsWritten;
  }

  getOffer(key: string): OfferRow | undefined {
    const r = this.sql
      .exec<{ key: string; code_hash: string; station_install: string; expires_ms: number; attempts: number }>(
        'SELECT key, code_hash, station_install, expires_ms, attempts FROM pair_offer WHERE key = ?',
        key,
      )
      .toArray()[0];
    return r && { key: r.key, codeHash: r.code_hash, stationInstall: r.station_install, expiresMs: r.expires_ms, attempts: r.attempts };
  }

  putOffer(o: OfferRow): void {
    this.run('INSERT OR REPLACE INTO pair_offer VALUES (?, ?, ?, ?, ?)', o.key, o.codeHash, o.stationInstall, o.expiresMs, o.attempts);
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
      }
    );
  }

  putPair(p: PairRow): void {
    this.run(
      'INSERT OR REPLACE INTO pair VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.pairId, p.stationInstall, p.viewerInstall, p.fcmToken, p.quietStartMin, p.quietEndMin, p.tzOffsetMin, p.stationName, p.createdMs,
    );
  }

  deletePair(pairId: string): number {
    return this.run('DELETE FROM pair WHERE pair_id = ?', pairId);
  }

  deletePairsBetween(stationInstall: string, viewerInstall: string): number {
    return this.run('DELETE FROM pair WHERE station_install = ? AND viewer_install = ?', stationInstall, viewerInstall);
  }

  deleteInstall(installId: string): number {
    return (
      this.run('DELETE FROM pair_offer WHERE station_install = ?', installId) +
      this.run('DELETE FROM pair WHERE station_install = ? OR viewer_install = ?', installId, installId)
    );
  }
}
