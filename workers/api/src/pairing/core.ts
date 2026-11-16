// Pairing logic for one shard (home-watch R1, R7; ADR 0009). Synchronous over a store port, so a Durable Object runs each
// call to completion with no interleaving, and Vitest runs it with an in-memory store. Time and randomness are inputs.
import { decideClaim, MAX_VIEWERS_PER_STATION, OFFER_TTL_MS } from '@outage/shared';
import { admit, type Bucket, newBucket } from '../ingest/bucket.ts';
import type { Tunables } from '../config.ts';
import type { HomeStore } from '../home/core.ts';

export interface OfferRow {
  key: string;
  codeHash: string;
  stationInstall: string;
  expiresMs: number;
  attempts: number;
  /** The station's res-8 cell, if it sent one (ADR 0044). Used once at claim time. Absent without a cell. */
  stationCell?: string;
}
export interface PairRow {
  pairId: string;
  stationInstall: string;
  viewerInstall: string;
  fcmToken: string;
  quietStartMin: number;
  quietEndMin: number;
  tzOffsetMin: number;
  stationName: string | null;
  createdMs: number;
  /** When FCM first said the viewer's token is dead, else null. Pushes stop; after 7 days the pair is removed (design 9). */
  pushFailedMs: number | null;
}
export interface PairStore extends HomeStore {
  getOffer(key: string): OfferRow | undefined;
  putOffer(row: OfferRow): void;
  deleteOffer(key: string): number;
  deleteOffersOfStation(stationInstall: string): number;
  deleteExpiredOffers(nowMs: number): number;
  nextOfferExpiry(): number | null;
  /** Viewers of a station, not counting `exceptViewer`. */
  countViewers(stationInstall: string, exceptViewer: string): number;
  getPair(pairId: string): PairRow | undefined;
  putPair(row: PairRow): void;
  deletePair(pairId: string): number;
  deletePairsBetween(stationInstall: string, viewerInstall: string): number;
  /** Every offer and pair where the install is the station or the viewer. Returns rows deleted. */
  deleteInstall(installId: string): number;
}

export type OfferResult =
  | { status: 'ok'; expiresAtMs: number }
  | { status: 'key_taken' }
  | { status: 'full' }
  | { status: 'limited'; retryAfterMs: number };
/** On success the Worker also learns the station, to tell its area actor to forward its events. Neither goes to the viewer. */
export type ClaimResult = { status: 'ok'; pairId: string; stationInstall: string; stationCell: string | null } | { status: 'fail' } | { status: 'full' } | { status: 'limited'; retryAfterMs: number };

export interface OfferInput {
  key: string;
  codeHash: string;
  stationInstall: string;
  stationCell?: string;
  nowMs: number;
}
export interface ClaimInput {
  key: string;
  codeHash: string;
  viewerInstall: string;
  pairId: string;
  fcmToken: string;
  quietStartMin: number;
  quietEndMin: number;
  tzOffsetMin: number;
  stationName: string | null;
  nowMs: number;
}

/** Equal-length strings compared without an early exit. A length difference is not secret here (both are 64 hex characters). */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const MAX_BUCKETS = 10_000;

export class PairingCore {
  private readonly buckets = new Map<string, Bucket>();
  constructor(
    private readonly store: PairStore,
    private readonly cfg: Tunables,
  ) {}

  /** R1.6: one token per offer or claim from the ingest bucket, per install, in memory (lenient after a restart, never stricter). */
  private limit(installId: string, nowMs: number): number {
    const bucket = this.buckets.get(installId) ?? newBucket(this.cfg.BUCKET_CAPACITY, nowMs);
    if (!this.buckets.has(installId) && this.buckets.size >= MAX_BUCKETS) this.buckets.clear();
    const a = admit(bucket, nowMs, ['detection'], this.cfg.BUCKET_CAPACITY, this.cfg.BUCKET_REFILL_MS);
    this.buckets.set(installId, a.bucket);
    return a.admitted[0] ? 0 : Math.max(1, a.retryAfterMs);
  }

  createOffer(i: OfferInput): OfferResult {
    const wait = this.limit(i.stationInstall, i.nowMs);
    if (wait > 0) return { status: 'limited', retryAfterMs: wait };
    this.store.deleteExpiredOffers(i.nowMs);
    if (this.store.countViewers(i.stationInstall, '') >= MAX_VIEWERS_PER_STATION) return { status: 'full' }; // R1.9
    const taken = this.store.getOffer(i.key);
    if (taken && taken.stationInstall !== i.stationInstall) return { status: 'key_taken' };
    this.store.deleteOffersOfStation(i.stationInstall); // one live offer per station
    const expiresMs = i.nowMs + OFFER_TTL_MS; // R1.2
    this.store.putOffer({
      key: i.key,
      codeHash: i.codeHash,
      stationInstall: i.stationInstall,
      expiresMs,
      attempts: 0,
      ...(i.stationCell ? { stationCell: i.stationCell } : {}),
    });
    return { status: 'ok', expiresAtMs: expiresMs };
  }

  claim(i: ClaimInput): ClaimResult {
    const wait = this.limit(i.viewerInstall, i.nowMs);
    if (wait > 0) return { status: 'limited', retryAfterMs: wait };
    const offer = this.store.getOffer(i.key);
    // Always compare, even with no offer, so the work does not depend on whether the key exists.
    const matches = constantTimeEqual(offer?.codeHash ?? '0'.repeat(64), i.codeHash) && offer !== undefined;
    const decision = decideClaim(offer && { expiresAtMs: offer.expiresMs, attempts: offer.attempts }, i.nowMs, matches);
    if (decision.kind === 'fail') {
      if (offer) {
        if (decision.next) this.store.putOffer({ ...offer, attempts: decision.next.attempts });
        else this.store.deleteOffer(i.key);
      }
      return { status: 'fail' };
    }
    const station = (offer as OfferRow).stationInstall;
    if (station === i.viewerInstall) return { status: 'fail' }; // a phone cannot watch itself; the offer stays for the real viewer
    if (this.store.countViewers(station, i.viewerInstall) >= MAX_VIEWERS_PER_STATION) return { status: 'full' }; // R1.9
    this.store.deletePairsBetween(station, i.viewerInstall); // pairing again replaces the old link
    this.store.putPair({
      pairId: i.pairId,
      stationInstall: station,
      viewerInstall: i.viewerInstall,
      fcmToken: i.fcmToken,
      quietStartMin: i.quietStartMin,
      quietEndMin: i.quietEndMin,
      tzOffsetMin: i.tzOffsetMin,
      stationName: i.stationName,
      createdMs: i.nowMs,
      pushFailedMs: null,
    });
    this.store.deleteOffer(i.key); // one successful claim (R1.2)
    return { status: 'ok', pairId: i.pairId, stationInstall: station, stationCell: (offer as OfferRow).stationCell ?? null };
  }

  /** R1.10: either side may remove a pair; the row holds the push token, so the token goes with it. Anyone else gets false. */
  removePair(pairId: string, installId: string): boolean {
    const pair = this.store.getPair(pairId);
    if (!pair || (pair.stationInstall !== installId && pair.viewerInstall !== installId)) return false;
    this.store.deletePair(pairId);
    return true;
  }

  /** R7.4: everything tied to this install in this shard. Returns rows deleted. */
  deleteInstall(installId: string): number {
    this.buckets.delete(installId);
    return this.store.deleteInstall(installId);
  }

  purgeExpired(nowMs: number): number {
    return this.store.deleteExpiredOffers(nowMs);
  }

  nextExpiry(): number | null {
    return this.store.nextOfferExpiry();
  }
}
