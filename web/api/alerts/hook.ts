// The push hook (alerts-and-light-alarm task 5, R6.5): attach the public precision to each de-duplicated push from the area
// model. A push for a cell with no public view gets `precision: null`, and the planner drops it. Pure.
import type { PassedPush } from '../area/pushes.ts';
import type { ScopeView } from '../area/reducer.ts';
import type { Precision } from '../area/view.ts';
import type { AreaPush } from './planner.ts';

const RANK: Record<Precision, number> = { CELL: 0, LINKED: 1, COARSE: 2 };

/** The finest public precision whose boundary covers the cell: the cell itself, a linked group, or the whole parent. */
export function publicPrecision(
  cell: string,
  views: readonly ScopeView[],
  parentOfCell: (c: string) => string,
): Precision | null {
  let best: Precision | null = null;
  for (const { view } of views) {
    if (!view) continue;
    const covers =
      view.scopeKind === 'PARENT' ? view.boundary.includes(parentOfCell(cell)) : view.boundary.includes(cell);
    if (covers && (best === null || RANK[view.precision] < RANK[best])) best = view.precision;
  }
  return best;
}

export function toAreaPushes(
  passed: readonly PassedPush[],
  views: readonly ScopeView[],
  parentOfCell: (c: string) => string,
  decisionTimeMs: number,
): AreaPush[] {
  return passed.map((p) => ({
    cell: p.cell,
    episodeId: p.episodeId,
    kind: p.kind,
    decisionTimeMs,
    precision: publicPrecision(p.cell, views, parentOfCell),
  }));
}
