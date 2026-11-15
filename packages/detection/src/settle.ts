// Settle, archive, migrate (R16, design section 8).
//
// Settle folds everything older than a cut T <= nowMs - horizon. T is a "quiet" instant: no outage covers it and no event
// lies in [T - W, T). At a quiet instant the sweep from T onward needs only: per-install armed state, the times of
// each install's isolated unplugs inside the weight look-back, the baseline totals, and the REPLUG delay samples. Those
// are carried, so the sweep over the retained events gives the same decisions as the sweep over everything (D5).
import { hasOwn } from './merge.ts';
import type { Params } from './params.ts';
import { type OutageRec, outageEndMs, type SweepResult } from './sweep.ts';
import { T_ARMED, T_BATTERY_FULL, T_DISARMED, T_REPLUG, T_UNPLUG } from './merge.ts';
import { DAY_MS, dayStartMs, localDay } from './time.ts';
import {
  type ArchiveOutage,
  type DayBucket,
  type Decision,
  type EngineState,
  type InstallCarry,
  type InstallPart,
  MAX_DELAY_SAMPLES,
  STATE_VERSION,
} from './types.ts';

export class StateVersionError extends Error {
  readonly found: unknown;
  constructor(found: unknown) {
    super(`unsupported engine state version: ${String(found)}`);
    this.name = 'StateVersionError';
    this.found = found;
  }
}

export function emptyState(): EngineState {
  return {
    version: STATE_VERSION,
    cutMs: null,
    installs: {},
    baseline: { accDay: null, c: new Array(24).fill(0), e: new Array(24).fill(0), days: {} },
    delays: [],
    archive: [],
    pushed: [],
    decisions: [],
  };
}

/** Upgrade a stored state to the current version. Unknown versions throw so the caller can rebuild from events. */
export function migrate(raw: unknown): EngineState {
  if (typeof raw !== 'object' || raw === null) throw new StateVersionError(undefined);
  const v = (raw as { version?: unknown }).version;
  if (v === STATE_VERSION) return raw as EngineState;
  throw new StateVersionError(v);
}

/** Delete-my-data (R16.5): remove one install from the state. Archive records hold counts only and stay unchanged. */
export function removeInstall(state: EngineState, installId: string): EngineState {
  if (!hasOwn(state.installs, installId)) return state;
  const installs = { ...state.installs };
  delete installs[installId];
  return { ...state, installs };
}

/** Armed state of an install at instant `t`, replaying its stored events below `t` on top of the old carry. */
function armedStateAt(part: InstallPart, t: number, params: Params): { startMs: number; lastSeenMs: number } | null {
  let open: { start: number; lastSeen: number } | null = part.carry?.armed
    ? { start: part.carry.armed.startMs, lastSeen: part.carry.armed.lastSeenMs }
    : null;
  for (const e of part.events) {
    if (e[2] >= t) break;
    if (open && e[2] > open.lastSeen + params.staleArmedMs) open = null;
    if (e[1] === T_ARMED || e[1] === T_REPLUG) {
      if (open) open.lastSeen = e[2];
      else open = { start: e[2], lastSeen: e[2] };
    } else if (e[1] === T_BATTERY_FULL) {
      if (open) open.lastSeen = e[2];
    } else if (e[1] === T_DISARMED || e[1] === T_UNPLUG) open = null;
  }
  if (open && open.lastSeen + params.staleArmedMs <= t - params.windowMs) return null;
  return open ? { startMs: open.start, lastSeenMs: open.lastSeen } : null;
}

const closeAt = (o: OutageRec, nowMs: number, params: Params): number =>
  o.closedBy === 'RESTORED' || o.closedBy === 'EXPIRED' || nowMs > o.startMs + params.unknownEndMs
    ? o.closedBy === 'RESTORED'
      ? outageEndMs(o, params)
      : o.startMs + params.unknownEndMs
    : Number.POSITIVE_INFINITY;

function findCut(state: EngineState, sw: SweepResult, nowMs: number, params: Params): number | null {
  const cutoff = nowMs - params.horizonMs;
  const times: number[] = [];
  for (const id of Object.keys(state.installs)) for (const e of state.installs[id].events) times.push(e[2]);
  if (times.length === 0) return null;
  times.sort((a, b) => a - b);
  const spans = sw.outages.map((o) => [o.startMs, closeAt(o, nowMs, params)] as const);
  const W = params.windowMs;
  const cands = new Set<number>([cutoff]);
  for (const t of times) cands.add(t + W + 1);
  for (const [, end] of spans) if (Number.isFinite(end)) cands.add(end + 1);
  const lowest = state.cutMs ?? times[0];
  const hasEventIn = (lo: number, hi: number): boolean => {
    let a = 0;
    let b = times.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (times[m] < lo) a = m + 1;
      else b = m;
    }
    return a < times.length && times[a] < hi;
  };
  const ordered = [...cands].filter((c) => c <= cutoff && c > lowest).sort((a, b) => b - a);
  for (const T of ordered) {
    if (hasEventIn(T - W, T)) continue;
    if (spans.some(([s, e]) => s <= T && T <= e)) continue;
    return T;
  }
  return null;
}

export type SettleResult = { state: EngineState; archivedIds: Set<string> };

export function settle(
  state: EngineState,
  sw: SweepResult,
  decisions: Decision[],
  nowMs: number,
  params: Params,
): SettleResult {
  const T = findCut(state, sw, nowMs, params);
  if (T === null) return { state, archivedIds: new Set() };
  const off = params.localOffsetMs;
  const L = params.weight.lookbackMs;
  const oldCut = state.cutMs ?? Number.NEGATIVE_INFINITY;

  // ---- baseline: fold complete days into the decayed totals, keep the cut day's pre-cut part raw
  const dT = localDay(T, off);
  const activeDays = new Set<number>(Object.keys(state.baseline.days).map(Number));
  for (const rt of sw.rts.values()) {
    for (const u of rt.unplugs) if (!u.fromCarry && u.t < T && u.t >= oldCut) activeDays.add(localDay(u.t, off));
    const ivs = [...rt.intervals];
    if (rt.open) ivs.push({ start: rt.open.start, end: rt.open.lastSeen + params.staleArmedMs });
    for (const iv of ivs) {
      const s = Math.max(iv.start, oldCut);
      const e = Math.min(iv.end, T);
      if (e > s) for (let d = localDay(s, off); d <= localDay(e - 1, off); d++) activeDays.add(d);
    }
  }
  let c = state.baseline.c.slice();
  let e = state.baseline.e.slice();
  let acc = state.baseline.accDay;
  const days: Record<string, DayBucket> = {};
  for (const d of [...activeDays].filter((x) => x <= dT).sort((a, b) => a - b)) {
    const part = sw.computeBucket(d, oldCut, T);
    const raw = hasOwn(state.baseline.days, String(d)) ? state.baseline.days[String(d)] : null;
    const dc = part.c.map((x, h) => x + (raw ? raw.c[h] : 0));
    const de = part.e.map((x, h) => x + (raw ? raw.e[h] : 0));
    if (!dc.some((x) => x > 0) && !de.some((x) => x > 0)) continue;
    if (d < dT) {
      if (acc === null) {
        c = dc;
        e = de;
      } else {
        const f = params.baseline.dailyDecay ** (d - acc);
        c = c.map((x, h) => x * f + dc[h]);
        e = e.map((x, h) => x * f + de[h]);
      }
      acc = d;
    } else days[String(d)] = { c: dc, e: de };
  }

  // ---- archive outages that ended before the cut
  const archive: ArchiveOutage[] = [...state.archive];
  const archivedIds = new Set<string>();
  for (const o of sw.outages) {
    if (closeAt(o, nowMs, params) >= T) continue;
    const closing = decisions.find((d) => d.outageId === o.id && (d.kind === 'RESTORED' || d.kind === 'ENDED_UNKNOWN'));
    if (!closing) continue;
    archivedIds.add(o.id);
    archive.push({
      id: o.id,
      startMs: o.startMs,
      status: closing.kind === 'RESTORED' ? 'RESTORED' : 'ENDED_UNKNOWN',
      level: closing.level,
      endMs: closing.restoredAtMs ?? null,
      explanation: closing.explanation,
    });
  }

  // ---- installs: drop events below T, carry armed state and isolated unplugs
  const installs: Record<string, InstallPart> = {};
  for (const id of Object.keys(state.installs)) {
    const part = state.installs[id];
    const rt = sw.rts.get(id);
    const events = part.events.filter((x) => x[2] >= T);
    const droppedUnplugs = new Set(part.events.filter((x) => x[2] < T && x[1] === T_UNPLUG).map((x) => x[0]));
    const labels = part.labels.filter((x) => !droppedUnplugs.has(x[0]));
    const armed = armedStateAt(part, T, params);
    const isolatedMs = rt
      ? rt.unplugs.filter((u) => u.t < T && u.t > T - L && (u.human || u.outage === null)).map((u) => u.t).sort((a, b) => a - b)
      : [];
    const carry: InstallCarry | undefined = armed || isolatedMs.length > 0 ? { armed, isolatedMs } : undefined;
    if (events.length === 0 && !carry && labels.length === 0) continue;
    installs[id] = { events, labels, ...(carry ? { carry } : {}) };
  }

  const delays = sw.delays.filter((x) => x[0] < T).slice(-MAX_DELAY_SAMPLES);
  return {
    archivedIds,
    state: {
      ...state,
      cutMs: T,
      installs,
      baseline: { accDay: acc, c, e, days },
      delays,
      archive,
      pushed: state.pushed.filter((p) => p.startMs >= T - params.unknownEndMs - params.windowMs),
    },
  };
}

export { DAY_MS, dayStartMs };
