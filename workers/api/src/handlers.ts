// Worker request handlers (event-ingest task 4 and 9). Stateless: authenticate, validate, compute event time, group by
// res-7 parent, make one area call per parent, assemble results. No detection logic (R7.4), no IP or user agent kept (R2.4).
// Dependencies are injected so Vitest runs this without the Workers runtime.
import {
  type DeleteRequest,
  type EventResult,
  type EventsResponse,
  isPermanent,
  parseDeleteRequest,
  parseEventsRequest,
  type RegisterResponse,
  type RejectCode,
  res7Parent,
  validateEvent,
  type WireEvent,
} from '@outage/shared';
import type { AreaEvent, AreaIngestInput, AreaResponse } from './area-core.ts';
import type { Tunables } from './config.ts';
import { eventTimeMs } from './eventtime.ts';
import type { RegisterLimiter } from './limiter.ts';
import { mintInstallId, mintToken, verifyToken } from './token.ts';

export interface AreaGateway {
  ingest(parent: string, input: AreaIngestInput): Promise<AreaResponse>;
  deleteInstall(parent: string, installId: string): Promise<number>;
}
export interface RegistryGateway {
  isRevoked(installId: string): Promise<boolean>;
  revoke(installId: string): Promise<void>;
  stats(): Promise<unknown>;
}
export interface Deps {
  secret: string | undefined;
  now(): number;
  randomBytes(n: number): Uint8Array;
  /** An opaque, already-hashed key for the register limit. Must not be logged or stored. */
  sourceKey(req: Request): Promise<string> | string;
  limiter: RegisterLimiter;
  area: AreaGateway;
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
  const { installId, cells }: DeleteRequest = parsed;
  // A revoked token may still delete: if a previous attempt failed half-way, the retry must be able to finish (ADR 0003 addendum).
  if (!(await authorized(req, installId, deps, false))) return fail(401, 'unauthorized');
  await deps.registry.revoke(installId); // first, so late uploads stop before the rows go
  const parents = [...new Set(cells.map(res7Parent))];
  let rows = 0;
  try {
    const counts = await Promise.all(parents.map((p) => deps.area.deleteInstall(p, installId)));
    rows = counts.reduce((a, b) => a + b, 0);
  } catch {
    return fail(502, 'delete_incomplete'); // the phone retries; the token is revoked but still accepted here
  }
  return json(200, { deleted: true, areas: parents.length, rows });
}

// ---- GET /v1/stats ---------------------------------------------------------------------------------------------

async function stats(_req: Request, deps: Deps): Promise<Response> {
  return json(200, await deps.registry.stats()); // counters only: no install ids, no cells (R13)
}

const ROUTES: Record<string, { method: string; needsSecret: boolean; handler: (r: Request, d: Deps) => Promise<Response> }> = {
  '/v1/register': { method: 'POST', needsSecret: true, handler: register },
  '/v1/events': { method: 'POST', needsSecret: true, handler: events },
  '/v1/delete': { method: 'POST', needsSecret: true, handler: deleteData },
  '/v1/stats': { method: 'GET', needsSecret: false, handler: stats },
};
