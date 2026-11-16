// SQLite storage for subscriptions, push memory and the send queue in the area actor (alerts-and-light-alarm design 5.1).
// API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
// No secondary index: each index entry would count as a row written on the free plan. Tokens are stored but never logged.
import type { AlertsStore } from './core.ts';
import { type PlannedMessage, sentKey, type Subscription } from './planner.ts';
import type { QueuedMessage } from './sender.ts';

type Bind = string | number | null;

export class SqlAlertsStore implements AlertsStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS subscription (
      install_id TEXT NOT NULL, cell TEXT NOT NULL, fcm_token TEXT NOT NULL, kinds TEXT NOT NULL,
      quiet_start_min INTEGER, quiet_end_min INTEGER, tz_offset_min INTEGER NOT NULL, created_ms INTEGER NOT NULL,
      PRIMARY KEY (install_id, cell)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS push_sent (
      k TEXT PRIMARY KEY, install_id TEXT NOT NULL, sent_ms INTEGER NOT NULL, message_name TEXT) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS push_queue (
      k TEXT PRIMARY KEY, install_id TEXT NOT NULL, cell TEXT NOT NULL, episode_id TEXT NOT NULL, kind TEXT NOT NULL,
      channel TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, decision_ms INTEGER NOT NULL,
      attempts INTEGER NOT NULL, next_try_ms INTEGER NOT NULL) WITHOUT ROWID`);
  }

  private run(query: string, ...b: Bind[]): number {
    const c = this.sql.exec(query, ...b);
    c.toArray();
    return c.rowsWritten;
  }

  putSubscription(s: Subscription): number {
    return this.run(
      'INSERT OR REPLACE INTO subscription VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      s.installId,
      s.cell,
      s.fcmToken,
      s.kinds.join(','),
      s.quietStartMin,
      s.quietEndMin,
      s.tzOffsetMin,
      s.createdMs,
    );
  }

  subscriptionsForCell(cell: string): Subscription[] {
    return this.sql
      .exec<{
        install_id: string;
        cell: string;
        fcm_token: string;
        kinds: string;
        quiet_start_min: number | null;
        quiet_end_min: number | null;
        tz_offset_min: number;
        created_ms: number;
      }>('SELECT * FROM subscription WHERE cell = ?', cell)
      .toArray()
      .map((r) => ({
        installId: r.install_id,
        cell: r.cell,
        fcmToken: r.fcm_token,
        kinds: r.kinds.split(',').filter((k): k is 'CONFIRMED' | 'RESTORED' => k === 'CONFIRMED' || k === 'RESTORED'),
        quietStartMin: r.quiet_start_min,
        quietEndMin: r.quiet_end_min,
        tzOffsetMin: r.tz_offset_min,
        createdMs: r.created_ms,
      }));
  }

  removeSubscriptionRows(installId: string, cell: string): number {
    return (
      this.run('DELETE FROM subscription WHERE install_id = ? AND cell = ?', installId, cell) +
      this.run('DELETE FROM push_queue WHERE install_id = ? AND cell = ?', installId, cell)
    );
  }

  /** Sent or queued, by `sentKey` (R6.4). */
  has(key: string): boolean {
    return (
      this.sql.exec('SELECT 1 AS one FROM push_sent WHERE k = ?', key).toArray().length > 0 ||
      this.sql.exec('SELECT 1 AS one FROM push_queue WHERE k = ?', key).toArray().length > 0
    );
  }

  enqueue(msgs: readonly PlannedMessage[], nowMs: number): number {
    let n = 0;
    for (const m of msgs) {
      n += this.run(
        'INSERT OR IGNORE INTO push_queue VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
        sentKey(m.installId, m.cell, m.episodeId, m.kind),
        m.installId,
        m.cell,
        m.episodeId,
        m.kind,
        m.channel,
        m.title,
        m.body,
        m.decisionTimeMs,
        nowMs,
      );
    }
    return n;
  }

  nextDueMs(): number | null {
    const r = this.sql.exec<{ t: number | null }>('SELECT MIN(next_try_ms) AS t FROM push_queue').toArray()[0];
    return r?.t ?? null;
  }

  due(nowMs: number, limit: number): QueuedMessage[] {
    return this.sql
      .exec<{
        install_id: string;
        cell: string;
        episode_id: string;
        kind: string;
        channel: string;
        title: string;
        body: string;
        decision_ms: number;
        attempts: number;
        next_try_ms: number;
      }>('SELECT * FROM push_queue WHERE next_try_ms <= ? ORDER BY next_try_ms, k LIMIT ?', nowMs, limit)
      .toArray()
      .map((r) => {
        const kind = r.kind === 'RESTORED' ? 'RESTORED' : 'CONFIRMED';
        return {
          installId: r.install_id,
          cell: r.cell,
          episodeId: r.episode_id,
          kind,
          channel: r.channel === 'alerts-quiet' ? 'alerts-quiet' : 'alerts',
          title: r.title,
          body: r.body,
          data: { cell: r.cell, episodeId: r.episode_id, kind },
          decisionTimeMs: r.decision_ms,
          attempts: r.attempts,
          nextTryMs: r.next_try_ms,
        };
      });
  }

  token(installId: string, cell: string): string | undefined {
    return this.sql
      .exec<{ fcm_token: string }>(
        'SELECT fcm_token FROM subscription WHERE install_id = ? AND cell = ?',
        installId,
        cell,
      )
      .toArray()[0]?.fcm_token;
  }

  private key = (m: QueuedMessage) => sentKey(m.installId, m.cell, m.episodeId, m.kind);

  markSent(m: QueuedMessage, nowMs: number, name: string | null): void {
    this.run('INSERT OR REPLACE INTO push_sent VALUES (?, ?, ?, ?)', this.key(m), m.installId, nowMs, name);
    this.run('DELETE FROM push_queue WHERE k = ?', this.key(m));
  }

  reschedule(m: QueuedMessage, atMs: number, failed: boolean): void {
    this.run(
      'UPDATE push_queue SET next_try_ms = ?, attempts = attempts + ? WHERE k = ?',
      atMs,
      failed ? 1 : 0,
      this.key(m),
    );
  }

  drop(m: QueuedMessage): void {
    this.run('DELETE FROM push_queue WHERE k = ?', this.key(m));
  }

  removeSubscription(installId: string, cell: string): void {
    this.removeSubscriptionRows(installId, cell); // R8.2
  }

  deleteInstall(installId: string): number {
    return (
      this.run('DELETE FROM subscription WHERE install_id = ?', installId) +
      this.run('DELETE FROM push_queue WHERE install_id = ?', installId) +
      this.run('DELETE FROM push_sent WHERE install_id = ?', installId)
    );
  }

  prune(beforeMs: number): number {
    return this.run('DELETE FROM push_sent WHERE sent_ms < ?', beforeMs);
  }
}
