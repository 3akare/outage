// Telemetry actor (field-telemetry task 5, ADR 0011): one SQLite-backed Durable Object with the device-day rows, the outage
// records and the miss records. No event rows (R3.2). Rows are replaced, never appended, so storage stays small.
// SQLite storage API: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
// Alarm API: https://developers.cloudflare.com/durable-objects/api/alarms/
import { DurableObject } from 'cloudflare:workers';
import type { DeviceDay, FieldDump, FieldRecord, MissRecordOut, OutageRecordOut } from '@outage/shared';
import { CONFIG } from '../config.ts';
import type { Env } from '../env.ts';
import { fieldDump, recordFieldRecords, type TelemetryStore, uploadDay } from './core.ts';

const DAY_MS = 86_400_000;

export class SqlTelemetryStore implements TelemetryStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS device_day (
      install_id TEXT NOT NULL, day TEXT NOT NULL, maker TEXT NOT NULL, android_major INTEGER NOT NULL,
      aggregate TEXT NOT NULL, received_ms INTEGER NOT NULL, PRIMARY KEY (install_id, day)) WITHOUT ROWID`);
    sql.exec('CREATE INDEX IF NOT EXISTS device_day_by_day ON device_day (day)');
    sql.exec(`CREATE TABLE IF NOT EXISTS outage_record (
      key TEXT PRIMARY KEY, start_ms INTEGER NOT NULL, json TEXT NOT NULL, updated_ms INTEGER NOT NULL) WITHOUT ROWID`);
    sql.exec('CREATE INDEX IF NOT EXISTS outage_by_start ON outage_record (start_ms)');
    sql.exec(`CREATE TABLE IF NOT EXISTS miss_record (
      at_ms INTEGER NOT NULL, armed_n INTEGER NOT NULL, PRIMARY KEY (at_ms, armed_n)) WITHOUT ROWID`);
  }

  putDay(d: DeviceDay, receivedMs: number): number {
    const json = JSON.stringify(d);
    const cur = this.sql
      .exec<{ aggregate: string }>(
        'SELECT aggregate FROM device_day WHERE install_id = ? AND day = ?',
        d.installId,
        d.day,
      )
      .toArray()[0];
    if (cur?.aggregate === json) return 0; // a repeated upload writes nothing
    this.sql.exec(
      'INSERT OR REPLACE INTO device_day VALUES (?, ?, ?, ?, ?, ?)',
      d.installId,
      d.day,
      d.maker,
      d.androidMajor,
      json,
      receivedMs,
    );
    return 1;
  }

  daysOn(day: string): DeviceDay[] {
    return this.sql
      .exec<{ aggregate: string }>('SELECT aggregate FROM device_day WHERE day = ?', day)
      .toArray()
      .map((r) => JSON.parse(r.aggregate) as DeviceDay);
  }

  latestBefore(from: string, before: string) {
    return this.sql
      .exec<{ install_id: string; maker: DeviceDay['maker']; android_major: number; last_day: string }>(
        `SELECT install_id, maker, android_major, MAX(day) AS last_day FROM device_day
         WHERE day >= ? AND day < ? GROUP BY install_id`,
        from,
        before,
      )
      .toArray()
      .map((r) => ({ installId: r.install_id, maker: r.maker, androidMajor: r.android_major, lastDay: r.last_day }));
  }

  putOutage(r: OutageRecordOut, nowMs: number): number {
    const json = JSON.stringify(r);
    const cur = this.sql.exec<{ json: string }>('SELECT json FROM outage_record WHERE key = ?', r.key).toArray()[0];
    if (cur?.json === json) return 0;
    this.sql.exec('INSERT OR REPLACE INTO outage_record VALUES (?, ?, ?, ?)', r.key, r.startMs, json, nowMs);
    return 1;
  }

  outagesStarting(fromMs: number, toMs: number): OutageRecordOut[] {
    return this.sql
      .exec<{ json: string }>('SELECT json FROM outage_record WHERE start_ms >= ? AND start_ms < ?', fromMs, toMs)
      .toArray()
      .map((r) => JSON.parse(r.json) as OutageRecordOut);
  }

  putMiss(m: MissRecordOut): number {
    // The key is the unplug time and the armed count; two distinct misses in the same millisecond with the same count are rare enough to merge.
    return this.sql.exec('INSERT OR IGNORE INTO miss_record VALUES (?, ?)', m.atMs, m.armedN).rowsWritten;
  }

  missesIn(fromMs: number, toMs: number): MissRecordOut[] {
    return this.sql
      .exec<{ at_ms: number; armed_n: number }>(
        'SELECT at_ms, armed_n FROM miss_record WHERE at_ms >= ? AND at_ms < ?',
        fromMs,
        toMs,
      )
      .toArray()
      .map((r) => ({ kind: 'MISS' as const, atMs: r.at_ms, armedN: r.armed_n }));
  }

  deleteInstall(installId: string): number {
    return this.sql.exec('DELETE FROM device_day WHERE install_id = ?', installId).rowsWritten;
  }

  prune(beforeMs: number): number {
    return (
      this.sql.exec('DELETE FROM device_day WHERE received_ms < ?', beforeMs).rowsWritten +
      this.sql.exec('DELETE FROM outage_record WHERE start_ms < ?', beforeMs).rowsWritten +
      this.sql.exec('DELETE FROM miss_record WHERE at_ms < ?', beforeMs).rowsWritten
    );
  }

  count(): number {
    const n = (t: string) => this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`).toArray()[0]?.n ?? 0;
    return n('device_day') + n('outage_record') + n('miss_record');
  }
}

export class TelemetryActor extends DurableObject<Env> {
  private readonly store: SqlTelemetryStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlTelemetryStore(ctx.storage.sql);
  }

  /** `POST /v1/telemetry`: the Worker has already authenticated and validated. Last upload wins (R2.5). */
  async putDay(d: DeviceDay): Promise<void> {
    uploadDay(this.store, d, Date.now());
    await this.ensureAlarm();
  }

  /** Outage and miss records from the area actors (R5). Idempotent: a repeated record writes nothing. */
  async putRecords(records: FieldRecord[]): Promise<void> {
    recordFieldRecords(this.store, records, Date.now());
    await this.ensureAlarm();
  }

  /** Delete-my-data (R1.4): the install's device-day rows. Outage records hold no install ID. */
  async deleteInstall(installId: string): Promise<number> {
    return this.store.deleteInstall(installId);
  }

  async field(day: string): Promise<FieldDump | null> {
    return fieldDump(this.store, day, CONFIG.TELEMETRY_SILENT_LOOKBACK_DAYS);
  }

  async alarm(): Promise<void> {
    this.store.prune(Date.now() - CONFIG.TELEMETRY_RETENTION_MS); // R1.5: 90 days
    if (this.store.count() > 0) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DAY_MS);
  }
}
