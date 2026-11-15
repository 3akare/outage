// Push de-duplication per cell and episode (area-cells task 9, R10, property A9). Pure.
// An episode is the union of overlapping outage intervals that touch the cell. The area actor passes at most one CONFIRMED
// and one RESTORED push per cell per episode, whichever scope raised it (R10.1, R10.2). It never sends pushes itself (R10.3).

export type PushKind = 'CONFIRMED' | 'RESTORED';

export interface Episode {
  episodeId: string; // `${cell}|${startMs}`, startMs of the earliest member
  startMs: number;
  endMs: number | null; // null while any member outage is open
  pushedConfirmed: boolean;
  pushedRestored: boolean;
}
export type Episodes = Record<string, Episode[]>; // by cell

/** One push candidate from one scope's engine, for one cell the outage touches. */
export interface PushCandidate {
  cell: string;
  kind: PushKind;
  startMs: number; // outage start
  endMs: number | null; // outage end when restored, else null (open)
}

/** A push passed on to the alerts system, with the cell and episode (R10.3). */
export interface PassedPush {
  cell: string;
  episodeId: string;
  kind: PushKind;
}

const overlaps = (
  a: { startMs: number; endMs: number | null },
  b: { startMs: number; endMs: number | null },
): boolean => a.startMs <= (b.endMs ?? Number.POSITIVE_INFINITY) && b.startMs <= (a.endMs ?? Number.POSITIVE_INFINITY);

const maxEnd = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : Math.max(a, b);

/** Merge every episode that overlaps the interval into one (flags OR together), and return it with the rest. */
function join(
  list: readonly Episode[],
  c: { startMs: number; endMs: number | null; pushedConfirmed?: boolean; pushedRestored?: boolean },
): { merged: Episode; rest: Episode[]; finiteEnd: number } {
  let merged: Episode = {
    episodeId: '',
    startMs: c.startMs,
    endMs: c.endMs,
    pushedConfirmed: c.pushedConfirmed ?? false,
    pushedRestored: c.pushedRestored ?? false,
  };
  const rest: Episode[] = [];
  let finiteEnd = c.endMs ?? Number.NEGATIVE_INFINITY;
  for (const e of list) {
    if (!overlaps(e, merged)) {
      rest.push(e);
      continue;
    }
    if (e.endMs !== null) finiteEnd = Math.max(finiteEnd, e.endMs);
    merged = {
      ...merged,
      startMs: Math.min(merged.startMs, e.startMs),
      endMs: maxEnd(merged.endMs, e.endMs),
      pushedConfirmed: merged.pushedConfirmed || e.pushedConfirmed,
      pushedRestored: merged.pushedRestored || e.pushedRestored,
    };
  }
  return { merged, rest, finiteEnd };
}

/**
 * Apply one candidate. The result depends only on the episodes so far and the candidate. Joining may take several passes
 * because a bridge can make two stored episodes overlap, so repeat until stable.
 */
export function applyPush(episodes: Episodes, c: PushCandidate): { episodes: Episodes; passed: PassedPush | null } {
  let { merged, rest, finiteEnd } = join(episodes[c.cell] ?? [], c);
  for (;;) {
    const again = join(rest, merged);
    if (again.rest.length === rest.length) break;
    merged = again.merged;
    finiteEnd = Math.max(finiteEnd, again.finiteEnd);
    rest = again.rest;
  }
  // A restore closes the episode at the latest known end. A later push from a scope that is still open reopens it by merging.
  if (c.kind === 'RESTORED' && c.endMs !== null) merged = { ...merged, endMs: finiteEnd };
  merged = { ...merged, episodeId: `${c.cell}|${merged.startMs}` };
  let passed: PassedPush | null = null;
  if (c.kind === 'CONFIRMED' && !merged.pushedConfirmed) {
    merged = { ...merged, pushedConfirmed: true };
    passed = { cell: c.cell, episodeId: merged.episodeId, kind: 'CONFIRMED' };
  } else if (c.kind === 'RESTORED' && !merged.pushedRestored) {
    merged = { ...merged, pushedRestored: true };
    passed = { cell: c.cell, episodeId: merged.episodeId, kind: 'RESTORED' };
  }
  return { episodes: { ...episodes, [c.cell]: [...rest, merged].sort((a, b) => a.startMs - b.startMs) }, passed };
}

/** Candidates in a fixed order so the result does not depend on which scope reported first within one evaluation. */
export function applyPushes(
  episodes: Episodes,
  candidates: readonly PushCandidate[],
): { episodes: Episodes; passed: PassedPush[] } {
  const order = (c: PushCandidate): string => `${c.cell}|${c.kind === 'CONFIRMED' ? 0 : 1}|${c.startMs}`;
  const sorted = [...candidates].sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
  let eps = episodes;
  const passed: PassedPush[] = [];
  for (const c of sorted) {
    const r = applyPush(eps, c);
    eps = r.episodes;
    if (r.passed) passed.push(r.passed);
  }
  return { episodes: eps, passed };
}

export const EPISODE_KEEP_MS = 2 * 86_400_000;
/** Forget closed episodes that ended long ago. A later outage then opens a new episode, which is correct. */
export function pruneEpisodes(episodes: Episodes, nowMs: number): Episodes {
  const out: Episodes = {};
  for (const [cell, list] of Object.entries(episodes)) {
    const keep = list.filter((e) => e.endMs === null || nowMs - e.endMs <= EPISODE_KEEP_MS);
    if (keep.length > 0) out[cell] = keep;
  }
  return out;
}
