// Hints from other scopes (R7). They never change k, n, mu or p; they raise an outage by one step at most.
import type { Context, HintKind, OutageLevel } from './types.ts';

export type HintResult = { level: OutageLevel; raisedBy?: HintKind };

const validNeighbor = (x: Context['neighbors'][number]): boolean =>
  typeof x === 'object' &&
  x !== null &&
  (x.level === 'NORMAL' || x.level === 'POSSIBLE' || x.level === 'CONFIRMED') &&
  Number.isFinite(x.maxK) &&
  x.maxK >= 0;

/** Reasons for hints that are ignored (NaN, negative, wrong level). */
export function hintProblems(ctx: Context): { reason: string }[] {
  const out: { reason: string }[] = [];
  for (const n of ctx.neighbors) if (!validNeighbor(n)) out.push({ reason: 'neighbor hint ignored: invalid values' });
  if (!(Number.isFinite(ctx.manualReports) && ctx.manualReports >= 0)) {
    out.push({ reason: 'manualReports ignored: invalid value' });
  }
  return out;
}

/**
 * Raise `level` one step when a hint applies. A raise to CONFIRMED needs k >= `confirmMinK` here or in a hinting scope.
 * Hint order when several apply: NEIGHBOR, LINKED, MANUAL. A manual report counts when manualReports >= 1.
 */
export function applyHints(level: OutageLevel, kHere: number, ctx: Context, confirmMinK: number): HintResult {
  if (level === 'CONFIRMED') return { level };
  const neighbors = ctx.neighbors.filter((x) => validNeighbor(x) && x.level !== 'NORMAL');
  const plain = neighbors.filter((x) => !x.linked);
  const linked = neighbors.filter((x) => x.linked);
  const manual = Number.isFinite(ctx.manualReports) && ctx.manualReports >= 1;
  let raisedBy: HintKind | undefined;
  let kElsewhere = 0;
  if (plain.length > 0) {
    raisedBy = 'NEIGHBOR';
    kElsewhere = Math.max(...plain.map((x) => x.maxK));
  } else if (linked.length > 0) {
    raisedBy = 'LINKED';
    kElsewhere = Math.max(...linked.map((x) => x.maxK));
  } else if (manual) raisedBy = 'MANUAL';
  if (!raisedBy) return { level };
  const allK = Math.max(kHere, kElsewhere, ...neighbors.map((x) => x.maxK));
  if (allK < confirmMinK) return { level };
  return { level: 'CONFIRMED', raisedBy };
}
