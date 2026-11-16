// SQLite storage for one area actor (design section 7, amended by ADR 0006: `cell` column; LABEL columns from
// alerts-and-light-alarm section 4). API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import type { InstallState } from '../ingest/armed.ts';
import type { AreaStore, DetectionRow } from './core.ts';
import type { ModelRow, ModelStore } from './model.ts';

export class SqlAreaStore implements AreaStore {
  constructor(private readonly sql: SqlStorage) {
    // WITHOUT ROWID with the PK as the idempotency record (R5.1). No secondary index: each index entry would count as a row written.
    sql.exec(`CREATE TABLE IF NOT EXISTS detection_event (
      install_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, cell TEXT NOT NULL,
      event_time_ms INTEGER NOT NULL, receive_time_ms INTEGER NOT NULL, confidence TEXT NOT NULL,
      scheduling_delay_ms INTEGER, ref_seq INTEGER, answer TEXT,
      PRIMARY KEY (install_id, seq)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS install_state (
      install_id TEXT PRIMARY KEY, armed INTEGER NOT NULL, armed_since_ms INTEGER,
      last_event_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID');
  }

  /** Runs a statement to completion and returns the rows it wrote. */
  private run(query: string, ...bindings: (string | number | null)[]): number {
    const cursor = this.sql.exec(query, ...bindings);
    cursor.toArray();
    return cursor.rowsWritten;
  }

  hasDetection(installId: string, seq: number): boolean {
    return this.sql.exec('SELECT 1 AS one FROM detection_event WHERE install_id = ? AND seq = ?', installId, seq).toArray().length > 0;
  }

  insertDetection(r: DetectionRow): number {
    return this.run(
      'INSERT OR IGNORE INTO detection_event VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      r.installId, r.seq, r.type, r.cell, r.eventTimeMs, r.receiveTimeMs, r.confidence, r.schedulingDelayMs, r.refSeq, r.answer,
    );
  }

  getInstall(installId: string): InstallState | undefined {
    const rows = this.sql
      .exec<{ armed: number; armed_since_ms: number | null; last_event_ms: number; last_seen_ms: number }>(
        'SELECT armed, armed_since_ms, last_event_ms, last_seen_ms FROM install_state WHERE install_id = ?',
        installId,
      )
      .toArray();
    const r = rows[0];
    return r && { armed: r.armed === 1, armedSinceMs: r.armed_since_ms, lastEventMs: r.last_event_ms, lastSeenMs: r.last_seen_ms };
  }

  putInstall(installId: string, s: InstallState): number {
    return this.run(
      'INSERT OR REPLACE INTO install_state VALUES (?, ?, ?, ?, ?)',
      installId, s.armed ? 1 : 0, s.armedSinceMs, s.lastEventMs, s.lastSeenMs,
    );
  }

  deleteInstall(installId: string): number {
    return this.run('DELETE FROM detection_event WHERE install_id = ?', installId) + this.run('DELETE FROM install_state WHERE install_id = ?', installId);
  }

  prune(beforeMs: number): number {
    return this.run('DELETE FROM detection_event WHERE receive_time_ms < ?', beforeMs) + this.run('DELETE FROM install_state WHERE last_seen_ms < ?', beforeMs);
  }

  getMeta(key: string): string | undefined {
    return this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value;
  }

  setMeta(key: string, value: string): number {
    return this.run('INSERT OR REPLACE INTO meta VALUES (?, ?)', key, value);
  }
}

/**
 * SQLite rows for the area model (area-cells design section 10): engine states partitioned by install bucket, and one
 * row per other model field. Writes and deletes of one flush run in one transaction:
 * https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync
 * Row and value size limit (8 MB): https://developers.cloudflare.com/durable-objects/platform/limits/
 */
export class SqlModelStore implements ModelStore {
  constructor(
    private readonly sql: SqlStorage,
    private readonly transactionSync: <T>(fn: () => T) => T,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS area_model (
      tbl TEXT NOT NULL, key TEXT NOT NULL, part TEXT NOT NULL, json TEXT NOT NULL,
      PRIMARY KEY (tbl, key, part)) WITHOUT ROWID`);
  }

  loadRows(): ModelRow[] {
    return this.sql
      .exec<{ tbl: string; key: string; part: string; json: string }>('SELECT tbl, key, part, json FROM area_model')
      .toArray()
      .map((r) => ({ table: r.tbl as ModelRow['table'], key: r.key, part: r.part, json: r.json }));
  }

  writeRows(put: readonly ModelRow[], del: readonly Omit<ModelRow, 'json'>[]): number {
    return this.transactionSync(() => {
      let n = 0;
      for (const r of put) {
        const c = this.sql.exec(
          'INSERT OR REPLACE INTO area_model VALUES (?, ?, ?, ?)',
          r.table,
          r.key,
          r.part,
          r.json,
        );
        c.toArray();
        n += c.rowsWritten;
      }
      for (const r of del) {
        const c = this.sql.exec(
          'DELETE FROM area_model WHERE tbl = ? AND key = ? AND part = ?',
          r.table,
          r.key,
          r.part,
        );
        c.toArray();
        n += c.rowsWritten;
      }
      return n;
    });
  }
}
