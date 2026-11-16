// Forwarding a watched station's events from its area actor to its pairing shard (ADR 0036). The area actor keeps a small
// list of installs to watch (install id and shard name, no cell). SQL API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import type { AreaEvent, AreaResult } from '../area/core.ts';
import type { ForwardedEvent } from './core.ts';

/** The events to forward, per watched install: only the ones this actor accepted (a duplicate was forwarded the first time). Pure. */
export function forwardable(
  watched: ReadonlyMap<string, string>,
  events: readonly AreaEvent[],
  results: readonly AreaResult[],
): Map<string, ForwardedEvent[]> {
  const out = new Map<string, ForwardedEvent[]>();
  if (watched.size === 0) return out;
  events.forEach((ev, i) => {
    if (!watched.has(ev.installId) || results[i]?.status !== 'accepted' || ev.type === 'LABEL') return;
    const list = out.get(ev.installId) ?? [];
    list.push({ type: ev.type, eventTimeMs: ev.eventTimeMs, reason: ev.reason ?? null });
    out.set(ev.installId, list);
  });
  return out;
}

/** Installs this actor forwards, install id to shard name. Memory copy of one small table. */
export class WatchList {
  private readonly shards = new Map<string, string>();

  constructor(private readonly sql: SqlStorage) {
    sql.exec('CREATE TABLE IF NOT EXISTS home_watch (install_id TEXT PRIMARY KEY, shard TEXT NOT NULL) WITHOUT ROWID');
    for (const r of sql.exec<{ install_id: string; shard: string }>('SELECT install_id, shard FROM home_watch').toArray()) {
      this.shards.set(r.install_id, r.shard);
    }
  }

  get map(): ReadonlyMap<string, string> {
    return this.shards;
  }

  add(installId: string, shard: string): void {
    if (this.shards.get(installId) === shard) return;
    this.shards.set(installId, shard);
    this.sql.exec('INSERT OR REPLACE INTO home_watch VALUES (?, ?)', installId, shard).toArray();
  }

  remove(installId: string): void {
    if (!this.shards.delete(installId)) return;
    this.sql.exec('DELETE FROM home_watch WHERE install_id = ?', installId).toArray();
  }
}
