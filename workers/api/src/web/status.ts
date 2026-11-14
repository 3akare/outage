// Status derivation (design section 4, R2.5). Pure: the clock is an input.
import { cellToChildren, getResolution } from 'h3-js';
import type { Precision, PublicOutage, PublicScopeView } from './public-view.ts';
import type { PublicStateKey } from './strings.ts';

/** "Restored" shows for 24 hours after an outage ends, then the area is Normal. Starting value, tunable (design section 4). */
export const RESTORED_DISPLAY_MS = 24 * 60 * 60 * 1000;
/** An open outage older than this with no restore is shown as "End unknown" (design section 11). */
export const END_UNKNOWN_AFTER_MS = 12 * 60 * 60 * 1000;
export const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type AreaStatus =
  | { kind: 'NO_COVERAGE' }
  | { kind: PublicStateKey; precision: Precision; sinceMs?: number; endUnknown: boolean };

const ORDER: Record<PublicStateKey, number> = { CONFIRMED: 3, POSSIBLE: 2, RESTORED: 1, NORMAL: 0 };
const PRECISION_RANK: Record<Precision, number> = { CELL: 2, LINKED: 1, COARSE: 0 };

const COVERED = new WeakMap<PublicScopeView, Set<string>>();

/** The res-8 cells a view covers. A parent boundary (res 7) covers its children. */
export function coveredCells(view: PublicScopeView): Set<string> {
  const cached = COVERED.get(view);
  if (cached) return cached;
  const out = new Set<string>();
  for (const c of view.boundary) {
    if (getResolution(c) === 8) out.add(c);
    else for (const child of cellToChildren(c, 8)) out.add(child);
  }
  COVERED.set(view, out);
  return out;
}

type ViewLevel = { level: PublicStateKey; sinceMs?: number; endUnknown: boolean };

function viewLevel(view: PublicScopeView, nowMs: number): ViewLevel {
  const open = view.openOutage;
  let level: PublicStateKey | null = null;
  if (open) level = open.level === 'CONFIRMED' || view.status === 'CONFIRMED' ? 'CONFIRMED' : 'POSSIBLE';
  else if (view.status !== 'NORMAL') level = view.status;
  if (level) {
    return { level, sinceMs: open?.startMs, endUnknown: open !== undefined && nowMs - open.startMs > END_UNKNOWN_AFTER_MS };
  }
  if (view.lastRestoredAtMs !== undefined && nowMs - view.lastRestoredAtMs >= 0 && nowMs - view.lastRestoredAtMs < RESTORED_DISPLAY_MS) {
    return { level: 'RESTORED', sinceMs: view.lastRestoredAtMs, endUnknown: false };
  }
  return { level: 'NORMAL', endUnknown: false };
}

/** Status of a set of cells from the views that cover any of them. */
export function statusForCells(cells: readonly string[], views: readonly PublicScopeView[], nowMs: number): AreaStatus {
  const wanted = new Set(cells);
  let best: { l: ViewLevel; precision: Precision } | null = null;
  for (const view of views) {
    let covers = false;
    for (const c of coveredCells(view)) {
      if (wanted.has(c)) {
        covers = true;
        break;
      }
    }
    if (!covers) continue;
    const l = viewLevel(view, nowMs);
    if (
      !best ||
      ORDER[l.level] > ORDER[best.l.level] ||
      (ORDER[l.level] === ORDER[best.l.level] && PRECISION_RANK[view.precision] > PRECISION_RANK[best.precision])
    ) {
      best = { l, precision: view.precision };
    }
  }
  if (!best) return { kind: 'NO_COVERAGE' };
  return { kind: best.l.level, precision: best.precision, sinceMs: best.l.sinceMs, endUnknown: best.l.endUnknown };
}

/** areaStatus(area, views) from design section 4. */
export function areaStatus(area: { cells: readonly string[] }, views: readonly PublicScopeView[], nowMs: number): AreaStatus {
  return statusForCells(area.cells, views, nowMs);
}

/** Outages of the last 30 days from the views covering the cells, newest first, duplicates removed. */
export function historyForCells(cells: readonly string[], views: readonly PublicScopeView[], nowMs: number): PublicOutage[] {
  const wanted = new Set(cells);
  const seen = new Set<string>();
  const out: PublicOutage[] = [];
  const add = (o: PublicOutage) => {
    const end = o.endMs ?? nowMs;
    if (end < nowMs - HISTORY_WINDOW_MS) return;
    const key = `${o.startMs}|${o.level}|${o.precision}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(o);
  };
  for (const view of views) {
    let covers = false;
    for (const c of coveredCells(view)) {
      if (wanted.has(c)) {
        covers = true;
        break;
      }
    }
    if (!covers) continue;
    if (view.openOutage) add({ ...view.openOutage, endMs: null });
    for (const o of view.history30d) add(o);
  }
  return out.sort((a, b) => b.startMs - a.startMs);
}

/** Formats a time in the catalog's offset, for example "2:14 p.m." (server-rendered, no script needed). */
export function formatClock(ms: number, tzOffsetMin: number): string {
  const d = new Date(ms + tzOffsetMin * 60_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateTime(ms: number, tzOffsetMin: number): string {
  const d = new Date(ms + tzOffsetMin * 60_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${formatClock(ms, tzOffsetMin)}`;
}

/** The JSON shape the page script polls and the area API serves (task 8). Counts are never included. */
export type AreaStatusJson = {
  state: PublicStateKey | null; // null = no public status
  precision: Precision | null;
  sinceMs: number | null;
  endUnknown: boolean;
};

export function statusJson(status: AreaStatus): AreaStatusJson {
  if (status.kind === 'NO_COVERAGE') return { state: null, precision: null, sinceMs: null, endUnknown: false };
  return { state: status.kind, precision: status.precision, sinceMs: status.sinceMs ?? null, endUnknown: status.endUnknown };
}
