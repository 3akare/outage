// Hints wiring (area-cells task 6, R7.5 and R8, property A7). Pure. Builds the engine's `Context` for one scope from the
// neighbor table, the levels of linked cells and the manual-report count. The engine decides what the hints may do.
import type { Context } from '@outage/detection';
import { effectiveNotice, type Level, type NoticeTable } from './neighbors.ts';

export const MANUAL_MIN_INSTALLS = 2; // R8.2

export interface CellLevel {
  level: Level;
  maxK: number;
}

export interface HintInput {
  scopeCells: readonly string[]; // res-8 cells the scope pools
  nowMs: number;
  notices: NoticeTable; // notices from neighbor actors, per neighbor cell (R7.3)
  neighborsOf: (cell: string) => readonly string[];
  /** Levels of cells of this actor, by cell. Used for neighbors inside the parent and for linked cells. */
  localLevels: ReadonlyMap<string, CellLevel>;
  /** Cells linked to this scope's cells but outside the scope (R6, "linked" hint). Empty for GROUP and PARENT scopes. */
  linkedCells: readonly string[];
  /** Distinct installs that reported "power is out" for the scope in the last 10 minutes. Zero until a later spec (R8.3). */
  manualInstalls: number;
}

/**
 * The manual-report hint counts only when 2 or more distinct installs reported (R8.2). A single report is dropped here so
 * the engine, which treats any count of 1 or more as a hint, never sees it.
 */
export const manualHint = (distinctInstalls: number): number =>
  Number.isFinite(distinctInstalls) && distinctInstalls >= MANUAL_MIN_INSTALLS ? Math.floor(distinctInstalls) : 0;

/** Engine context for a scope (R7.5, R8). One entry per outside neighbor cell and per linked cell; NORMAL entries are kept off. */
export function buildContext(input: HintInput): Context {
  const inScope = new Set(input.scopeCells);
  const linked = new Set(input.linkedCells.filter((c) => !inScope.has(c)));
  const neighbors: Context['neighbors'] = [];
  const seen = new Set<string>();
  for (const cell of [...input.scopeCells].sort()) {
    for (const nb of [...input.neighborsOf(cell)].sort()) {
      if (inScope.has(nb) || seen.has(nb) || linked.has(nb)) continue;
      seen.add(nb);
      const e = input.localLevels.get(nb) ?? effectiveNotice(input.notices.get(nb), input.nowMs);
      if (e.level !== 'NORMAL') neighbors.push({ level: e.level, maxK: e.maxK, linked: false });
    }
  }
  for (const cell of [...linked].sort()) {
    const e = input.localLevels.get(cell) ?? effectiveNotice(input.notices.get(cell), input.nowMs);
    if (e.level !== 'NORMAL') neighbors.push({ level: e.level, maxK: e.maxK, linked: true });
  }
  return { neighbors, manualReports: manualHint(input.manualInstalls) };
}
