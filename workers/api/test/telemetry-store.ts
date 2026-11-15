// In-memory TelemetryStore for tests: same contract as SqlTelemetryStore (src/telemetry/actor.ts).
import type { DeviceDay, MissRecordOut, OutageRecordOut } from '@outage/shared';
import type { TelemetryStore } from '../src/telemetry/core.ts';

export class MemoryTelemetryStore implements TelemetryStore {
  days = new Map<string, { json: string; receivedMs: number }>();
  outages = new Map<string, OutageRecordOut>();
  misses = new Map<string, MissRecordOut>();
  putDay(d: DeviceDay, receivedMs: number) {
    const k = `${d.installId}|${d.day}`;
    const json = JSON.stringify(d);
    if (this.days.get(k)?.json === json) return 0;
    this.days.set(k, { json, receivedMs });
    return 1;
  }
  all(): DeviceDay[] {
    return [...this.days.values()].map((r) => JSON.parse(r.json) as DeviceDay);
  }
  daysOn(day: string) {
    return this.all().filter((d) => d.day === day);
  }
  latestBefore(from: string, before: string) {
    const best = new Map<string, DeviceDay>();
    for (const d of this.all()) {
      if (d.day < from || d.day >= before) continue;
      const cur = best.get(d.installId);
      if (!cur || d.day > cur.day) best.set(d.installId, d);
    }
    return [...best.values()].map((d) => ({ installId: d.installId, maker: d.maker, androidMajor: d.androidMajor, lastDay: d.day }));
  }
  putOutage(r: OutageRecordOut) {
    this.outages.set(r.key, r);
    return 1;
  }
  outagesStarting(fromMs: number, toMs: number) {
    return [...this.outages.values()].filter((r) => r.startMs >= fromMs && r.startMs < toMs);
  }
  putMiss(m: MissRecordOut) {
    this.misses.set(`${m.atMs}|${m.armedN}`, m);
    return 1;
  }
  missesIn(fromMs: number, toMs: number) {
    return [...this.misses.values()].filter((m) => m.atMs >= fromMs && m.atMs < toMs);
  }
  deleteInstall(installId: string) {
    let n = 0;
    for (const k of [...this.days.keys()]) if (k.startsWith(`${installId}|`)) n += this.days.delete(k) ? 1 : 0;
    return n;
  }
  prune(beforeMs: number) {
    let n = 0;
    for (const [k, r] of this.days) if (r.receivedMs < beforeMs) n += this.days.delete(k) ? 1 : 0;
    for (const [k, r] of this.outages) if (r.startMs < beforeMs) n += this.outages.delete(k) ? 1 : 0;
    for (const [k, m] of this.misses) if (m.atMs < beforeMs) n += this.misses.delete(k) ? 1 : 0;
    return n;
  }
  count() {
    return this.days.size + this.outages.size + this.misses.size;
  }
}
