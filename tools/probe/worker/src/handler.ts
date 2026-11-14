// Probe Worker routes (feasibility-probe R3). Pure: storage comes in through `Store`, so it is tested without a runtime.
// Log contract: tools/probe/contract/README.md.

export type FieldValue = string | number | boolean | null;
export type Device = { alias: string; maker: string; brand: string; androidSdk: number };
export type Row = { id: number; kind: string; monoMs: number; wallMs: number; bootCount: number; fields: Record<string, FieldValue> };
export type Export = { version: 1; devices: { device: Device; rows: Row[] }[] };
export interface Store {
  insert(device: Device, rows: Row[]): Promise<{ accepted: number; duplicates: number }>;
  exportAll(): Promise<Export>;
}

export const KINDS = ['JOB_START', 'JOB_STOP', 'PLUG', 'BATTERY', 'NOTE', 'ALARM_TEST', 'SESSION', 'UPLOAD'];
export const LIMITS = { bodyBytes: 1_000_000, rows: 500, fieldsChars: 2_000, nameChars: 40 } as const;
const ALIAS = /^[a-z0-9-]{1,32}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Constant-time token check. Both sides are hashed first so the compared buffers have equal length. */
export async function tokenOk(header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(header.slice(7))), crypto.subtle.digest('SHA-256', enc.encode(secret))]);
  // https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean };
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(a, b);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function parseDevice(v: unknown): Device | string {
  if (!isObj(v)) return 'device must be an object';
  if (typeof v.alias !== 'string' || !ALIAS.test(v.alias)) return 'alias must be 1 to 32 lower-case letters, digits or -';
  for (const k of ['maker', 'brand'] as const) if (typeof v[k] !== 'string' || (v[k] as string).length > LIMITS.nameChars) return `${k} must be a string of at most ${LIMITS.nameChars} characters`;
  if (!isInt(v.androidSdk) || v.androidSdk < 1 || v.androidSdk > 100) return 'androidSdk must be a whole number';
  return { alias: v.alias, maker: v.maker as string, brand: v.brand as string, androidSdk: v.androidSdk };
}

export function parseRow(v: unknown): Row | string {
  if (!isObj(v)) return 'row must be an object';
  if (!isInt(v.id) || v.id < 0) return 'id must be a whole number >= 0';
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind)) return 'unknown kind';
  if (!isNum(v.monoMs) || v.monoMs < 0 || !isNum(v.wallMs) || !isInt(v.bootCount)) return 'monoMs, wallMs and bootCount must be numbers';
  if (!isObj(v.fields)) return 'fields must be an object';
  for (const [k, x] of Object.entries(v.fields)) if (!(x === null || typeof x === 'string' || typeof x === 'boolean' || isNum(x))) return `field ${k} must be flat`;
  if (JSON.stringify(v.fields).length > LIMITS.fieldsChars) return 'fields too long';
  return { id: v.id, kind: v.kind, monoMs: v.monoMs, wallMs: v.wallMs, bootCount: v.bootCount, fields: v.fields as Record<string, FieldValue> };
}

export async function handle(req: Request, store: Store, secret: string | undefined): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname !== '/probe/events' && pathname !== '/probe/export') return json(404, { error: 'not found' });
  if (!secret) return json(503, { error: 'probe token not configured' });
  if (!(await tokenOk(req.headers.get('authorization'), secret))) return json(401, { error: 'unauthorized' });

  if (pathname === '/probe/export') {
    if (req.method !== 'GET') return json(405, { error: 'use GET' });
    return json(200, await store.exportAll());
  }
  if (req.method !== 'POST') return json(405, { error: 'use POST' });
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > LIMITS.bodyBytes) return json(413, { error: 'body too large' });
  const text = await req.text();
  if (text.length > LIMITS.bodyBytes) return json(413, { error: 'body too large' });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(400, { error: 'body is not JSON' }); }
  if (!isObj(body) || !Array.isArray(body.rows)) return json(400, { error: 'expected { device, rows }' });
  const device = parseDevice(body.device);
  if (typeof device === 'string') return json(400, { error: device });
  if (body.rows.length > LIMITS.rows) return json(413, { error: `at most ${LIMITS.rows} rows per request` });
  const rows: Row[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const r = parseRow(body.rows[i]);
    if (typeof r === 'string') return json(400, { error: `row ${i}: ${r}` }); // whole batch refused; the phone keeps it
    rows.push(r);
  }
  return json(200, await store.insert(device, rows));
}
