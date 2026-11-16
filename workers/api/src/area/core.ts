// Area actor core (event-ingest tasks 5 and 7): idempotency, rate limit, write-behind armed state, budget shedding.
// Plain TypeScript with no runtime imports. The Durable Object class (area-actor.ts) is a thin shell around it.
import { admit, type Bucket, type Kind, newBucket } from '../ingest/bucket.ts';
import { applyStateEvent, type InstallState, needsWrite, touchSeen } from '../ingest/armed.ts';
import { bump, type Counters, dayOf, shouldShed } from '../ingest/budget.ts';
import type { Tunables } from '../config.ts';
import type { DetectionPort, IngestedItem } from '../ingest/ports.ts';
import { SeqWindow } from '../ingest/seqwindow.ts';
import { HEARTBEAT_ON_BATTERY, isStateType, type EventType, type RejectCode } from '@outage/shared';

/** home-watch R3.2, R3.3: a DISARMED with this reason is proof of life only. It never changes the armed flag and never reaches the engine. */
export const isBatteryHeartbeat = (ev: Pick<AreaEvent, 'type' | 'reason'>): boolean =>
  ev.type === 'DISARMED' && ev.reason === HEARTBEAT_ON_BATTERY;

/** One validated event for this actor, as the Worker hands it over. */
export interface AreaEvent {
  installId: string;
  seq: number;
  type: EventType;
  cell: string;
  eventTimeMs: number;
  confidence: 'HIGH' | 'LOW';
  schedulingDelayMs: number | null;
  refSeq?: number;
  answer?: 'YES' | 'NO';
  /** Only `HEARTBEAT_ON_BATTERY` is carried (home-watch R3). Every other reason stays at the Worker edge. */
  reason?: string;
}
export interface AreaIngestInput {
  parent: string;
  receiveTimeMs: number;
  events: AreaEvent[];
}
export interface AreaResult {
  status: 'accepted' | 'duplicate' | 'rejected';
  code?: RejectCode;
}
export interface AreaResponse {
  results: AreaResult[]; // aligned with input events
  retryAfterMs?: number;
}

export interface DetectionRow {
  installId: string;
  seq: number;
  type: string;
  cell: string;
  eventTimeMs: number;
  receiveTimeMs: number;
  confidence: string;
  schedulingDelayMs: number | null;
  refSeq: number | null;
  answer: string | null;
}

/** Storage seen by the core. The SQL implementation is in area-store.ts, a memory one in the tests. Writes return rows written. */
export interface AreaStore {
  hasDetection(installId: string, seq: number): boolean;
  insertDetection(row: DetectionRow): number;
  getInstall(installId: string): InstallState | undefined;
  putInstall(installId: string, state: InstallState): number;
  deleteInstall(installId: string): number;
  prune(beforeMs: number): number;
  getMeta(key: string): string | undefined;
  setMeta(key: string, value: string): number;
}

export interface UsageReport {
  day: number;
  rows: number;
  counters: Counters;
}

const PRUNE_EVERY_MS = 86_400_000; // deletes count as rows written, so the retention job runs once a day (design section 7)

interface Tracked {
  mem: InstallState;
  stored: InstallState | undefined;
}

export class AreaCore {
  private readonly installs = new Map<string, Tracked>();
  private readonly buckets = new Map<string, Bucket>();
  private readonly windows = new Map<string, SeqWindow>();
  private readonly dirty = new Set<string>();
  private dirtySinceMs: number | null = null;
  private pendingSinceMs: number | null = null; // first unreported usage; the shell reports it with the flush
  private pendingRows = 0;
  private pendingCounters: Counters = {};
  private globalDay = -1;
  private globalRows = 0;

  constructor(
    private readonly store: AreaStore,
    private readonly port: DetectionPort,
    private readonly cfg: Tunables,
  ) {}

  // ---- ingest -------------------------------------------------------------------------------------------------

  async ingest(input: AreaIngestInput): Promise<AreaResponse> {
    const { events, receiveTimeMs, parent } = input;
    const results: AreaResult[] = new Array(events.length);
    const firstOf = new Map<string, number>();
    const repeats: [number, number][] = [];
    let fresh: number[] = [];
    bump(this.pendingCounters, 'rpc');
    this.pendingSinceMs ??= receiveTimeMs;

    // 1. Idempotency (R5). A repeat inside the batch takes its first copy's final answer (step 5).
    events.forEach((ev, i) => {
      const key = `${ev.installId}|${ev.seq}`;
      const first = firstOf.get(key);
      if (first !== undefined) {
        repeats.push([i, first]);
        return;
      }
      firstOf.set(key, i);
      const dup = isStateType(ev.type) ? this.window(ev.installId).has(ev.seq) : this.store.hasDetection(ev.installId, ev.seq);
      if (dup) results[i] = { status: 'duplicate' };
      else fresh.push(i);
    });

    // 2. Daily budget: past the shed fraction, state events go first, detection events stay (R11.5).
    let retryAfterMs = 0;
    if (shouldShed(this.rowsToday(receiveTimeMs), this.cfg.DAILY_ROW_LIMIT, this.cfg.WRITE_BUDGET_SHED_FRACTION)) {
      fresh = fresh.filter((i) => {
        if (!isStateType(events[i].type)) return true;
        results[i] = { status: 'rejected', code: 'RATE_LIMITED' };
        bump(this.pendingCounters, 'shed');
        retryAfterMs = Math.max(retryAfterMs, this.cfg.STATE_FLUSH_MS);
        return false;
      });
    }

    // 3. Token bucket per install, detection first (R6, I4).
    const byInstall = new Map<string, number[]>();
    for (const i of fresh) {
      const id = events[i].installId;
      byInstall.set(id, [...(byInstall.get(id) ?? []), i]);
    }
    const admittedIdx: number[] = [];
    for (const [id, idxs] of byInstall) {
      const kinds: Kind[] = idxs.map((i) => (isStateType(events[i].type) ? 'state' : 'detection'));
      const bucket = this.buckets.get(id) ?? newBucket(this.cfg.BUCKET_CAPACITY, receiveTimeMs);
      const a = admit(bucket, receiveTimeMs, kinds, this.cfg.BUCKET_CAPACITY, this.cfg.BUCKET_REFILL_MS);
      this.buckets.set(id, a.bucket);
      retryAfterMs = Math.max(retryAfterMs, a.retryAfterMs);
      idxs.forEach((i, k) => {
        if (a.admitted[k]) admittedIdx.push(i);
        else results[i] = { status: 'rejected', code: 'RATE_LIMITED' };
      });
    }
    admittedIdx.sort((x, y) => x - y);

    // 4. Apply: detection events are written through, state events go to memory (R11.1).
    const items: IngestedItem[] = [];
    for (const i of admittedIdx) {
      const ev = events[i];
      if (isBatteryHeartbeat(ev)) {
        this.window(ev.installId).add(ev.seq);
        const t = this.installs.get(ev.installId) ?? this.load(ev.installId);
        if (t) {
          t.mem = touchSeen(t.mem, receiveTimeMs) ?? t.mem;
          this.markDirty(ev.installId, receiveTimeMs);
        }
        results[i] = { status: 'accepted' };
        bump(this.pendingCounters, `type.${ev.type}`);
        continue; // not an armed change, nothing for the engine
      }
      if (isStateType(ev.type)) {
        this.window(ev.installId).add(ev.seq);
        const t = this.installs.get(ev.installId) ?? this.load(ev.installId);
        const mem = applyStateEvent(t?.mem, ev.type, ev.eventTimeMs, receiveTimeMs);
        if (t) t.mem = mem;
        else this.installs.set(ev.installId, { mem, stored: undefined });
        this.markDirty(ev.installId, receiveTimeMs);
      } else {
        this.pendingRows += this.store.insertDetection({
          installId: ev.installId,
          seq: ev.seq,
          type: ev.type,
          cell: ev.cell,
          eventTimeMs: ev.eventTimeMs,
          receiveTimeMs,
          confidence: ev.confidence,
          schedulingDelayMs: ev.schedulingDelayMs,
          refSeq: ev.type === 'LABEL' ? (ev.refSeq ?? null) : null,
          answer: ev.type === 'LABEL' ? (ev.answer ?? null) : null,
        });
        const t = this.installs.get(ev.installId) ?? this.load(ev.installId);
        if (t) {
          t.mem = touchSeen(t.mem, receiveTimeMs) ?? t.mem;
          this.markDirty(ev.installId, receiveTimeMs);
        }
      }
      results[i] = { status: 'accepted' };
      bump(this.pendingCounters, `type.${ev.type}`);
      items.push(toIngested(ev));
    }

    // 5. Repeats inside the batch.
    for (const [i, first] of repeats) {
      const r = results[first];
      results[i] = r.status === 'accepted' ? { status: 'duplicate' } : r;
    }
    for (const r of results) {
      bump(this.pendingCounters, `result.${r.status}`);
      if (r.code) bump(this.pendingCounters, `code.${r.code}`);
    }

    // 6. Hand over to detection. Rows are already written; a failing engine can rebuild from them (area-cells), and
    //    answering "rejected" would make the phone resend something that is now a duplicate and never reach the engine.
    if (items.length > 0) {
      try {
        await this.port.handle(parent, items, receiveTimeMs);
      } catch {
        bump(this.pendingCounters, 'port_error');
      }
    }
    return retryAfterMs > 0 ? { results, retryAfterMs } : { results };
  }

  // ---- write-behind (task 7) ----------------------------------------------------------------------------------

  /** When the shell's alarm should next fire for a flush and a usage report, or null when there is nothing to do. */
  flushDueMs(): number | null {
    const since = [this.dirtySinceMs, this.pendingSinceMs].filter((v): v is number => v !== null);
    return since.length === 0 ? null : Math.min(...since) + this.cfg.STATE_FLUSH_MS;
  }

  /** Write changed armed states in one batch, skipping unchanged ones (R11.2). Returns rows written. */
  flush(): number {
    let rows = 0;
    for (const id of this.dirty) {
      const t = this.installs.get(id);
      if (t && needsWrite(t.mem, t.stored, this.cfg.LAST_SEEN_REFRESH_MS)) {
        rows += this.store.putInstall(id, t.mem);
        t.stored = t.mem;
      }
    }
    this.dirty.clear();
    this.dirtySinceMs = null;
    this.pendingRows += rows;
    return rows;
  }

  /** Armed flag the actor currently believes, memory first. For tests and the delete path. */
  armedState(installId: string): InstallState | undefined {
    return (this.installs.get(installId) ?? this.load(installId))?.mem;
  }

  // ---- retention, delete, budget ----------------------------------------------------------------------------

  /** Next time the retention job is due (R12.3). */
  pruneDueMs(nowMs: number): number {
    const last = Number(this.store.getMeta('last_prune_ms') ?? Number.NaN);
    return Number.isFinite(last) ? last + PRUNE_EVERY_MS : nowMs + PRUNE_EVERY_MS;
  }

  /** Delete rows older than RETENTION_MS. Records the run so the next one is a day later. Returns rows deleted. */
  prune(nowMs: number): number {
    const before = nowMs - this.cfg.RETENTION_MS;
    const deleted = this.store.prune(before);
    this.pendingRows += deleted + this.store.setMeta('last_prune_ms', String(nowMs));
    for (const [id, t] of this.installs) if (t.mem.lastSeenMs < before) this.forget(id);
    return deleted;
  }

  /** Remove everything held for one install: rows and every in-memory trace (R12.1). Returns rows deleted. */
  deleteInstall(installId: string): number {
    this.forget(installId);
    const deleted = this.store.deleteInstall(installId);
    this.pendingRows += deleted;
    return deleted;
  }

  /** Usage since the last report, for the daily counters (R11.4, R13). No install ids, no cells. */
  drainReport(nowMs: number): UsageReport | null {
    const empty = this.pendingRows === 0 && Object.keys(this.pendingCounters).length === 0;
    if (empty) return null;
    const report = { day: dayOf(nowMs), rows: this.pendingRows, counters: this.pendingCounters };
    this.pendingRows = 0;
    this.pendingCounters = {};
    this.pendingSinceMs = null;
    return report;
  }

  /** The registry's total rows written today, returned when a report was filed. Drives shedding. */
  setGlobalRows(day: number, rows: number): void {
    this.globalDay = day;
    this.globalRows = rows;
  }

  rowsToday(nowMs: number): number {
    return (this.globalDay === dayOf(nowMs) ? this.globalRows : 0) + this.pendingRows;
  }

  // ---- internals ----------------------------------------------------------------------------------------------

  private window(installId: string): SeqWindow {
    let w = this.windows.get(installId);
    if (!w) {
      w = new SeqWindow(this.cfg.IDEMPOTENCY_WINDOW);
      this.windows.set(installId, w);
    }
    return w;
  }

  private load(installId: string): Tracked | undefined {
    const stored = this.store.getInstall(installId);
    if (!stored) return undefined;
    const t = { mem: stored, stored };
    this.installs.set(installId, t);
    return t;
  }

  private markDirty(installId: string, nowMs: number): void {
    this.dirty.add(installId);
    if (this.dirtySinceMs === null) this.dirtySinceMs = nowMs;
  }

  private forget(installId: string): void {
    this.installs.delete(installId);
    this.buckets.delete(installId);
    this.windows.delete(installId);
    this.dirty.delete(installId);
    if (this.dirty.size === 0) this.dirtySinceMs = null;
  }
}

function toIngested(ev: AreaEvent): IngestedItem {
  if (ev.type === 'LABEL') {
    return {
      installId: ev.installId,
      seq: ev.seq,
      type: 'LABEL',
      cell: ev.cell,
      eventTimeMs: ev.eventTimeMs,
      refSeq: ev.refSeq ?? 0,
      answer: ev.answer ?? 'NO',
    };
  }
  return {
    installId: ev.installId,
    seq: ev.seq,
    type: ev.type,
    cell: ev.cell,
    eventTimeMs: ev.eventTimeMs,
    confidence: ev.confidence,
    schedulingDelayMs: ev.schedulingDelayMs,
  };
}
