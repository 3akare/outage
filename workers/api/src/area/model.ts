// Area model (area-cells task 10): the stateful wrapper around the pure reducer that the Durable Object shell holds.
// It keeps the reducer state in memory, collects what the shell must send (notices, removals, pushes), and writes the
// state behind as rows (design section 10, R13.3): one row per changed part, unchanged parts are never rewritten.
// No Cloudflare imports: the SQL store is in area-store.ts, a memory store in the tests.
import { DEFAULT_PARAMS, type EngineState } from '@outage/detection';
import type { DetectionPort, IngestedItem } from '../ports.ts';
import type { RemovalRequest } from './members.ts';
import type { Notice, NoticeBatch } from './neighbors.ts';
import type { PassedPush } from './pushes.ts';
import {
  type AreaConfig,
  type AreaInput,
  type AreaState,
  emptyAreaState,
  type PublishBatch,
  reduce,
  type ScopeEngine,
  type ScopeView,
} from './reducer.ts';

/** Engine states are split by install into this many rows, so one busy install does not rewrite the whole scope (R16.4). */
export const ENGINE_BUCKETS = 16;

/** One stored row. `table` is 'engine' (key = scope key, part = 'h' or 'b<n>') or 'model' (key = field, part = ''). */
export interface ModelRow {
  table: 'engine' | 'model';
  key: string;
  part: string;
  json: string;
}
export interface ModelStore {
  loadRows(): ModelRow[];
  /** Writes and deletes in one transaction. Returns rows written. */
  writeRows(put: readonly ModelRow[], del: readonly Omit<ModelRow, 'json'>[]): number;
}

export interface Outbox {
  notices: NoticeBatch[];
  removals: RemovalRequest[];
  pushes: PassedPush[];
  publish: PublishBatch;
}
const emptyOutbox = (): Outbox => ({ notices: [], removals: [], pushes: [], publish: { put: [], remove: [] } });

const rowId = (r: Omit<ModelRow, 'json'>): string => `${r.table}\u0000${r.key}\u0000${r.part}`;

/** Small stable string hash (FNV-1a), only to spread installs over buckets. */
function bucketOf(installId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < installId.length; i++) {
    h ^= installId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % ENGINE_BUCKETS;
}

const MODEL_FIELDS = Object.keys(emptyAreaState('')).filter((k) => k !== 'engines') as (keyof AreaState)[];

/** The rows that represent a state. Pure; the inverse is `fromRows`. */
export function toRows(s: AreaState): ModelRow[] {
  const rows: ModelRow[] = [];
  for (const f of MODEL_FIELDS) rows.push({ table: 'model', key: f, part: '', json: JSON.stringify(s[f]) });
  for (const [key, eng] of Object.entries(s.engines)) {
    const { installs, ...rest } = eng.state;
    rows.push({
      table: 'engine',
      key,
      part: 'h',
      json: JSON.stringify({ kind: eng.kind, cells: eng.cells, ctx: eng.ctx, state: rest }),
    });
    const buckets: Record<string, EngineState['installs']> = {};
    for (const [id, part] of Object.entries(installs)) {
      const b = `b${bucketOf(id)}`;
      buckets[b] ??= {};
      buckets[b][id] = part;
    }
    for (const [b, inst] of Object.entries(buckets))
      rows.push({ table: 'engine', key, part: b, json: JSON.stringify(inst) });
  }
  return rows;
}

export function fromRows(parent: string, rows: readonly ModelRow[]): AreaState {
  const s: AreaState = emptyAreaState(parent);
  const rec = s as unknown as Record<string, unknown>;
  const heads = new Map<
    string,
    { kind: ScopeEngine['kind']; cells: string[]; ctx?: string; state: Omit<EngineState, 'installs'> }
  >();
  const installs = new Map<string, EngineState['installs']>();
  for (const r of rows) {
    if (r.table === 'model') {
      if ((MODEL_FIELDS as string[]).includes(r.key)) rec[r.key] = JSON.parse(r.json);
    } else if (r.part === 'h') heads.set(r.key, JSON.parse(r.json));
    else installs.set(r.key, { ...(installs.get(r.key) ?? {}), ...JSON.parse(r.json) });
  }
  for (const [key, h] of heads) {
    s.engines[key] = {
      kind: h.kind,
      cells: h.cells,
      ctx: h.ctx,
      state: { ...h.state, installs: installs.get(key) ?? {} },
    };
  }
  s.parent = parent;
  return s;
}

export class AreaModel implements DetectionPort {
  private state: AreaState;
  private written = new Map<string, string>(); // row id -> json last written
  private dirtySinceMs: number | null = null;
  private outbox: Outbox = emptyOutbox();
  private nextAlarmMs: number | null = null;
  private lastViews: ScopeView[] = [];

  constructor(
    private readonly parent: string,
    private readonly store: ModelStore,
    private readonly cfg: AreaConfig,
  ) {
    const rows = store.loadRows();
    for (const r of rows) this.written.set(rowId(r), r.json);
    this.state = fromRows(parent, rows);
  }

  /** DetectionPort: called by AreaCore with the accepted, new events of one request (R11.1, R11.2). */
  handle(parent: string, items: IngestedItem[], receiveTimeMs: number): void {
    if (parent !== this.parent) return;
    this.apply({ type: 'EVENTS', nowMs: receiveTimeMs, items });
  }

  tick(nowMs: number): void {
    this.apply({ type: 'TICK', nowMs });
  }

  receiveNotices(notices: readonly Notice[], nowMs: number): void {
    this.apply({ type: 'NOTICES', nowMs, notices });
  }

  removeMember(request: RemovalRequest, nowMs: number): void {
    this.apply({ type: 'REMOVE', nowMs, request });
  }

  /** Delete my data (R12.1). Written at once, not behind: the caller flushes right after. */
  deleteInstall(installId: string, nowMs: number): void {
    this.apply({ type: 'DELETE', nowMs, installId });
  }

  /** True when this actor holds nothing yet: a NORMAL-only notice must not create it (design section 7, R13.1). */
  isEmpty(): boolean {
    return Object.keys(this.state.members).length === 0 && Object.keys(this.state.engines).length === 0;
  }

  /** A publish that failed goes back to the outbox; the newest put or remove per scope wins (R8.2). */
  requeuePublish(batch: PublishBatch): void {
    this.outbox.publish = mergePublish(batch, this.outbox.publish);
  }

  drainOutbox(): Outbox {
    const o = this.outbox;
    this.outbox = emptyOutbox();
    return o;
  }

  /** Earliest time the alarm must run: a reducer TICK (R11.5) or a write-behind flush (R13.3). */
  alarmDueMs(flushMs: number): number | null {
    const times = [this.nextAlarmMs, this.dirtySinceMs === null ? null : this.dirtySinceMs + flushMs].filter(
      (t): t is number => t !== null,
    );
    return times.length === 0 ? null : Math.min(...times);
  }

  /** When the reducer needs a TICK (flush of queued state events, or an open outage reaching 12 hours). */
  tickDueMs(): number | null {
    return this.nextAlarmMs;
  }

  /** Write changed rows and delete vanished ones. Returns rows written. */
  flush(): number {
    const rows = toRows(this.state);
    const now = new Map(rows.map((r) => [rowId(r), r]));
    const put = rows.filter((r) => this.written.get(rowId(r)) !== r.json);
    const del: Omit<ModelRow, 'json'>[] = [];
    for (const id of this.written.keys()) {
      if (now.has(id)) continue;
      const [table, key, part] = id.split('\u0000');
      del.push({ table: table as ModelRow['table'], key, part });
    }
    this.dirtySinceMs = null;
    if (put.length === 0 && del.length === 0) return 0;
    const n = this.store.writeRows(put, del);
    for (const d of del) this.written.delete(rowId(d));
    for (const r of put) this.written.set(rowId(r), r.json);
    return n;
  }

  views(): ScopeView[] {
    return this.lastViews;
  }

  counters(): Record<string, number> {
    return { ...this.state.counters };
  }

  /** For tests: the current reducer state. */
  snapshot(): AreaState {
    return this.state;
  }

  private apply(input: AreaInput): void {
    const { state, out } = reduce(this.state, input, this.cfg);
    this.state = state;
    this.outbox.notices.push(...out.notices);
    this.outbox.removals.push(...out.removals);
    this.outbox.pushes.push(...out.pushes);
    this.outbox.publish = mergePublish(this.outbox.publish, out.publish);
    this.nextAlarmMs = out.nextAlarmMs;
    this.lastViews = out.views;
    this.dirtySinceMs ??= input.nowMs;
  }
}

/** `later` wins over `earlier` per scope key. */
export function mergePublish(earlier: PublishBatch, later: PublishBatch): PublishBatch {
  const ops = new Map<string, PublishBatch['put'][number] | null>();
  for (const p of earlier.put) ops.set(p.scopeKey, p);
  for (const k of earlier.remove) ops.set(k, null);
  for (const p of later.put) ops.set(p.scopeKey, p);
  for (const k of later.remove) ops.set(k, null);
  const out: PublishBatch = { put: [], remove: [] };
  for (const [k, v] of [...ops].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (v) out.put.push(v);
    else out.remove.push(k);
  }
  return out;
}

/** Reducer config for a parent. `neighbors` is precomputed by the shell (h3-js is loaded lazily, R13.4). */
export function areaConfig(
  neighbors: ReadonlyMap<string, readonly string[]>,
  childrenOf: (parent: string) => readonly string[],
  parentOf: (cell: string) => string,
  stateFlushMs: number,
): AreaConfig {
  return {
    params: DEFAULT_PARAMS,
    stateFlushMs,
    deferStateOnly: true,
    neighborsOf: (c) => neighbors.get(c) ?? [],
    childrenOf,
    parentOf,
  };
}
