// Public view builder (area-cells task 8, R9, ADR 0007, property A8). Pure.
// The view is built field by field from a whitelist. Nothing from the input is copied wholesale, so an install ID or a
// small count in the input cannot reach the output.

export const MIN_PUBLIC_MEMBERS = 3; // R9.1, ADR 0007
export const HISTORY_MS = 30 * 86_400_000;

export type ScopeKind = 'CELL' | 'GROUP' | 'PARENT';
export type Precision = 'CELL' | 'LINKED' | 'COARSE';
export type PublicLevel = 'POSSIBLE' | 'CONFIRMED';

export const PRECISION_OF: Record<ScopeKind, Precision> = { CELL: 'CELL', GROUP: 'LINKED', PARENT: 'COARSE' };

export interface PublicHistoryItem {
  startMs: number;
  endMs: number | null; // null = end unknown
  level: PublicLevel;
  precision: Precision;
}
export interface PublicScopeView {
  scopeKind: ScopeKind;
  precision: Precision;
  boundary: string[];
  status: 'NORMAL' | 'POSSIBLE' | 'CONFIRMED';
  openOutage?: { startMs: number; level: PublicLevel; precision: Precision };
  lastRestoredAtMs?: number;
  history30d: PublicHistoryItem[];
  phones: '3+';
}

/** What the builder reads. Extra properties are tolerated and ignored. `level` is a string because the engine also has private levels. */
export interface ViewOutage {
  startMs: number;
  endMs: number | null;
  level: string; // only POSSIBLE and CONFIRMED are public; SPOT_ONLY and anything else is dropped (R9.5)
  precision: Precision;
}
export interface ViewInput {
  scopeKind: ScopeKind;
  parent: string; // res-7 parent of the scope (used as the PARENT boundary)
  cells: readonly string[]; // res-8 cells of the scope: one for CELL, the group's cells for GROUP, ignored for PARENT
  members: number; // members of the whole scope, weight >= 0.5 (internal)
  outages: readonly ViewOutage[];
  nowMs: number;
}

const isPublicLevel = (l: string): l is PublicLevel => l === 'POSSIBLE' || l === 'CONFIRMED';

/** Union of the scope's cells, sorted and de-duplicated. No inner cell is marked (design section 5, rule 3). */
export function boundaryOf(kind: ScopeKind, parent: string, cells: readonly string[]): string[] {
  if (kind === 'PARENT') return [parent];
  return [...new Set(cells)].sort();
}

/** Null when the scope may not be published (R9.1, R9.2, R9.6): the page then shows an install invitation. */
export function buildPublicView(input: ViewInput): PublicScopeView | null {
  if (!(input.members >= MIN_PUBLIC_MEMBERS)) return null;
  const boundary = boundaryOf(input.scopeKind, input.parent, input.cells);
  if (boundary.length === 0) return null;

  const items: PublicHistoryItem[] = [];
  let open: PublicHistoryItem | undefined;
  let restored: number | undefined;
  for (const o of input.outages) {
    if (!isPublicLevel(o.level)) continue;
    const item: PublicHistoryItem = { startMs: o.startMs, endMs: o.endMs, level: o.level, precision: o.precision };
    if (o.endMs === null) {
      if (!open || o.startMs > open.startMs) open = item;
    } else if (restored === undefined || o.endMs > restored) restored = o.endMs;
    if ((o.endMs ?? o.startMs) >= input.nowMs - HISTORY_MS) items.push(item);
  }
  items.sort((a, b) => b.startMs - a.startMs || (a.endMs ?? Infinity) - (b.endMs ?? Infinity) || (a.level < b.level ? -1 : a.level > b.level ? 1 : 0));

  const view: PublicScopeView = {
    scopeKind: input.scopeKind,
    precision: PRECISION_OF[input.scopeKind],
    boundary,
    status: open ? open.level : 'NORMAL',
    history30d: items,
    phones: '3+',
  };
  if (open) view.openOutage = { startMs: open.startMs, level: open.level, precision: open.precision };
  if (restored !== undefined) view.lastRestoredAtMs = restored;
  return view;
}
