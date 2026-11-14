// Area actor: one Durable Object per res-7 parent (ADR 0006). A thin shell around AreaCore: storage wiring and alarms only.
// Alarm API: https://developers.cloudflare.com/durable-objects/api/alarms/
import { DurableObject } from 'cloudflare:workers';
import { AreaCore, type AreaIngestInput, type AreaResponse } from './area-core.ts';
import { SqlAreaStore } from './area-store.ts';
import { CONFIG, type Tunables } from './config.ts';
import { type Env, REGISTRY_NAME } from './env.ts';
import { NoopDetectionPort } from './ports.ts';

export class AreaActor extends DurableObject<Env> {
  private readonly core: AreaCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The detection engine is wired here by the detection-engine spec; until then ingest only records.
    this.core = new AreaCore(new SqlAreaStore(ctx.storage.sql), new NoopDetectionPort(), tunables(env));
  }

  /** One RPC per parent per request (R7.2). */
  async ingest(input: AreaIngestInput): Promise<AreaResponse> {
    const res = await this.core.ingest(input);
    await this.schedule(input.receiveTimeMs);
    return res;
  }

  /** R12.1: rows and memory state for one install. Returns rows deleted. */
  async deleteInstall(installId: string): Promise<number> {
    return this.core.deleteInstall(installId);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.core.flush();
    if (now >= this.core.pruneDueMs(now)) this.core.prune(now);
    const report = this.core.drainReport(now);
    if (report) {
      try {
        const registry = this.env.REGISTRY.get(this.env.REGISTRY.idFromName(REGISTRY_NAME));
        this.core.setGlobalRows(report.day, await registry.report(report));
      } catch {
        // Counters are best effort. Losing one report only makes shedding slightly late.
      }
    }
    await this.schedule(now);
  }

  /** Keep one alarm at the earliest of: flush/report due, retention due. Each setAlarm is a row written, so only move it earlier. */
  private async schedule(nowMs: number): Promise<void> {
    const flush = this.core.flushDueMs();
    const due = Math.min(flush ?? Number.POSITIVE_INFINITY, this.core.pruneDueMs(nowMs));
    const current = await this.ctx.storage.getAlarm();
    if (current === null || due < current) await this.ctx.storage.setAlarm(Math.max(due, nowMs + 1));
  }
}

function tunables(env: Env): Tunables {
  const flush = Number(env.STATE_FLUSH_MS);
  return Number.isInteger(flush) && flush > 0 ? { ...CONFIG, STATE_FLUSH_MS: flush } : CONFIG;
}
