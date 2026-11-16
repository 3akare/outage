// Area actor: one Durable Object per res-7 parent (ADR 0006). A thin shell: storage wiring, alarms and actor-to-actor
// calls. Ingest logic is in AreaCore, area logic in the pure reducer behind AreaModel (area-cells design section 1).
// Alarm API: https://developers.cloudflare.com/durable-objects/api/alarms/
// ctx.id.name (the parent this actor was addressed by): https://developers.cloudflare.com/durable-objects/api/id/#name
// blockConcurrencyWhile in the constructor: https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile
import { DurableObject } from 'cloudflare:workers';
import { childrenOf, type FollowRequest, isParent, neighborsOf, parentOf } from '@outage/shared';
import { AlertsCore } from '../alerts/core.ts';
import { FcmClient } from '../alerts/fcm.ts';
import { toAreaPushes } from '../alerts/hook.ts';
import { runSends } from '../alerts/sender.ts';
import { SqlAlertsStore } from '../alerts/store.ts';
import type { RemovalRequest } from './members.ts';
import { AreaModel, areaConfig } from './model.ts';
import type { Notice } from './neighbors.ts';
import type { ScopeView } from './reducer.ts';
import { AreaCore, type AreaIngestInput, type AreaResponse } from './core.ts';
import { SqlAreaStore, SqlModelStore } from './store.ts';
import { CONFIG, type Tunables } from '../config.ts';
import { type Env, REGISTRY_NAME, TELEMETRY_NAME } from '../env.ts';
import { NoopDetectionPort } from '../ingest/ports.ts';
import { INDEX_NAME } from '../public-index/core.ts';
import { forwardable, WatchList } from '../home/forward.ts';

export class AreaActor extends DurableObject<Env> {
  private core: AreaCore;
  private model: AreaModel | null = null;
  private readonly alerts: AlertsCore;
  private readonly fcm: FcmClient;
  private readonly cfg: Tunables;
  private readonly watch: WatchList;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cfg = tunables(env);
    const store = new SqlAreaStore(ctx.storage.sql);
    this.alerts = new AlertsCore(new SqlAlertsStore(ctx.storage.sql));
    this.watch = new WatchList(ctx.storage.sql);
    // The secret is read only here and passed to the client. It is never logged (R8.4, R11.3).
    this.fcm = new FcmClient({ secret: env.FCM_SERVICE_ACCOUNT, fetch: (input, init) => fetch(input, init), now: () => Date.now() });
    this.core = new AreaCore(store, new NoopDetectionPort(), this.cfg);
    const parent = ctx.id.name;
    if (parent === undefined || !isParent(parent)) return; // not addressed by parent name: ingest only
    ctx.blockConcurrencyWhile(async () => {
      const neighbors = await loadNeighbors(parent);
      const model = new AreaModel(
        parent,
        new SqlModelStore(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn)),
        areaConfig(neighbors, childrenOf, parentOf, this.cfg.STATE_FLUSH_MS),
      );
      this.model = model;
      this.core = new AreaCore(store, model, this.cfg);
    });
  }

  /** One RPC per parent per request (R7.2). */
  async ingest(input: AreaIngestInput): Promise<AreaResponse> {
    const res = await this.core.ingest(input);
    await this.forwardToHome(input, res);
    await this.afterChange(input.receiveTimeMs);
    return res;
  }

  /** Home Watch (ADR 0044): remember that this install is a paired station, so its events are forwarded to its pairing shard. */
  async watchStation(installId: string, shard: string): Promise<void> {
    this.watch.add(installId, shard);
  }

  /** One call per watched station per batch, after our own work and best effort: a failure loses one heartbeat, the next batch repairs it. */
  private async forwardToHome(input: AreaIngestInput, res: AreaResponse): Promise<void> {
    const batches = forwardable(this.watch.map, input.events, res.results);
    await Promise.allSettled(
      [...batches].map(async ([installId, events]) => {
        const shard = this.watch.map.get(installId) as string;
        const needed = await this.env.PAIRING.get(this.env.PAIRING.idFromName(shard)).observe(installId, events, input.receiveTimeMs);
        if (!needed) this.watch.remove(installId);
      }),
    );
  }

  /** R12.1: rows, memory state and every engine state for one install, written at once. Returns rows deleted. */
  async deleteInstall(installId: string): Promise<number> {
    this.watch.remove(installId);
    const n = this.core.deleteInstall(installId) + this.alerts.deleteInstall(installId); // R10.2: labels, subscriptions, queue, memory
    if (this.model) {
      this.model.deleteInstall(installId, Date.now());
      this.model.flush();
      // Membership may have dropped: send the public-index removal and neighbor notices now (review issue 1).
      await this.afterChange(Date.now());
    }
    return n;
  }

  /** Follow a cell, or replace the row for this install and cell (token refresh). The Worker has validated and authenticated it. */
  async follow(request: FollowRequest): Promise<void> {
    const now = Date.now();
    this.alerts.follow(request, now);
    await this.schedule(now);
  }

  async unfollow(installId: string, cell: string): Promise<void> {
    this.alerts.unfollow(installId, cell);
  }

  /** Neighbor notices from another area actor (R7.3). A NORMAL-only notice does not create state here (R13.1). */
  async receiveNotices(notices: Notice[]): Promise<void> {
    if (!this.model) return;
    if (this.model.isEmpty() && notices.every((n) => n.level === 'NORMAL')) return;
    const now = Date.now();
    this.model.receiveNotices(notices, now);
    await this.afterChange(now);
  }

  /** The new parent's actor asks this one to forget a moved install (R5.3). */
  async removeMember(request: RemovalRequest): Promise<void> {
    if (!this.model) return;
    const now = Date.now();
    this.model.removeMember(request, now);
    await this.afterChange(now);
  }

  /** Public views of this actor's scopes (R9). Null views are not publishable. */
  async publicViews(): Promise<ScopeView[]> {
    return this.model?.views() ?? [];
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.core.flush();
    if (now >= this.core.pruneDueMs(now)) this.core.prune(now);
    if (this.model) {
      const tick = this.model.tickDueMs();
      if (tick !== null && tick <= now) this.model.tick(now);
      this.model.flush();
    }
    const report = this.core.drainReport(now);
    if (report) {
      try {
        const registry = this.env.REGISTRY.get(this.env.REGISTRY.idFromName(REGISTRY_NAME));
        this.core.setGlobalRows(report.day, await registry.report(report));
      } catch {
        // Counters are best effort. Losing one report only makes shedding slightly late.
      }
    }
    this.alerts.prune(now);
    await this.send();
    await this.schedule(now);
  }

  private async afterChange(nowMs: number): Promise<void> {
    await this.send();
    await this.schedule(nowMs);
  }

  /** Notices and removal requests to other area actors. Best effort: a failed removal is retried by the next move (design 11). */
  private async send(): Promise<void> {
    if (!this.model) return;
    const out = this.model.drainOutbox();
    // Pushes go to the alerts system: planned for followers, queued, then sent within this invocation's budget (R11.2).
    if (out.pushes.length > 0) {
      const now = Date.now();
      this.alerts.onPushes(toAreaPushes(out.pushes, this.model.views(), parentOf, now), now);
    }
    const calls: Promise<unknown>[] = [];
    for (const b of out.notices) calls.push(this.actor(b.toParent).receiveNotices(b.notices));
    for (const r of out.removals) calls.push(this.actor(parentOf(r.oldCell)).removeMember(r));
    const pub = out.publish;
    if (pub.put.length > 0 || pub.remove.length > 0) {
      const index = this.env.PUBLIC_INDEX.get(this.env.PUBLIC_INDEX.idFromName(INDEX_NAME));
      const model = this.model;
      calls.push(index.apply(pub).catch(() => model.requeuePublish(pub)));
    }
    if (out.fieldRecords.length > 0) {
      // Counts only (R5.1). A failed send goes back to the outbox; the telemetry actor replaces by key, so a resend is harmless.
      const telemetry = this.env.TELEMETRY.get(this.env.TELEMETRY.idFromName(TELEMETRY_NAME));
      const model = this.model;
      const records = out.fieldRecords;
      calls.push(telemetry.putRecords(records).catch(() => model.requeueFieldRecords(records)));
    }
    await Promise.allSettled(calls);
    await this.dispatchPushes();
  }

  /** Send due messages, at most one invocation's worth. The rest stays queued and `schedule` sets the alarm for it. */
  private async dispatchPushes(): Promise<void> {
    try {
      await runSends(this.alerts.queue(), this.fcm, Date.now());
    } catch {
      // The queue keeps what was not sent. A thrown error here must not stop notices or the alarm.
    }
  }

  private actor(parent: string) {
    return this.env.AREA.get(this.env.AREA.idFromName(parent));
  }

  /** Keep one alarm at the earliest of: flush/report due, retention due, reducer tick. Each setAlarm is a row written, so only move it earlier. */
  private async schedule(nowMs: number): Promise<void> {
    const due = Math.min(
      this.core.flushDueMs() ?? Number.POSITIVE_INFINITY,
      this.core.pruneDueMs(nowMs),
      this.model?.alarmDueMs(this.cfg.STATE_FLUSH_MS) ?? Number.POSITIVE_INFINITY,
      this.alerts.nextDueMs() ?? Number.POSITIVE_INFINITY,
    );
    const current = await this.ctx.storage.getAlarm();
    if (current === null || due < current) await this.ctx.storage.setAlarm(Math.max(due, nowMs + 1));
  }
}

/** Ring-1 neighbors of the parent's cells. If h3-js fails to load, hints are skipped and everything else works (design 11). */
async function loadNeighbors(parent: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    for (const c of childrenOf(parent)) out.set(c, await neighborsOf(c));
  } catch {
    out.clear();
  }
  return out;
}

function tunables(env: Env): Tunables {
  const flush = Number(env.STATE_FLUSH_MS);
  return Number.isInteger(flush) && flush > 0 ? { ...CONFIG, STATE_FLUSH_MS: flush } : CONFIG;
}
