// Router and scope selector (area-cells task 4, R4, properties A1 to A3). Pure: no storage, no clock, no runtime imports.
// A cell is evaluated in its own scope when 3 or more of its members were recently armed, else in its linked group when
// the group has 3 or more, else in the parent. An open outage keeps its own scope until it closes (R4.5).
import { counts, isRecentlyArmed, type Members } from './members.ts';
import { PRECISION_OF, type Precision, type ScopeKind } from './view.ts';

export const MIN_SCOPE_ARMED = 3; // R4.1, R4.2

export type ScopeKey = string; // "cell:ID" | "group:ID" | "parent:ID"
export const cellKey = (cell: string): ScopeKey => `cell:${cell}`;
export const parentKey = (parent: string): ScopeKey => `parent:${parent}`;
/** A group is named by its smallest cell, so the key does not depend on insertion order (R6.6). */
export const groupKey = (cells: readonly string[]): ScopeKey => `group:${[...cells].sort()[0]}`;

export interface Group {
  cells: readonly string[]; // res-8 cells, all in one parent
}

export interface ScopeRef {
  kind: ScopeKind;
  key: ScopeKey;
  precision: Precision;
  cells: readonly string[]; // res-8 cells pooled by the scope
}

export interface SelectInput {
  members: Members;
  nowMs: number;
  parent: string;
  parentCells: readonly string[]; // the res-8 children of `parent`
  groups: readonly Group[];
}

/** Recently armed members (weight >= 0.5) across `cells`. */
export function armedIn(members: Members, cells: readonly string[], nowMs: number): number {
  const set = new Set(cells);
  let n = 0;
  for (const m of members.values()) if (set.has(m.cell) && counts(m) && isRecentlyArmed(m, nowMs)) n++;
  return n;
}

export function groupOf(groups: readonly Group[], cell: string): Group | undefined {
  return groups.find((g) => g.cells.includes(cell));
}

const scopeOf = (kind: ScopeKind, key: ScopeKey, cells: readonly string[]): ScopeRef => ({
  kind,
  key,
  precision: PRECISION_OF[kind],
  cells: [...cells].sort(),
});

/** The scope a cell is evaluated in for new outages (R4.1, R4.2). A pure function of members, groups and time (A1). */
export function selectScope(cell: string, input: SelectInput): ScopeRef {
  if (armedIn(input.members, [cell], input.nowMs) >= MIN_SCOPE_ARMED) return scopeOf('CELL', cellKey(cell), [cell]);
  const g = groupOf(input.groups, cell);
  if (g && armedIn(input.members, g.cells, input.nowMs) >= MIN_SCOPE_ARMED)
    return scopeOf('GROUP', groupKey(g.cells), g.cells);
  return scopeOf('PARENT', parentKey(input.parent), input.parentCells);
}

/** Scopes that receive an event of `cell` (R4.4): its cell, its group if any, and the parent. At most three. */
export function routeScopes(cell: string, input: Pick<SelectInput, 'parent' | 'parentCells' | 'groups'>): ScopeRef[] {
  const out = [scopeOf('CELL', cellKey(cell), [cell])];
  const g = groupOf(input.groups, cell);
  if (g) out.push(scopeOf('GROUP', groupKey(g.cells), g.cells));
  out.push(scopeOf('PARENT', parentKey(input.parent), input.parentCells));
  return out;
}

export type Level = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED';
const RANK: Record<Level, number> = { NORMAL: 0, POSSIBLE: 1, CONFIRMED: 2 };
const KIND_RANK: Record<ScopeKind, number> = { CELL: 0, GROUP: 1, PARENT: 2 };

/** An outage that is open in some scope. Its scope stays alive until it closes, whatever membership says (R4.5). */
export interface OpenOutage {
  outageId: string;
  scope: ScopeRef;
  level: 'POSSIBLE' | 'CONFIRMED';
  /** Cells whose selected scope was this one when the outage opened (design section 4). Defaults to all scope cells. */
  shownFor?: readonly string[];
}

const showsFor = (o: OpenOutage, cell: string): boolean => (o.shownFor ?? o.scope.cells).includes(cell);

/** Scopes that must keep their engine alive because an outage is open there and touches `cell`. */
export function pinnedScopes(cell: string, open: readonly OpenOutage[]): ScopeRef[] {
  const seen = new Set<ScopeKey>();
  const out: ScopeRef[] = [];
  for (const o of open) {
    if (!showsFor(o, cell) || seen.has(o.scope.key)) continue;
    seen.add(o.scope.key);
    out.push(o.scope);
  }
  return out;
}

export interface CellStatus {
  level: Level;
  scope: ScopeRef;
  outageId?: string;
}

/**
 * What the cell shows (R4.3, R4.5, R4.6). An open outage touching the cell wins, from its own scope: highest level,
 * then the finest scope, then the key. Otherwise the selected scope with NORMAL. A CONFIRMED at CELL precision for a cell
 * with fewer than 3 recently armed members is shown as POSSIBLE (A2); the engine is the first guard, this is the last.
 */
export function cellStatus(cell: string, input: SelectInput, open: readonly OpenOutage[]): CellStatus {
  const touching = open.filter((o) => showsFor(o, cell));
  if (touching.length === 0) return { level: 'NORMAL', scope: selectScope(cell, input) };
  const best = [...touching].sort(
    (a, b) =>
      RANK[b.level] - RANK[a.level] ||
      KIND_RANK[a.scope.kind] - KIND_RANK[b.scope.kind] ||
      (a.scope.key < b.scope.key ? -1 : a.scope.key > b.scope.key ? 1 : 0) ||
      (a.outageId < b.outageId ? -1 : 1),
  )[0];
  let level: Level = best.level;
  if (
    best.scope.kind === 'CELL' &&
    level === 'CONFIRMED' &&
    armedIn(input.members, [cell], input.nowMs) < MIN_SCOPE_ARMED
  ) {
    level = 'POSSIBLE';
  }
  return { level, scope: best.scope, outageId: best.outageId };
}
