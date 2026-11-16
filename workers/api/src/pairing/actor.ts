// Pairing shard actor (home-watch, ADR 0009, ADR 0044): one Durable Object per two-symbol shard, holding the offers and pairs
// of the stations that map to it, and the Home Watch state of those stations. A thin shell over PairingCore and HomeCore.
// Alarm API: https://developers.cloudflare.com/durable-objects/api/alarms/
import { DurableObject } from 'cloudflare:workers';
import type { HomeResponse } from '@outage/shared';
import { FcmClient } from '../alerts/fcm.ts';
import { CONFIG } from '../config.ts';
import type { Env } from '../env.ts';
import { type ForwardedEvent, HomeCore } from '../home/core.ts';
import { earliest, planAlarm } from '../home/wake.ts';
import { type ClaimInput, type ClaimResult, type OfferInput, type OfferResult, PairingCore } from './core.ts';
import { SqlPairStore } from './store.ts';

export class PairingActor extends DurableObject<Env> {
  private readonly core: PairingCore;
  private readonly home: HomeCore;
  private readonly store: SqlPairStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlPairStore(ctx.storage.sql);
    this.core = new PairingCore(this.store, CONFIG);
    // The service-account secret is read only here and passed to the client. It is never logged.
    const fcm = new FcmClient({ secret: env.FCM_SERVICE_ACCOUNT, fetch: (input, init) => fetch(input, init), now: () => Date.now() });
    this.home = new HomeCore(this.store, fcm, Date.now());
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
    const pair = this.store.getPair(pairId);
    const removed = this.core.removePair(pairId, installId);
    if (removed && pair) this.home.dropIfUnpaired(pair.stationInstall);
    return removed;
  }

  /** `POST /v1/pair/list` (ADR 0045): the station's pairs, ids and creation times only. */
  async stationPairs(stationInstall: string): Promise<{ pairId: string; createdMs: number }[]> {
    return this.store.pairsOfStation(stationInstall).map((p) => ({ pairId: p.pairId, createdMs: p.createdMs }));
  }

  async deleteInstall(installId: string): Promise<number> {
    const n = this.core.deleteInstall(installId);
    this.home.forget(installId);
    this.home.sweep(); // a viewer's delete may leave a station with no pair
    return n;
  }

  /** The area actor of the station forwards its events here (ADR 0044). False tells it to stop forwarding. */
  async observe(stationInstall: string, events: ForwardedEvent[], receiveMs: number): Promise<boolean> {
    const needed = await this.home.observe(stationInstall, events, receiveMs);
    await this.schedule();
    return needed;
  }

  /** `GET /v1/home/:pairId` (home-watch R4). Null for an unknown pair or another viewer. */
  async view(pairId: string, viewerInstall: string, nowMs: number): Promise<HomeResponse | null> {
    return this.home.view(pairId, viewerInstall, nowMs);
  }

  /** Expired offers hold only a hash, but they are deleted as soon as they lapse. Station silence and push retries run here too (H7). */
  async alarm(): Promise<void> {
    const now = Date.now();
    this.core.purgeExpired(now);
    await this.home.tick(now);
    await this.schedule();
  }

  /** One alarm for offer expiry, station silence, push retry and the daily prune. Set only when it must move earlier (design 6). */
  private async schedule(): Promise<void> {
    const offer = this.core.nextExpiry();
    const due = earliest(offer === null ? null : offer + 1, this.home.nextDueMs());
    const at = planAlarm(await this.ctx.storage.getAlarm(), due, Date.now());
    if (at !== null) await this.ctx.storage.setAlarm(at);
  }
}
