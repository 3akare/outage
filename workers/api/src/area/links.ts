// Linking (area-cells task 5, R6, properties A4 and A5). Pure. Links and groups are a function of the set of outage
// records in the trailing 7 days, so they can be rebuilt at any time and do not depend on recording order (R6.6).
import { type Group, groupKey } from './scope.ts';

export const LINK_WINDOW_MS = 7 * 86_400_000; // R6.1
export const LINK_MIN_CO_OUTAGES = 3; // R6.1, R6.3

/**
 * An outage seen by the area actor, with its own private per-cell count of eligible drops (design section 6). Internal,
 * never published. `dropsByCell` holds only counts, no install IDs (R14.2).
 */
export interface OutageRecord {
  outageKey: string;
  startMs: number;
  dropsByCell: Readonly<Record<string, number>>;
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Records with the same key are one outage: keep the earliest start and the largest drop count per cell. */
function dedupe(records: readonly OutageRecord[]): OutageRecord[] {
  const by = new Map<string, OutageRecord>();
  for (const r of records) {
    const cur = by.get(r.outageKey);
    if (!cur) {
      by.set(r.outageKey, { ...r, dropsByCell: { ...r.dropsByCell } });
      continue;
    }
    const drops: Record<string, number> = { ...cur.dropsByCell };
    for (const [c, n] of Object.entries(r.dropsByCell)) drops[c] = Math.max(drops[c] ?? 0, n);
    by.set(r.outageKey, { outageKey: r.outageKey, startMs: Math.min(cur.startMs, r.startMs), dropsByCell: drops });
  }
  return [...by.values()];
}

/** Cells with at least one eligible drop (R6.2). */
const droppedCells = (r: OutageRecord): string[] =>
  Object.entries(r.dropsByCell)
    .filter(([, n]) => n >= 1)
    .map(([c]) => c)
    .sort();

/** Co-outage count per pair within the trailing 7 days; each outage counts once per pair (R6.2). Same-parent pairs only (R6.7). */
export function coOutageCounts(
  records: readonly OutageRecord[],
  nowMs: number,
  parentOf: (cell: string) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of dedupe(records)) {
    if (nowMs - r.startMs > LINK_WINDOW_MS || r.startMs > nowMs) continue;
    const cells = droppedCells(r);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        if (parentOf(cells[i]) !== parentOf(cells[j])) continue;
        const k = pairKey(cells[i], cells[j]);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Pairs linked exactly when they have 3 or more co-outages in the trailing 7 days (A4). Sorted. */
export function linkedPairs(
  records: readonly OutageRecord[],
  nowMs: number,
  parentOf: (cell: string) => string,
): string[] {
  const out: string[] = [];
  for (const [k, n] of coOutageCounts(records, nowMs, parentOf)) if (n >= LINK_MIN_CO_OUTAGES) out.push(k);
  return out.sort();
}

/** Groups are the connected components of the links (R6.4, A5). Cells sorted inside, groups sorted by key. */
export function groupsFromLinks(pairs: readonly string[]): Group[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string;
    parent.set(x, r);
    return r;
  };
  for (const p of pairs) {
    const [a, b] = p.split('|');
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      const [lo, hi] = ra < rb ? [ra, rb] : [rb, ra];
      parent.set(hi, lo);
    }
  }
  const comps = new Map<string, string[]>();
  for (const c of parent.keys()) {
    const r = find(c);
    comps.set(r, [...(comps.get(r) ?? []), c]);
  }
  return [...comps.values()]
    .map((cells) => ({ cells: cells.sort() }))
    .sort((a, b) => (groupKey(a.cells) < groupKey(b.cells) ? -1 : 1));
}

export interface LinkDiff {
  formed: string[];
  removed: string[];
}
export function diffLinks(prev: readonly string[], next: readonly string[]): LinkDiff {
  const p = new Set(prev);
  const n = new Set(next);
  return { formed: next.filter((k) => !p.has(k)), removed: prev.filter((k) => !n.has(k)) };
}

export interface GroupPlan {
  create: Group[]; // build the engine by replaying the pooled events
  retire: string[]; // group keys whose engine state is dropped
}
/** Which GROUP engines to create or retire when the groups change (design section 6). Unchanged groups keep their engine. */
export function planGroups(prev: readonly Group[], next: readonly Group[]): GroupPlan {
  const sig = (g: Group): string => [...g.cells].sort().join(',');
  const prevSig = new Set(prev.map(sig));
  const nextSig = new Set(next.map(sig));
  return {
    create: next.filter((g) => !prevSig.has(sig(g))),
    retire: prev.filter((g) => !nextSig.has(sig(g))).map((g) => groupKey(g.cells)),
  };
}

/** Drop records older than the window. Safe at any time because older records never count. */
export function pruneRecords(records: readonly OutageRecord[], nowMs: number): OutageRecord[] {
  return records.filter((r) => nowMs - r.startMs <= LINK_WINDOW_MS);
}
