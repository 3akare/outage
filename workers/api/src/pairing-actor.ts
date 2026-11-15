// Pairing shard actor (home-watch, ADR 0009): one Durable Object per two-symbol shard, holding the offers and pairs of the
// stations that map to it. A thin shell over PairingCore. Alarm API: https://developers.cloudflare.com/durable-objects/api/alarms/
import { DurableObject } from 'cloudflare:workers';
import { CONFIG } from './config.ts';
import type { Env } from './env.ts';
import { type ClaimInput, type ClaimResult, type OfferInput, type OfferResult, PairingCore } from './pairing-core.ts';
import { SqlPairStore } from './pairing-store.ts';

export class PairingActor extends DurableObject<Env> {
  private readonly core: PairingCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new PairingCore(new SqlPairStore(ctx.storage.sql), CONFIG);
  }

  async createOffer(input: OfferInput): Promise<OfferResult> {
    const res = this.core.createOffer(input);
    if (res.status === 'ok') await this.schedule();
    return res;
  }

  async claim(input: ClaimInput): Promise<ClaimResult> {
    return this.core.claim(input);
  }

  async removePair(pairId: string, installId: string): Promise<boolean> {
    return this.core.removePair(pairId, installId);
  }

  async deleteInstall(installId: string): Promise<number> {
    return this.core.deleteInstall(installId);
  }

  /** Expired offers hold only a hash, but they are deleted as soon as they lapse. */
  async alarm(): Promise<void> {
    this.core.purgeExpired(Date.now());
    await this.schedule();
  }

  private async schedule(): Promise<void> {
    const next = this.core.nextExpiry();
    const current = await this.ctx.storage.getAlarm();
    if (next === null) return;
    if (current === null || next < current) await this.ctx.storage.setAlarm(next + 1);
  }
}
