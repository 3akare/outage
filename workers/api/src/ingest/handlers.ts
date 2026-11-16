// Worker request handlers (event-ingest task 4 and 9). Stateless: authenticate, validate, compute event time, group by
// res-7 parent, make one area call per parent, assemble results. No detection logic (R7.4), no IP or user agent kept (R2.4).
// Dependencies are injected so Vitest runs this without the Workers runtime.
import {
  type ClaimResponse,
  type DeleteRequest,
  type EventResult,
  type EventsResponse,
  type FollowRequest,
  type DeviceDay,
  type FieldDump,
  type HomeResponse,
  isPairId,
  generateCode,
  generatePairId,
  HEARTBEAT_ON_BATTERY,
  isInstallId,
  isPermanent,
  keyOfCode,
  type OfferResponse,
  parseClaimRequest,
  parseDeleteRequest,
  parseDeviceDay,
  parseEventsRequest,
  parseFollowRequest,
  parseUnfollowRequest,
  parseOfferRequest,
  parseRemovePairRequest,
  type RegisterResponse,
  type RejectCode,
  res7Parent,
  shardFromHash,
  shardOfCode,
  shardOfPairId,
  validateEvent,
  type WireEvent,
} from '@outage/shared';
import type { AreaEvent, AreaIngestInput, AreaResponse } from '../area/core.ts';
import type { Tunables } from '../config.ts';
import { eventTimeMs } from './eventtime.ts';
import type { RegisterLimiter } from './limiter.ts';
import type { ClaimInput, ClaimResult, OfferInput, OfferResult } from '../pairing/core.ts';
import { hashPairingCode } from '../pairing/hash.ts';
import { DAY_PATTERN, dayAcceptable } from '../telemetry/core.ts';
import { hashInstallId, mintInstallId, mintToken, verifyToken } from './token.ts';

export interface AreaGateway {
  ingest(parent: string, input: AreaIngestInput): Promise<AreaResponse>;
  deleteInstall(parent: string, installId: string): Promise<number>;
  /** Home Watch (ADR 0036): the station's parent area actor starts forwarding this install's events to its pairing shard. */
  watchStation(parent: string, installId: string, shard: string): Promise<void>;
}
/** One call per pairing shard (home-watch, ADR 0009). The shard is chosen by the caller from the code, pair id or station install. */
export interface PairingGateway {
  createOffer(shard: string, input: OfferInput): Promise<OfferResult>;
  claim(shard: string, input: ClaimInput): Promise<ClaimResult>;
  removePair(shard: string, pairId: string, installId: string): Promise<boolean>;
  deleteInstall(shard: string, installId: string): Promise<number>;
  /** The viewer's view of a station, from the shard the pair id names. Null for an unknown pair or another viewer. Cached 10 s. */
  home(shard: string, pairId: string, viewerInstall: string, nowMs: number): Promise<HomeResponse | null>;
  /** Drop a pair from the isolate's view cache after it is removed. */
  forgetPair(pairId: string): void;
}
/** Subscriptions live in the area actor of the followed cell's res-7 parent (alerts-and-light-alarm design 5.1). */
export interface AlertsGateway {
  follow(parent: string, request: FollowRequest): Promise<void>;
  unfollow(parent: string, installId: string, cell: string): Promise<void>;
}
export interface RegistryGateway {
  isRevoked(installId: string): Promise<boolean>;
  revoke(installId: string): Promise<void>;
  stats(): Promise<unknown>;
}
/** Field telemetry (field-telemetry task 5): device-day uploads, delete-my-data, and the admin read. */
export interface TelemetryGateway {
  putDay(day: DeviceDay): Promise<void>;
  deleteInstall(installId: string): Promise<number>;
  field(day: string): Promise<FieldDump | null>;
}
export interface Deps {
  secret: string | undefined;
  /** FIELD_READ_TOKEN: protects GET /v1/admin/field/:day. Unset means the endpoint is off. */
  fieldToken?: string | undefined;
  telemetry: TelemetryGateway;
  /** Per-install upload budget for POST /v1/telemetry (R3.3); keyed by install ID, memory only. */
  telemetryLimiter: RegisterLimiter;
  now(): number;
  randomBytes(n: number): Uint8Array;
  /** An opaque, already-hashed key for the register limit. Must not be logged or stored. */
  sourceKey(req: Request): Promise<string> | string;
  limiter: RegisterLimiter;
  area: AreaGateway;
  alerts: AlertsGateway;
  /** Per-install budget for follow and unfollow (design 5.4); keyed by install ID, memory only. */
  followLimiter: RegisterLimiter;
  pairing: PairingGateway;
  registry: RegistryGateway;
  cfg: Tunables;
}

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}
const fail = (status: number, error: string, extra: Record<string, string> = {}) => json(status, { error }, extra);
const retryHeader = (ms: number) => ({ 'retry-after': String(Math.max(1, Math.ceil(ms / 1000))) });

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith(ADMIN_FIELD_PREFIX)) return adminRoute(req, deps, pathname.slice(ADMIN_FIELD_PREFIX.length));
  if (pathname.startsWith(HOME_PREFIX)) return homeRoute(req, deps, pathname.slice(HOME_PREFIX.length));
  const route = ROUTES[pathname];
  if (!route) return fail(404, 'not_found');
  if (req.method !== route.method) return fail(405, 'method_not_allowed', { allow: route.method });
  if (route.needsSecret && !deps.secret) return fail(500, 'server_not_configured'); // no value is ever printed
  try {
    return await route.handler(req, deps);
  } catch {
    return fail(503, 'unavailable'); // e.g. the registry did not answer: transient for the Uploader, and nothing is processed
  }
}

// ---- body reading ----------------------------------------------------------------------------------------------

/** Read at most `max` bytes, stopping early on an oversize body. Returns null when over the limit. */
async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

type Body = { ok: true; value: unknown } | { ok: false; res: Response };
async function readJson(req: Request, deps: Deps): Promise<Body> {
  const text = await readLimited(req, deps.cfg.MAX_BODY_BYTES);
  if (text === null) return { ok: false, res: fail(413, 'body_too_large') };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, res: fail(400, 'bad_json') };
  }
}

function bearer(req: Request): string {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

// ---- POST /v1/register -----------------------------------------------------------------------------------------

async function register(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now();
  const key = await deps.sourceKey(req);
  const verdict = deps.limiter.allow(key, now);
  if (!verdict.ok) return fail(429, 'rate_limited', retryHeader(verdict.retryAfterMs));
  const installId = mintInstallId(deps.randomBytes(16));
  const token = await mintToken(deps.secret as string, installId); // nothing is stored (R2.2)
  const body: RegisterResponse = { installId, token };
  return json(200, body);
}

// ---- POST /v1/events -------------------------------------------------------------------------------------------

const rejected = (seq: number, code: RejectCode): EventResult => ({
  seq,
  status: 'rejected',
  code,
  permanent: isPermanent(code),
});

function toAreaEvent(ev: WireEvent, receiveTimeMs: number): AreaEvent {
  // R3.2: event time from the Worker clock and the monotonic elapsed value. `elapsedMs` goes no further (R3.3).
  const base = {
    installId: ev.installId,
    seq: ev.seq,
    type: ev.type,
    cell: ev.cell,
    eventTimeMs: eventTimeMs(receiveTimeMs, ev.elapsedMs),
    confidence: ev.confidence,
  };
  if (ev.type === 'LABEL') return { ...base, schedulingDelayMs: null, refSeq: ev.refSeq, answer: ev.answer };
  if (ev.type === 'DISARMED' && ev.reason === HEARTBEAT_ON_BATTERY) return { ...base, schedulingDelayMs: null, reason: ev.reason };
  return { ...base, schedulingDelayMs: ev.schedulingDelayMs ?? null };
}

async function events(req: Request, deps: Deps): Promise<Response> {
  const receiveTimeMs = deps.now(); // R3.1: one receive time for the whole request
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseEventsRequest(body.value, deps.cfg.MAX_BATCH_EVENTS);
  if (!parsed.ok) return parsed.reason === 'TOO_MANY_EVENTS' ? fail(413, 'too_many_events') : fail(400, 'malformed');
  const { installId } = parsed;
  if (!(await authorized(req, installId, deps, true))) return fail(401, 'unauthorized'); // R2.3: whole request

  const results: EventResult[] = new Array(parsed.events.length);
  const groups = new Map<string, { idx: number[]; events: AreaEvent[] }>();
  parsed.events.forEach((raw, i) => {
    const v = validateEvent(raw, installId, deps.cfg.MAX_ELAPSED_MS);
    if (!v.ok) {
      const seq = (raw as { seq?: unknown } | null)?.seq;
      results[i] = rejected(typeof seq === 'number' && Number.isSafeInteger(seq) ? seq : -1, v.code);
      return;
    }
    const parent = res7Parent(v.event.cell); // R7.1: route by the parent of the event's own cell
    const g = groups.get(parent) ?? { idx: [], events: [] };
    g.idx.push(i);
    g.events.push(toAreaEvent(v.event, receiveTimeMs));
    groups.set(parent, g);
  });

  let retryAfterMs = 0;
  // R7.2: one actor call per parent. A failing actor affects only its own events (R8.2).
  await Promise.all(
    [...groups].map(async ([parent, g]) => {
      let res: AreaResponse | undefined;
      try {
        res = await deps.area.ingest(parent, { parent, receiveTimeMs, events: g.events });
        if (res.results.length !== g.events.length) res = undefined;
      } catch {
        res = undefined;
      }
      g.idx.forEach((i, k) => {
        const seq = g.events[k].seq;
        const r = res?.results[k];
        if (!r) results[i] = rejected(seq, 'UNAVAILABLE');
        else if (r.status === 'rejected') results[i] = rejected(seq, r.code ?? 'UNAVAILABLE');
        else results[i] = { seq, status: r.status };
      });
      retryAfterMs = Math.max(retryAfterMs, res?.retryAfterMs ?? 0);
    }),
  );

  const out: EventsResponse = retryAfterMs > 0 ? { results, retryAfterMs } : { results };
  // R6.2: HTTP 429 with a retry hint when nothing at all got through because of the rate limit.
  const allLimited = results.length > 0 && results.every((r) => r.code === 'RATE_LIMITED');
  return allLimited ? json(429, out, retryHeader(retryAfterMs)) : json(200, out);
}

async function authorized(req: Request, installId: string, deps: Deps, checkRevoked: boolean): Promise<boolean> {
  const token = bearer(req);
  if (!(await verifyToken(deps.secret as string, installId, token))) return false;
  if (checkRevoked && (await deps.registry.isRevoked(installId))) return false; // R10.2, R12.2
  return true;
}

// ---- POST /v1/delete -------------------------------------------------------------------------------------------

async function deleteData(req: Request, deps: Deps): Promise<Response> {
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseDeleteRequest(body.value, deps.cfg.MAX_DELETE_CELLS);
  if (!parsed.ok) return fail(400, 'malformed');
  const { installId, cells, pairIds }: DeleteRequest & { pairIds: string[] } = parsed;
  // A revoked token may still delete: if a previous attempt failed half-way, the retry must be able to finish (ADR 0003 addendum).
  if (!(await authorized(req, installId, deps, false))) return fail(401, 'unauthorized');
  await deps.registry.revoke(installId); // first, so late uploads stop before the rows go
  for (const id of pairIds) deps.pairing.forgetPair(id);
  const parents = [...new Set(cells.map(res7Parent))];
  // Home Watch (R7.4): the install's own shard (as a station) and the shard of every pair it lists (as a viewer).
  const shards = new Set([shardFromHash(await hashInstallId(installId)), ...pairIds.map(shardOfPairId)]);
  let rows = 0;
  try {
    const [counts, telemetryRows] = await Promise.all([
      Promise.all([
        ...parents.map((p) => deps.area.deleteInstall(p, installId)),
        ...[...shards].map((sh) => deps.pairing.deleteInstall(sh, installId)),
      ]),
      deps.telemetry.deleteInstall(installId), // device-day rows keyed by the install ID (field-telemetry R1.4)
    ]);
    rows = counts.reduce((a, b) => a + b, 0) + telemetryRows;
  } catch {
    return fail(502, 'delete_incomplete'); // the phone retries; the token is revoked but still accepted here
  }
  return json(200, { deleted: true, areas: parents.length, rows });
}

// ---- POST /v1/pair/offer, /v1/pair/claim, /v1/pair/remove (home-watch R1) --------------------------------------------

const NOT_FOUND = () => fail(404, 'not_found'); // the one answer for every failed claim (R1.5, design section 3)
const OFFER_TRIES = 3;

async function pairOffer(req: Request, deps: Deps): Promise<Response> {
  const nowMs = deps.now();
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseOfferRequest(body.value);
  if (!parsed.ok) return fail(400, 'malformed');
  const stationInstall = parsed.value.installId;
  if (!(await authorized(req, stationInstall, deps, true))) return fail(401, 'unauthorized');
  const shard = shardFromHash(await hashInstallId(stationInstall));
  for (let i = 0; i < OFFER_TRIES; i++) {
    const code = generateCode(shard, deps.randomBytes);
    const codeHash = await hashPairingCode(deps.secret as string, code);
    const res = await deps.pairing.createOffer(shard, {
      key: keyOfCode(code),
      codeHash,
      stationInstall,
      nowMs,
      ...(parsed.value.cell ? { stationCell: parsed.value.cell } : {}),
    });
    if (res.status === 'limited') return fail(429, 'rate_limited', retryHeader(res.retryAfterMs));
    if (res.status === 'full') return fail(409, 'station_full');
    if (res.status === 'ok') {
      const out: OfferResponse = { code, expiresAtMs: res.expiresAtMs };
      return json(200, out);
    }
  }
  return fail(503, 'unavailable'); // four-symbol key taken three times: retry later
}

async function pairClaim(req: Request, deps: Deps): Promise<Response> {
  const nowMs = deps.now();
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseClaimRequest(body.value);
  if (!parsed.ok) return NOT_FOUND(); // a bad code shape is a failed claim like any other
  const c = parsed.value;
  if (!(await authorized(req, c.installId, deps, true))) return fail(401, 'unauthorized');
  const shard = shardOfCode(c.code);
  const input: ClaimInput = {
    key: keyOfCode(c.code),
    codeHash: await hashPairingCode(deps.secret as string, c.code),
    viewerInstall: c.installId,
    pairId: generatePairId(shard, deps.randomBytes),
    fcmToken: c.fcmToken,
    quietStartMin: c.quietStartMin,
    quietEndMin: c.quietEndMin,
    tzOffsetMin: c.tzOffsetMin,
    stationName: c.stationName ?? null,
    nowMs,
  };
  const res = await deps.pairing.claim(shard, input);
  if (res.status === 'limited') return fail(429, 'rate_limited', retryHeader(res.retryAfterMs));
  if (res.status === 'full') return fail(409, 'station_full');
  if (res.status === 'fail') return NOT_FOUND();
  // Home Watch (ADR 0036): tell the station's area actor to forward its events. Best effort; the pair is already made.
  if (res.stationCell) {
    try {
      await deps.area.watchStation(res7Parent(res.stationCell), res.stationInstall, shard);
    } catch {
      // the station can pair again; until then its state stays unknown
    }
  }
  const out: ClaimResponse = { pairId: res.pairId }; // no station install, no cell (R4.5, R1.7)
  return json(200, out);
}

async function pairRemove(req: Request, deps: Deps): Promise<Response> {
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseRemovePairRequest(body.value);
  if (!parsed.ok) return fail(400, 'malformed');
  const { installId, pairId } = parsed.value;
  if (!(await authorized(req, installId, deps, true))) return fail(401, 'unauthorized');
  const removed = await deps.pairing.removePair(shardOfPairId(pairId), pairId, installId);
  deps.pairing.forgetPair(pairId);
  return removed ? json(200, { removed: true }) : NOT_FOUND(); // someone else's pair looks the same as no pair
}

// ---- POST /v1/telemetry ----------------------------------------------------------------------------------------

async function telemetry(req: Request, deps: Deps): Promise<Response> {
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseDeviceDay(body.value); // R3.4: any field outside the schema is rejected; R2.3: at most 8 KiB
  if (!parsed.ok) {
    if (parsed.code === 'TOO_LARGE') return fail(413, 'body_too_large');
    return json(400, { error: 'malformed', code: parsed.code, ...(parsed.path ? { path: parsed.path } : {}) });
  }
  const d = parsed.value;
  if (!(await authorized(req, d.installId, deps, true))) return fail(401, 'unauthorized'); // revoked installs upload nothing
  const now = deps.now();
  if (!dayAcceptable(d.day, now, deps.cfg.TELEMETRY_RETENTION_MS)) return fail(400, 'bad_day');
  // A repeated upload is answered as accepted (R3.1). Only a flood from one install is limited (R3.3).
  const verdict = deps.telemetryLimiter.allow(d.installId, now);
  if (!verdict.ok) return fail(429, 'rate_limited', retryHeader(verdict.retryAfterMs));
  await deps.telemetry.putDay(d);
  return json(200, { status: 'accepted' });
}

// ---- POST /v1/follow, /v1/unfollow (alerts-and-light-alarm design 5.4, R6.1, R6.2, R8.5) ---------------------------------

async function follow(req: Request, deps: Deps): Promise<Response> {
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseFollowRequest(body.value); // strict: no extra field, a bad token or window is rejected, nothing stored
  if (!parsed.ok) return fail(400, 'malformed');
  const r = parsed.value;
  if (!(await authorized(req, r.installId, deps, true))) return fail(401, 'unauthorized');
  const verdict = deps.followLimiter.allow(r.installId, deps.now());
  if (!verdict.ok) return fail(429, 'rate_limited', retryHeader(verdict.retryAfterMs));
  await deps.alerts.follow(res7Parent(r.cell), r); // following before coverage is allowed; pushes still need a public status
  return json(200, { following: true });
}

async function unfollow(req: Request, deps: Deps): Promise<Response> {
  const body = await readJson(req, deps);
  if (!body.ok) return body.res;
  const parsed = parseUnfollowRequest(body.value);
  if (!parsed.ok) return fail(400, 'malformed');
  const r = parsed.value;
  if (!(await authorized(req, r.installId, deps, true))) return fail(401, 'unauthorized');
  const verdict = deps.followLimiter.allow(r.installId, deps.now());
  if (!verdict.ok) return fail(429, 'rate_limited', retryHeader(verdict.retryAfterMs));
  await deps.alerts.unfollow(res7Parent(r.cell), r.installId, r.cell);
  return json(200, { following: false });
}

// ---- GET /v1/home/:pairId (home-watch R4, R7.5) ------------------------------------------------------------------

/**
 * The viewer's read of one station. Authentication is the viewer's install token in `Authorization: Bearer` and its id in
 * `X-Install-Id` (a GET has no body). Only the pair's viewer gets an answer. Every other case is the same 404, so a pair id
 * cannot be probed. The answer is state and "since" only, never a cell or an install id.
 */
async function homeRoute(req: Request, deps: Deps, pairId: string): Promise<Response> {
  if (req.method !== 'GET') return fail(405, 'method_not_allowed', { allow: 'GET' });
  if (!deps.secret) return fail(500, 'server_not_configured');
  const installId = req.headers.get('x-install-id') ?? '';
  if (!isInstallId(installId) || !(await authorized(req, installId, deps, true))) return fail(401, 'unauthorized');
  if (!isPairId(pairId)) return NOT_FOUND();
  try {
    const view = await deps.pairing.home(shardOfPairId(pairId), pairId, installId, deps.now());
    return view ? json(200, view) : NOT_FOUND();
  } catch {
    return fail(503, 'unavailable');
  }
}

// ---- GET /v1/admin/field/:day ----------------------------------------------------------------------------------

const ADMIN_FIELD_PREFIX = '/v1/admin/field/';
const HOME_PREFIX = '/v1/home/';
const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Compares digests of both values, so the comparison time does not depend on where they differ or on the length. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function adminRoute(req: Request, deps: Deps, day: string): Promise<Response> {
  if (req.method !== 'GET') return fail(405, 'method_not_allowed', { allow: 'GET' });
  if (!deps.fieldToken) return fail(500, 'server_not_configured'); // no value is ever printed
  const given = bearer(req);
  if (given === '' || !(await sameSecret(given, deps.fieldToken))) return fail(401, 'unauthorized');
  if (!DAY_PATTERN.test(day)) return fail(400, 'bad_day');
  try {
    const dump = await deps.telemetry.field(day);
    return dump ? json(200, dump) : fail(400, 'bad_day');
  } catch {
    return fail(503, 'unavailable');
  }
}

// ---- GET /v1/stats ---------------------------------------------------------------------------------------------

async function stats(_req: Request, deps: Deps): Promise<Response> {
  return json(200, await deps.registry.stats()); // counters only: no install ids, no cells (R13)
}

const ROUTES: Record<string, { method: string; needsSecret: boolean; handler: (r: Request, d: Deps) => Promise<Response> }> = {
  '/v1/register': { method: 'POST', needsSecret: true, handler: register },
  '/v1/events': { method: 'POST', needsSecret: true, handler: events },
  '/v1/delete': { method: 'POST', needsSecret: true, handler: deleteData },
  '/v1/pair/offer': { method: 'POST', needsSecret: true, handler: pairOffer },
  '/v1/pair/claim': { method: 'POST', needsSecret: true, handler: pairClaim },
  '/v1/pair/remove': { method: 'POST', needsSecret: true, handler: pairRemove },
  '/v1/telemetry': { method: 'POST', needsSecret: true, handler: telemetry },
  '/v1/follow': { method: 'POST', needsSecret: true, handler: follow },
  '/v1/unfollow': { method: 'POST', needsSecret: true, handler: unfollow },
  '/v1/stats': { method: 'GET', needsSecret: false, handler: stats },
};
