// Telemetry store logic (field-telemetry task 5). Pure over a store interface so Vitest runs it without the Workers runtime.
// Holds device-day aggregates (one row per install and day), outage records and miss records (counts only).
import {
  assignAliases,
  type DeviceDay,
  type FieldDump,
  type FieldRecord,
  type MissRecordOut,
  type OutageRecordOut,
} from '@outage/shared';

const DAY_MS = 86_400_000;

export interface StoredDay {
  day: DeviceDay;
}

export interface TelemetryStore {
  /** Replace the row for (installId, day). Returns rows written (0 when the same JSON is already there). */
  putDay(d: DeviceDay, receivedMs: number): number;
  daysOn(day: string): DeviceDay[];
  /** Newest device-day per install with `from <= day < before`, as (installId, maker, androidMajor, lastDay). */
  latestBefore(from: string, before: string): { installId: string; maker: DeviceDay['maker']; androidMajor: number; lastDay: string }[];
  putOutage(r: OutageRecordOut, nowMs: number): number;
  outagesStarting(fromMs: number, toMs: number): OutageRecordOut[];
  putMiss(m: MissRecordOut, nowMs: number): number;
  missesIn(fromMs: number, toMs: number): MissRecordOut[];
  deleteInstall(installId: string): number;
  /** Remove rows older than `beforeMs` (received for days, start/at time for records). Returns rows removed. */
  prune(beforeMs: number): number;
  count(): number;
}

export const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** UTC midnight of a `YYYY-MM-DD` string, or null when it is not a real date. */
export function dayStartMs(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === day ? ms : null;
}

const dayString = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The local day of an upload must be near the server's day: not older than the retention window (it would be pruned at
 * once) and not more than one day ahead (phones are up to 14 hours ahead of UTC).
 */
export function dayAcceptable(day: string, nowMs: number, retentionMs: number): boolean {
  const start = dayStartMs(day);
  return start !== null && start >= nowMs - retentionMs && start <= nowMs + DAY_MS;
}

/** Idempotent upload (R2.5, R3.1): the last upload for (install, day) wins. */
export function uploadDay(store: TelemetryStore, d: DeviceDay, nowMs: number): void {
  store.putDay(d, nowMs);
}

export function recordFieldRecords(store: TelemetryStore, records: readonly FieldRecord[], nowMs: number): number {
  let rows = 0;
  for (const r of records) rows += r.kind === 'OUTAGE_RECORD' ? store.putOutage(r, nowMs) : store.putMiss(r, nowMs);
  return rows;
}

/**
 * The admin answer for one UTC day (design section 4). Install IDs become per-request aliases, assigned over every device
 * in the answer in sorted install-ID order. Outages are listed by the day they started, misses by the day of the unplug.
 */
export function fieldDump(store: TelemetryStore, day: string, lookbackDays: number): FieldDump | null {
  const start = dayStartMs(day);
  if (start === null) return null;
  const days = store.daysOn(day);
  const onDay = new Set(days.map((d) => d.installId));
  const silent = store
    .latestBefore(dayString(start - lookbackDays * DAY_MS), day)
    .filter((s) => !onDay.has(s.installId));
  const alias = assignAliases([...days.map((d) => d.installId), ...silent.map((s) => s.installId)]);
  const a = (id: string) => alias.get(id) as string;
  return {
    v: 1,
    day,
    devices: days
      .slice()
      .sort((x, y) => (x.installId < y.installId ? -1 : 1))
      .map(({ installId, ...rest }) => ({ alias: a(installId), ...rest })),
    silent: silent
      .slice()
      .sort((x, y) => (x.installId < y.installId ? -1 : 1))
      .map((s) => ({ alias: a(s.installId), maker: s.maker, androidMajor: s.androidMajor, lastDay: s.lastDay })),
    outages: store.outagesStarting(start, start + DAY_MS).sort((x, y) => x.startMs - y.startMs || (x.key < y.key ? -1 : 1)),
    misses: store.missesIn(start, start + DAY_MS).sort((x, y) => x.atMs - y.atMs || x.armedN - y.armedN),
  };
}
