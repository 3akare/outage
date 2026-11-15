// PublicIndex actor (web-and-area-pages task 7, ADR 0010): one SQLite-backed Durable Object holding the latest public
// scope views. Written by area actors on change only; read by page requests behind a 30-second cache (R9.3).
// SQLite storage API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env.ts';
import { applyBatch, type IndexBatch, type IndexSnapshot, type IndexStore, snapshot } from './core.ts';

class SqlIndexStore implements IndexStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS public_view (
      scope_key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_ms INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec('CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL) WITHOUT ROWID');
  }
  all() {
    return this.sql
      .exec<{ scope_key: string; json: string }>('SELECT scope_key, json FROM public_view')
      .toArray()
      .map((r) => ({ scopeKey: r.scope_key, json: r.json }));
  }
  get(scopeKey: string): string | undefined {
    return this.sql.exec<{ json: string }>('SELECT json FROM public_view WHERE scope_key = ?', scopeKey).toArray()[0]
      ?.json;
  }
  put(scopeKey: string, json: string, nowMs: number): void {
    this.sql.exec('INSERT OR REPLACE INTO public_view VALUES (?, ?, ?)', scopeKey, json, nowMs);
  }
  delete(scopeKey: string): void {
    this.sql.exec('DELETE FROM public_view WHERE scope_key = ?', scopeKey);
  }
  version(): number {
    return (
      this.sql.exec<{ value: number }>("SELECT value FROM index_meta WHERE key = 'version'").toArray()[0]?.value ?? 0
    );
  }
  setVersion(v: number): void {
    this.sql.exec("INSERT OR REPLACE INTO index_meta VALUES ('version', ?)", v);
  }
}

export class PublicIndex extends DurableObject<Env> {
  private readonly store: SqlIndexStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlIndexStore(ctx.storage.sql);
  }

  /** Publisher hook: puts and tombstones from one area actor (R8.2). */
  async apply(batch: IndexBatch): Promise<{ changed: number; rejected: number }> {
    return applyBatch(this.store, batch, Date.now());
  }

  /** Reader: all views, for page renders (R8.1). */
  async getAll(): Promise<IndexSnapshot> {
    return snapshot(this.store);
  }
}
