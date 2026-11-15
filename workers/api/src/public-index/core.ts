// Public index (web-and-area-pages task 7, R8, ADR 0010). The pure part: what the index stores and returns.
// It holds only what a public scope view contains (R8.3). Every incoming view is copied field by field from a whitelist
// and rejected if it breaks the public floor, so a bug in a publisher cannot put an install ID or a small count here (W2).
import { isCell, isParent } from '@outage/shared';
import type { OutageLevel, Precision, PublicOutage, PublicScopeView } from './public-view.ts';

export const INDEX_NAME = 'public-index';
const MAX_HISTORY = 200;

const PRECISIONS: readonly Precision[] = ['CELL', 'LINKED', 'COARSE'];
const KINDS = ['CELL', 'GROUP', 'PARENT'] as const;
const STATUSES = ['NORMAL', 'POSSIBLE', 'CONFIRMED'] as const;
const LEVELS: readonly OutageLevel[] = ['POSSIBLE', 'CONFIRMED'];
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isScopeKey = (k: unknown): k is string =>
  typeof k === 'string' &&
  /^(cell|group|parent):[0-9a-f]{15}$/.test(k) &&
  (isCell(k.slice(k.indexOf(':') + 1)) || isParent(k.slice(k.indexOf(':') + 1)));

/** A clean copy of a view, or null if it is not a valid public view. Unknown fields are dropped. */
export function sanitizeView(v: unknown): PublicScopeView | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.phones !== '3+') return null; // R9.3: never a number, never below 3
  if (!KINDS.includes(o.scopeKind as (typeof KINDS)[number])) return null;
  if (!PRECISIONS.includes(o.precision as Precision)) return null;
  if (!STATUSES.includes(o.status as (typeof STATUSES)[number])) return null;
  if (!Array.isArray(o.boundary) || o.boundary.length === 0 || o.boundary.length > 49) return null;
  const parentKind = o.scopeKind === 'PARENT';
  for (const c of o.boundary) if (!(parentKind ? isParent(c) : isCell(c))) return null;
  if (!Array.isArray(o.history30d)) return null;
  const history: PublicOutage[] = [];
  for (const h of o.history30d.slice(0, MAX_HISTORY)) {
    if (typeof h !== 'object' || h === null) return null;
    const x = h as Record<string, unknown>;
    if (!isTime(x.startMs) || !(x.endMs === null || isTime(x.endMs))) return null;
    if (!LEVELS.includes(x.level as OutageLevel) || !PRECISIONS.includes(x.precision as Precision)) return null;
    history.push({
      startMs: x.startMs,
      endMs: x.endMs,
      level: x.level as OutageLevel,
      precision: x.precision as Precision,
    });
  }
  const out: PublicScopeView = {
    scopeKind: o.scopeKind as PublicScopeView['scopeKind'],
    precision: o.precision as Precision,
    boundary: [...(o.boundary as string[])].sort(),
    status: o.status as PublicScopeView['status'],
    history30d: history,
    phones: '3+',
  };
  if (o.openOutage !== undefined) {
    const x = o.openOutage as Record<string, unknown>;
    if (typeof x !== 'object' || x === null || !isTime(x.startMs) || !LEVELS.includes(x.level as OutageLevel))
      return null;
    if (!PRECISIONS.includes(x.precision as Precision)) return null;
    out.openOutage = { startMs: x.startMs, level: x.level as OutageLevel, precision: x.precision as Precision };
  }
  if (o.lastRestoredAtMs !== undefined) {
    if (!isTime(o.lastRestoredAtMs)) return null;
    out.lastRestoredAtMs = o.lastRestoredAtMs;
  }
  return out;
}

export interface IndexBatch {
  put: { scopeKey: string; view: unknown }[];
  remove: string[];
}
export interface IndexStore {
  all(): { scopeKey: string; json: string }[];
  get(scopeKey: string): string | undefined;
  put(scopeKey: string, json: string, nowMs: number): void;
  delete(scopeKey: string): void;
  version(): number;
  setVersion(v: number): void;
}
export interface IndexSnapshot {
  version: number;
  views: PublicScopeView[];
}

/** Apply one publisher batch. Writes only rows that change (R8.2 budget). Returns how many views were rejected. */
export function applyBatch(store: IndexStore, batch: IndexBatch, nowMs: number): { changed: number; rejected: number } {
  let changed = 0;
  let rejected = 0;
  for (const { scopeKey, view } of batch.put ?? []) {
    const clean = isScopeKey(scopeKey) ? sanitizeView(view) : null;
    if (!clean) {
      rejected++;
      continue;
    }
    const j = JSON.stringify(clean);
    if (store.get(scopeKey) === j) continue;
    store.put(scopeKey, j, nowMs);
    changed++;
  }
  for (const k of batch.remove ?? []) {
    if (typeof k !== 'string' || store.get(k) === undefined) continue;
    store.delete(k);
    changed++;
  }
  if (changed > 0) store.setVersion(store.version() + 1);
  return { changed, rejected };
}

export function snapshot(store: IndexStore): IndexSnapshot {
  const rows = store.all().sort((a, b) => (a.scopeKey < b.scopeKey ? -1 : 1));
  return { version: store.version(), views: rows.map((r) => JSON.parse(r.json) as PublicScopeView) };
}
