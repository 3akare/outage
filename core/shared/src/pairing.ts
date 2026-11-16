// Home Watch pairing (home-watch R1, ADR 0009): code alphabet, routing shard, attempts rule and request shapes.
// Pure: no I/O, no clock (time is an input), randomness is injected. The Worker (web) and, later, the Kotlin app's
// fixtures use these rules; nothing here knows about storage.
import { isCell } from './h3.ts';
import { isInstallId } from './ingest.ts';

/** 30 symbols: base32 (Crockford) without 0, 1, I, L, O, U (R1.3 decisions table). */
export const PAIRING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PAIRING_CODE_LENGTH = 10;
/** First characters of the code: the pairing shard that holds the offer (ADR 0009 option 1). */
export const PAIRING_SHARD_LENGTH = 2;
/** Characters that find the offer inside its shard. The rest is the secret part, checked against a hash. */
export const PAIRING_KEY_LENGTH = 4;
export const PAIRING_SHARDS = PAIRING_ALPHABET.length ** PAIRING_SHARD_LENGTH; // 900
export const OFFER_TTL_MS = 600_000; // R1.2
export const MAX_FAILED_CLAIMS = 5; // R1.5
export const MAX_VIEWERS_PER_STATION = 5; // R1.9
export const MAX_PAIR_IDS_PER_DELETE = 25;

const CODE = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_CODE_LENGTH}}$`);
const SHARD = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_SHARD_LENGTH}}$`);
const PAIR_ID = new RegExp(`^[${PAIRING_ALPHABET}]{${PAIRING_SHARD_LENGTH}}[0-9a-f]{32}$`);

export const isPairingShard = (v: unknown): v is string => typeof v === 'string' && SHARD.test(v);
export const isPairingCode = (v: unknown): v is string => typeof v === 'string' && CODE.test(v);
export const isPairId = (v: unknown): v is string => typeof v === 'string' && PAIR_ID.test(v);

/** What a person typed: upper case, spaces and hyphens removed. Look-alikes are NOT mapped, so `O` stays invalid. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** Shard for an install from the first 4 hex characters of its SHA-256 (`hashInstallId` in the Worker). Stable for the install's life. */
export function shardFromHash(hexHash: string): string {
  const n = Number.parseInt(hexHash.slice(0, 4), 16);
  if (!/^[0-9a-f]{4}/.test(hexHash) || Number.isNaN(n)) throw new Error('shardFromHash needs a hex hash');
  const i = n % PAIRING_SHARDS;
  const base = PAIRING_ALPHABET.length;
  return PAIRING_ALPHABET[Math.floor(i / base)] + PAIRING_ALPHABET[i % base];
}

export const shardOfCode = (code: string): string => code.slice(0, PAIRING_SHARD_LENGTH);
export const keyOfCode = (code: string): string => code.slice(0, PAIRING_KEY_LENGTH);
export const shardOfPairId = (pairId: string): string => pairId.slice(0, PAIRING_SHARD_LENGTH);

/** Uniform symbols by rejection sampling (240 = 8 x 30), so no symbol is likelier than another. Throws if the source is not random enough. */
function randomSymbols(count: number, random: (n: number) => Uint8Array): string {
  let out = '';
  for (let draw = 0; draw < 16 && out.length < count; draw++) {
    for (const b of random(count * 2)) {
      if (b < 240 && out.length < count) out += PAIRING_ALPHABET[b % PAIRING_ALPHABET.length];
    }
  }
  if (out.length < count) throw new Error('random source exhausted');
  return out;
}

/** A code for a station whose shard is `shard`: the shard, then random symbols. */
export function generateCode(shard: string, random: (n: number) => Uint8Array): string {
  if (!isPairingShard(shard)) throw new Error('bad shard');
  return shard + randomSymbols(PAIRING_CODE_LENGTH - PAIRING_SHARD_LENGTH, random);
}

/** A pair id: the viewer's route to the shard (first 2 symbols) plus 128 random bits. */
export function generatePairId(shard: string, random: (n: number) => Uint8Array): string {
  if (!isPairingShard(shard)) throw new Error('bad shard');
  const bytes = random(16);
  if (bytes.length !== 16) throw new Error('pair id needs 16 random bytes');
  return shard + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- attempts rule (R1.2, R1.5; property H5) ----------------------------------------------------------------------

export interface OfferLife {
  expiresAtMs: number;
  /** Failed claims so far. */
  attempts: number;
}

/**
 * - `match`: the offer is live and the code is right. The caller creates the pair and deletes the offer (one successful claim).
 * - `fail`: every failure looks the same to the caller. `next` is the offer's state to keep, or null to delete it.
 */
export type ClaimDecision = { kind: 'match' } | { kind: 'fail'; next: OfferLife | null };

export function decideClaim(offer: OfferLife | undefined, nowMs: number, codeMatches: boolean): ClaimDecision {
  if (!offer) return { kind: 'fail', next: null };
  if (nowMs >= offer.expiresAtMs || offer.attempts >= MAX_FAILED_CLAIMS) return { kind: 'fail', next: null };
  if (codeMatches) return { kind: 'match' };
  const attempts = offer.attempts + 1;
  return { kind: 'fail', next: attempts >= MAX_FAILED_CLAIMS ? null : { ...offer, attempts } };
}

// ---- request and response shapes ----------------------------------------------------------------------------------

export interface OfferRequest {
  installId: string;
  /**
   * The station's res-8 cell (ADR 0044). Used once, at claim time, to tell the right area actor to forward this station's
   * events. Never returned to a viewer and never stored on a pair. Without it the pair works but the state stays unknown.
   */
  cell?: string;
}
export interface OfferResponse {
  code: string;
  expiresAtMs: number;
}
export interface ClaimRequest {
  installId: string;
  code: string;
  fcmToken: string;
  quietStartMin: number;
  quietEndMin: number;
  tzOffsetMin: number;
  /** Only when the viewer chooses to sync the name (R7.6). */
  stationName?: string;
}
export interface ClaimResponse {
  pairId: string;
}
export interface RemovePairRequest {
  installId: string;
  pairId: string;
}
/** `POST /v1/pair/list`: the station's own pairs, so it can remove a dead viewer (ADR 0009 review, ADR 0045). */
export interface ListPairsRequest {
  installId: string;
}
export interface ListPairsResponse {
  /** Pair id and creation time only: no viewer install, token or name. */
  pairs: { pairId: string; createdMs: number }[];
}
/**
 * The push token a viewer sends while the app has no Firebase Messaging (ADR 0045). The pair works and the viewer polls;
 * the Worker never sends to it and never counts it as a dead token.
 */
export const NO_PUSH_TOKEN = 'none';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const hasExactKeys = (r: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) =>
  required.every((k) => Object.hasOwn(r, k)) && Object.keys(r).every((k) => required.includes(k) || optional.includes(k));
const intIn = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

export type Parsed<T> = { ok: true; value: T } | { ok: false };

export function parseOfferRequest(raw: unknown): Parsed<OfferRequest> {
  if (!isRecord(raw) || !hasExactKeys(raw, ['installId'], ['cell']) || !isInstallId(raw.installId)) return { ok: false };
  if (raw.cell === undefined) return { ok: true, value: { installId: raw.installId } };
  if (!isCell(raw.cell)) return { ok: false };
  return { ok: true, value: { installId: raw.installId, cell: raw.cell } };
}

/** The claim's `code` is normalized here. A code that is not 10 alphabet symbols is a parse failure; the Worker answers it like any other bad claim. */
export function parseClaimRequest(raw: unknown): Parsed<ClaimRequest> {
  const required = ['installId', 'code', 'fcmToken', 'quietStartMin', 'quietEndMin', 'tzOffsetMin'] as const;
  if (!isRecord(raw) || !hasExactKeys(raw, required, ['stationName'])) return { ok: false };
  if (!isInstallId(raw.installId) || typeof raw.code !== 'string' || raw.code.length > 64) return { ok: false };
  const code = normalizeCode(raw.code);
  if (!isPairingCode(code)) return { ok: false };
  if (typeof raw.fcmToken !== 'string' || raw.fcmToken.length < 1 || raw.fcmToken.length > 1024) return { ok: false };
  if (!intIn(raw.quietStartMin, 0, 1439) || !intIn(raw.quietEndMin, 0, 1439) || !intIn(raw.tzOffsetMin, -840, 840)) return { ok: false };
  const value: ClaimRequest = {
    installId: raw.installId,
    code,
    fcmToken: raw.fcmToken,
    quietStartMin: raw.quietStartMin,
    quietEndMin: raw.quietEndMin,
    tzOffsetMin: raw.tzOffsetMin,
  };
  if (raw.stationName !== undefined) {
    if (typeof raw.stationName !== 'string' || raw.stationName.length < 1 || raw.stationName.length > 40) return { ok: false };
    value.stationName = raw.stationName;
  }
  return { ok: true, value };
}

export function parseListPairsRequest(raw: unknown): Parsed<ListPairsRequest> {
  if (!isRecord(raw) || !hasExactKeys(raw, ['installId']) || !isInstallId(raw.installId)) return { ok: false };
  return { ok: true, value: { installId: raw.installId } };
}

export function parseRemovePairRequest(raw: unknown): Parsed<RemovePairRequest> {
  if (!isRecord(raw) || !hasExactKeys(raw, ['installId', 'pairId']) || !isInstallId(raw.installId) || !isPairId(raw.pairId)) return { ok: false };
  return { ok: true, value: { installId: raw.installId, pairId: raw.pairId } };
}
