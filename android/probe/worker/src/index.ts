// Throwaway probe Worker (feasibility-probe R3, task 4). One SQLite-backed Durable Object holds raw rows.
// SQL API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import { DurableObject } from 'cloudflare:workers';
import { type Device, type Export, handle, type Row, type Store } from './handler';

export interface Env {
  PROBE_STORE: DurableObjectNamespace<ProbeStore>;
  PROBE_TOKEN?: string; // Wrangler secret set by the human: wrangler secret put PROBE_TOKEN
}

export class ProbeStore extends DurableObject<Env> implements Store {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS device (alias TEXT PRIMARY KEY, maker TEXT, brand TEXT, android_sdk INTEGER)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS row (alias TEXT NOT NULL, id INTEGER NOT NULL, kind TEXT NOT NULL, mono_ms REAL NOT NULL,
      wall_ms REAL NOT NULL, boot_count INTEGER NOT NULL, fields TEXT NOT NULL, PRIMARY KEY (alias, id))`);
  }

  async insert(device: Device, rows: Row[]): Promise<{ accepted: number; duplicates: number }> {
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT OR REPLACE INTO device VALUES (?, ?, ?, ?)', device.alias, device.maker, device.brand, device.androidSdk);
    let accepted = 0;
    for (const r of rows) {
      const c = sql.exec('INSERT OR IGNORE INTO row VALUES (?, ?, ?, ?, ?, ?, ?)', device.alias, r.id, r.kind, r.monoMs, r.wallMs, r.bootCount, JSON.stringify(r.fields));
      accepted += c.rowsWritten > 0 ? 1 : 0;
    }
    return { accepted, duplicates: rows.length - accepted };
  }

  async exportAll(): Promise<Export> {
    const sql = this.ctx.storage.sql;
    const devices = sql.exec<{ alias: string; maker: string; brand: string; android_sdk: number }>('SELECT * FROM device ORDER BY alias').toArray();
    return {
      version: 1,
      devices: devices.map((d) => ({
        device: { alias: d.alias, maker: d.maker, brand: d.brand, androidSdk: d.android_sdk },
        rows: sql
          .exec<{ id: number; kind: string; mono_ms: number; wall_ms: number; boot_count: number; fields: string }>('SELECT id, kind, mono_ms, wall_ms, boot_count, fields FROM row WHERE alias = ? ORDER BY id', d.alias)
          .toArray()
          .map((r) => ({ id: r.id, kind: r.kind, monoMs: r.mono_ms, wallMs: r.wall_ms, bootCount: r.boot_count, fields: JSON.parse(r.fields) })),
      })),
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = env.PROBE_STORE.get(env.PROBE_STORE.idFromName('probe'));
    return handle(request, store, env.PROBE_TOKEN);
  },
} satisfies ExportedHandler<Env>;
