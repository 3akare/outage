// Neighbor table and notices (area-cells task 7, R7, property A6). Pure.

export type Level = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED';
const RANK: Record<Level, number> = { NORMAL: 0, POSSIBLE: 1, CONFIRMED: 2 };

export const NOTICE_TTL_MS = 12 * 3_600_000; // R7.3
export const MAX_FUTURE_MS = 86_400_000; // design section 11

export interface Notice {
  cell: string; // the sender's cell that is a neighbor of one of the receiver's cells
  level: Level;
  maxK: number;
  asOfMs: number;
}
export type NoticeTable = ReadonlyMap<string, Notice>;

export type MergeVerdict = 'merged' | 'ignored_not_neighbor' | 'ignored_future';

/** Total order on notices of one cell: later as-of wins, then higher level, then higher k. Makes the merge a lattice join. */
function newer(a: Notice, b: Notice): boolean {
  if (a.asOfMs !== b.asOfMs) return a.asOfMs > b.asOfMs;
  if (a.level !== b.level) return RANK[a.level] > RANK[b.level];
  return a.maxK > b.maxK;
}

/**
 * Merge one notice. Idempotent, commutative and associative per cell, so delivery order and duplicates do not change
 * the table (A6). Notices for cells that do not neighbor this actor, or dated more than a day ahead, are ignored.
 */
export function mergeNotice(
  table: NoticeTable,
  n: Notice,
  nowMs: number,
  isNeighborCell: (cell: string) => boolean,
): { table: NoticeTable; verdict: MergeVerdict } {
  if (!isNeighborCell(n.cell)) return { table, verdict: 'ignored_not_neighbor' };
  if (n.asOfMs > nowMs + MAX_FUTURE_MS) return { table, verdict: 'ignored_future' };
  const cur = table.get(n.cell);
  if (cur && !newer(n, cur)) return { table, verdict: 'merged' };
  const next = new Map(table);
  next.set(n.cell, n);
  return { table: next, verdict: 'merged' };
}

/** Level the engine hint sees: a notice older than 12 hours counts as NORMAL (R7.3). */
export function effectiveNotice(n: Notice | undefined, nowMs: number): { level: Level; maxK: number } {
  if (!n || nowMs - n.asOfMs > NOTICE_TTL_MS) return { level: 'NORMAL', maxK: 0 };
  return { level: n.level, maxK: n.maxK };
}

/** Drop notices that are expired. Safe to run at any time because expired notices read as NORMAL. */
export function pruneNotices(table: NoticeTable, nowMs: number): NoticeTable {
  const next = new Map<string, Notice>();
  for (const [c, n] of table) if (nowMs - n.asOfMs <= NOTICE_TTL_MS) next.set(c, n);
  return next.size === table.size ? table : next;
}

/** Strongest live neighbor level among `cells` (the cells touching a scope). */
export function neighborHint(table: NoticeTable, cells: readonly string[], nowMs: number): { level: Level; maxK: number } {
  let best: { level: Level; maxK: number } = { level: 'NORMAL', maxK: 0 };
  for (const c of cells) {
    const e = effectiveNotice(table.get(c), nowMs);
    if (RANK[e.level] > RANK[best.level] || (e.level === best.level && e.maxK > best.maxK)) best = e;
  }
  return best;
}

/** Scopes touching a neighbor cell (R7.6): the ones that need re-evaluation after a notice. */
export function scopesTouching<S extends { cells: readonly string[] }>(
  scopes: readonly S[],
  neighborCell: string,
  neighborsOf: (cell: string) => readonly string[],
): S[] {
  return scopes.filter((s) => s.cells.some((c) => neighborsOf(c).includes(neighborCell)));
}

/** A public scope's level after an evaluation. Only public scopes (R9.1) may produce notices (R7.2). */
export interface ScopeLevelChange {
  cells: readonly string[]; // res-8 cells of the scope
  public: boolean;
  prevLevel: Level;
  level: Level;
  maxK: number;
  asOfMs: number;
}
export interface NoticeBatch {
  toParent: string; // area actor name of the receiver
  notices: Notice[];
  /** A NORMAL notice must not create a missing actor (design section 7, R13.1). */
  createIfMissing: boolean;
}

/**
 * Notices to send after a batch of level changes (R7.1, R7.2, R13.2). Only changed, public scopes; only neighbors outside
 * this actor's parent; one batch per receiving parent; one notice per (source cell, receiver) with the highest level.
 */
export function planNotices(
  ownParent: string,
  changes: readonly ScopeLevelChange[],
  neighborsOf: (cell: string) => readonly string[],
  parentOf: (cell: string) => string,
): NoticeBatch[] {
  const byParent = new Map<string, Map<string, Notice>>();
  for (const ch of changes) {
    if (!ch.public || ch.level === ch.prevLevel) continue;
    for (const cell of ch.cells) {
      const targets = new Set<string>();
      for (const n of neighborsOf(cell)) {
        const p = parentOf(n);
        if (p !== ownParent) targets.add(p);
      }
      for (const p of targets) {
        const m = byParent.get(p) ?? new Map<string, Notice>();
        const cand: Notice = { cell, level: ch.level, maxK: ch.maxK, asOfMs: ch.asOfMs };
        const cur = m.get(cell);
        if (!cur || newer(cand, cur)) m.set(cell, cand);
        byParent.set(p, m);
      }
    }
  }
  return [...byParent.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([toParent, m]) => {
      const notices = [...m.values()].sort((a, b) => (a.cell < b.cell ? -1 : 1));
      return { toParent, notices, createIfMissing: notices.some((n) => n.level !== 'NORMAL') };
    });
}
