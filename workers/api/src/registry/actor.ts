// Registry: one Durable Object holding the revocation set (hashed install ids, 30-day lifetime) and the daily usage
// counters (rows written, counts by result code and event type). Nothing here is personal data. See ADR 0003 addendum.
import { DurableObject } from 'cloudflare:workers';
import { dayOf } from '../ingest/budget.ts';
import { CONFIG } from '../config.ts';
import type { Env } from '../env.ts';
import { mergeCounters } from './revocation.ts';
import type { UsageReport } from '../area/core.ts';

const KEEP_DAYS = 7;

export class RegistryActor extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS revoked (hash TEXT PRIMARY KEY, expires_ms INTEGER NOT NULL) WITHOUT ROWID');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS usage (day INTEGER PRIMARY KEY, rows INTEGER NOT NULL, counters TEXT NOT NULL)');
  }

  /** ADR 0003 addendum: hash only, expires after REVOCATION_TTL_MS. */
  async revoke(hash: string, nowMs: number): Promise<void> {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO revoked VALUES (?, ?)', hash, nowMs + CONFIG.REVOCATION_TTL_MS);
    await this.ensureAlarm(nowMs);
  }

  async revokedHashes(nowMs: number): Promise<string[]> {
    return this.ctx.storage.sql.exec<{ hash: string }>('SELECT hash FROM revoked WHERE expires_ms > ?', nowMs).toArray().map((r) => r.hash);
  }

  /** One row written per report. Returns today's total rows written, which the actors use to decide shedding. */
  async report(r: UsageReport): Promise<number> {
    const sql = this.ctx.storage.sql;
    const row = sql.exec<{ rows: number; counters: string }>('SELECT rows, counters FROM usage WHERE day = ?', r.day).toArray()[0];
    const rows = (row?.rows ?? 0) + r.rows + 1; // +1: this upsert
    const counters = mergeCounters(row ? (JSON.parse(row.counters) as Record<string, number>) : {}, r.counters);
    sql.exec('INSERT OR REPLACE INTO usage VALUES (?, ?, ?)', r.day, rows, JSON.stringify(counters));
    await this.ensureAlarm(Date.now());
    return rows;
  }

  async stats(nowMs: number): Promise<{ day: number; rowsWritten: number; counters: Record<string, number> }> {
    const day = dayOf(nowMs);
    const row = this.ctx.storage.sql.exec<{ rows: number; counters: string }>('SELECT rows, counters FROM usage WHERE day = ?', day).toArray()[0];
    return { day, rowsWritten: row?.rows ?? 0, counters: row ? (JSON.parse(row.counters) as Record<string, number>) : {} };
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM revoked WHERE expires_ms <= ?', now);
    this.ctx.storage.sql.exec('DELETE FROM usage WHERE day < ?', dayOf(now) - KEEP_DAYS);
    const left = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM revoked').toArray()[0]?.n ?? 0;
    if (left > 0) await this.ctx.storage.setAlarm(now + 86_400_000); // usage rows are tidied whenever the alarm next runs
  }

  private async ensureAlarm(nowMs: number): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nowMs + 86_400_000);
  }
}
