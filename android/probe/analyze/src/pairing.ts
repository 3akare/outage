import type { Row } from './types.ts';
import { condOf } from './timeline.ts';

export const PAIR_LIMIT_MS = 10 * 60_000;
/**
 * The job may react before the reference receiver gets the broadcast (emulator, Android 15: about 0.44 s earlier),
 * so a job event up to this long BEFORE the reference event still pairs, with a negative delay.
 */
export const PAIR_EARLY_MS = 10_000;
export type Pair = { fromId: number; toId: number; delayMs: number; cond: string };
export type Pairing = { pairs: Pair[]; missed: number[]; unpaired: number[] };

const plug = (r: Row, action: 'CONNECTED' | 'DISCONNECTED') => r.kind === 'PLUG' && r.fields.action === action;

/**
 * Pair each reference event with the earliest unclaimed job event of the same boot that lies between
 * `PAIR_EARLY_MS` before it and `limitMs` after it, without crossing an opposite reference event. Rows must be in time
 * order (parse.ts timeOrder). Reference events with no match are `missed`; job events that no reference claimed are
 * `unpaired` (for example a restart after a timeout). Nothing is guessed.
 */
function pairUp(rows: readonly Row[], isRef: (r: Row) => boolean, isOpposite: (r: Row) => boolean, isJob: (r: Row) => boolean, limitMs: number): Pairing {
  const pairs: Pair[] = [], missed: number[] = [];
  const claimed = new Set<number>();
  let cond = 'none';
  for (let i = 0; i < rows.length; i++) {
    const c = condOf(rows[i]); if (c) cond = c;
    const ref = rows[i];
    if (!isRef(ref)) continue;
    let hit: Row | null = null;
    for (let j = i - 1; j >= 0; j--) { // slightly earlier job events
      const r = rows[j];
      if (r.bootCount !== ref.bootCount || isOpposite(r) || isRef(r) || ref.monoMs - r.monoMs > PAIR_EARLY_MS) break;
      if (isJob(r) && !claimed.has(r.id)) hit = r; // keep going back: take the earliest
    }
    if (!hit) {
      for (let j = i + 1; j < rows.length; j++) {
        const r = rows[j];
        if (r.bootCount !== ref.bootCount || isOpposite(r) || r.monoMs - ref.monoMs > limitMs) break;
        if (isJob(r) && !claimed.has(r.id)) { hit = r; break; }
      }
    }
    if (hit) { claimed.add(hit.id); pairs.push({ fromId: ref.id, toId: hit.id, delayMs: hit.monoMs - ref.monoMs, cond }); }
    else missed.push(ref.id);
  }
  const unpaired = rows.filter((r) => isJob(r) && !claimed.has(r.id)).map((r) => r.id);
  return { pairs, missed, unpaired };
}

/** M2: plug-in (reference receiver) to job start. */
export const plugToStart = (rows: readonly Row[], limitMs = PAIR_LIMIT_MS) =>
  pairUp(rows, (r) => plug(r, 'CONNECTED'), (r) => plug(r, 'DISCONNECTED'), (r) => r.kind === 'JOB_START', limitMs);

/** M6: unplug (reference receiver) to job stop. */
export const unplugToStop = (rows: readonly Row[], limitMs = PAIR_LIMIT_MS) =>
  pairUp(rows, (r) => plug(r, 'DISCONNECTED'), (r) => plug(r, 'CONNECTED'), (r) => r.kind === 'JOB_STOP', limitMs);

/** M5: gap between a stop that was not a confirmed unplug and the next start of the same boot. */
export function restartGaps(rows: readonly Row[]): { reason: string; gapMs: number }[] {
  const out: { reason: string; gapMs: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.kind !== 'JOB_STOP' || r.fields.charging === false) continue;
    const next = rows.slice(i + 1).find((x) => x.kind === 'JOB_START' || x.kind === 'JOB_STOP' || x.bootCount !== r.bootCount);
    if (next && next.kind === 'JOB_START' && next.bootCount === r.bootCount) out.push({ reason: String(r.fields.stopReasonName ?? 'UNKNOWN'), gapMs: next.monoMs - r.monoMs });
  }
  return out;
}

/** M6 second half: the plug read at the stop differs from the re-read one second later. */
export function plugLag(rows: readonly Row[]): { checked: number; differ: number } {
  const stops = new Map(rows.filter((r) => r.kind === 'JOB_STOP').map((r) => [r.id, r]));
  let checked = 0, differ = 0;
  for (const r of rows) {
    if (r.kind !== 'BATTERY' || r.fields.source !== 'JOB_RECHECK' || typeof r.fields.recheckOf !== 'number') continue;
    const s = stops.get(r.fields.recheckOf);
    if (!s) continue;
    checked++;
    if (s.fields.plug !== r.fields.plug) differ++;
  }
  return { checked, differ };
}
