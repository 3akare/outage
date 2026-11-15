// Decisions, explanations, change diff and push filter (R12, R13, design 4.1 steps 8 to 11).
import { applyHints } from './hints.ts';
import { hasOwn, labelFor } from './merge.ts';
import type { Params } from './params.ts';
import type { OutageRec, SweepResult, WindowRec } from './sweep.ts';
import type {
  Context,
  Decision,
  EngineOutputs,
  EngineState,
  Explanation,
  Level,
  OutageLevel,
  Push,
  PushedRecord,
  PushKind,
} from './types.ts';

export function explainWindow(w: WindowRec, params: Params): Explanation {
  return {
    k: w.k,
    n: w.n,
    excludedNoisy: w.excludedNoisy,
    lambdaPerSec: w.lambdaPerSec,
    muValue: w.mu,
    p: w.p,
    windowMs: params.windowMs,
    thresholds: {
      possible: { ...params.possible },
      confirmed: { ...params.confirmed },
      minArmedForConfirm: params.minArmedForConfirm,
      weightCut: params.weight.cut,
    },
    confidence: { high: w.high, low: w.low },
  };
}

/** Recompute the window level from an explanation alone (D3, R13.3). */
export function levelFromExplanation(x: Explanation): 'NONE' | OutageLevel {
  const t = x.thresholds;
  if (x.k >= t.confirmed.minK && x.p < t.confirmed.maxP && x.n >= t.minArmedForConfirm) return 'CONFIRMED';
  if (x.k >= t.possible.minK && x.p < t.possible.maxP) return 'POSSIBLE';
  return 'NONE';
}

const peakWindow = (o: OutageRec): WindowRec => o.windowAt.CONFIRMED ?? o.windowAt.POSSIBLE ?? o.openedAt;
const KIND_RANK = { OPENED: 0, RAISED: 1, RESTORED: 2, ENDED_UNKNOWN: 3 } as const;

export function buildDecisions(sw: SweepResult, ctx: Context, nowMs: number, params: Params): Decision[] {
  const out: Decision[] = [];
  for (const o of sw.outages) {
    const opened = o.openedAt;
    out.push({
      outageId: o.id,
      kind: 'OPENED',
      level: opened.level as OutageLevel,
      status: 'OPEN',
      decisionTimeMs: opened.t,
      startMs: o.startMs,
      explanation: explainWindow(opened, params),
    });
    const conf = o.windowAt.CONFIRMED;
    if (conf && opened.level === 'POSSIBLE') {
      out.push({
        outageId: o.id,
        kind: 'RAISED',
        level: 'CONFIRMED',
        status: 'OPEN',
        decisionTimeMs: conf.t,
        startMs: o.startMs,
        explanation: explainWindow(conf, params),
      });
    }
    const peak = explainWindow(peakWindow(o), params);
    const level: OutageLevel = o.level;
    if (o.closedBy === 'RESTORED' && o.restore && o.restoredAtMs !== undefined && o.evidenceAtMs !== undefined) {
      const r = o.restore;
      out.push({
        outageId: o.id,
        kind: 'RESTORED',
        level,
        status: 'RESTORED',
        decisionTimeMs: o.evidenceAtMs,
        startMs: o.startMs,
        restoredAtMs: o.restoredAtMs,
        explanation: {
          ...peak,
          confidence: { high: peak.confidence.high + r.high, low: peak.confidence.low + r.low },
          restore: { d: r.d, quorum: r.quorum, replugs: r.replugs, wrMs: r.wrMs, p95SampleCount: r.p95SampleCount, p95Ms: r.p95Ms },
        },
      });
    } else if (o.closedBy === 'EXPIRED' || nowMs > o.startMs + params.unknownEndMs) {
      out.push({
        outageId: o.id,
        kind: 'ENDED_UNKNOWN',
        level,
        status: 'ENDED_UNKNOWN',
        decisionTimeMs: o.startMs + params.unknownEndMs,
        startMs: o.startMs,
        explanation: peak,
      });
    } else if (level === 'POSSIBLE') {
      const h = applyHints('POSSIBLE', o.maxK, ctx, params.confirmed.minK);
      if (h.level === 'CONFIRMED') {
        out.push({
          outageId: o.id,
          kind: 'RAISED',
          level: 'CONFIRMED',
          status: 'OPEN',
          decisionTimeMs: nowMs,
          startMs: o.startMs,
          explanation: { ...peak, raisedBy: h.raisedBy },
        });
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.decisionTimeMs - b.decisionTimeMs ||
      a.startMs - b.startMs ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      (a.outageId < b.outageId ? -1 : a.outageId > b.outageId ? 1 : 0),
  );
}

const key = (d: Decision) => `${d.outageId}:${d.kind}`;

/** Decisions that are new or differ from the previous call's list. */
export function diffDecisions(prev: Decision[], next: Decision[]): Decision[] {
  const old = new Map(prev.map((d) => [key(d), JSON.stringify(d)]));
  return next.filter((d) => old.get(key(d)) !== JSON.stringify(d));
}

const pushKindOf = (d: Decision): PushKind | null =>
  d.kind === 'RESTORED' ? 'RESTORED' : d.level === 'CONFIRMED' && (d.kind === 'OPENED' || d.kind === 'RAISED') ? 'CONFIRMED' : null;

/**
 * Push list, separate from decisions (R12.4). Only CONFIRMED and RESTORED decisions push, never older than the max age,
 * and each (outage, kind) at most once. The remembered start lets a re-identified outage (a late, earlier drop moves
 * its id) match its earlier push.
 */
export function selectPushes(
  decisions: Decision[],
  state: EngineState,
  nowMs: number,
  params: Params,
): { pushes: Push[]; pushed: PushedRecord[] } {
  const pushed = [...state.pushed];
  const pushes: Push[] = [];
  for (const d of decisions) {
    const kind = pushKindOf(d);
    if (!kind) continue;
    if (d.decisionTimeMs < nowMs - params.pushMaxAgeMs) continue;
    const spanEnd = d.startMs + params.unknownEndMs;
    const already = pushed.some(
      (p) =>
        p.kind === kind &&
        (p.outageId === d.outageId || (p.startMs >= d.startMs - params.windowMs && p.startMs <= spanEnd)),
    );
    if (already) continue;
    pushed.push({ outageId: d.outageId, kind, startMs: d.startMs });
    pushes.push({ outageId: d.outageId, kind, decisionTimeMs: d.decisionTimeMs, level: d.level, explanation: d.explanation });
  }
  return { pushes, pushed };
}

export function areaStatus(decisions: Decision[], sw: SweepResult, nowMs: number, params: Params): EngineOutputs['areaStatus'] {
  let best: { level: Level; id: string; since: number } | null = null;
  for (const o of sw.outages) {
    if (o.closedBy !== null || nowMs > o.startMs + params.unknownEndMs) continue;
    const raised = decisions.some((d) => d.outageId === o.id && d.level === 'CONFIRMED' && d.status === 'OPEN');
    const level: Level = raised ? 'CONFIRMED' : o.level;
    if (!best || o.startMs >= best.since) best = { level, id: o.id, since: o.startMs };
  }
  return best ? { level: best.level, outageId: best.id, sinceMs: best.since } : { level: 'NORMAL' };
}

/** "Your spot only" (R8): a YES-labeled drop covered by no outage, until the install's next REPLUG. */
export function spotStates(sw: SweepResult, installs: EngineState['installs'], params: Params) {
  const out: { installId: string; state: 'SPOT_ONLY'; sinceMs: number }[] = [];
  for (const rt of sw.rts.values()) {
    if (!hasOwn(installs, rt.id)) continue;
    for (const u of rt.unplugs) {
      if (u.fromCarry || u.human || !u.wake) continue;
      const covered = sw.outages.some((o) => {
        const end = o.closedBy === 'RESTORED' ? (o.evidenceAtMs as number) : o.startMs + params.unknownEndMs;
        return u.t >= o.startMs && u.t <= end;
      });
      if (covered) continue;
      if (rt.replugs.some((t) => t > u.t)) continue;
      if (labelFor(installs[rt.id].labels, u.seq) !== 'YES') continue;
      out.push({ installId: rt.id, state: 'SPOT_ONLY', sinceMs: u.t });
    }
  }
  return out.sort((a, b) => a.sinceMs - b.sinceMs || (a.installId < b.installId ? -1 : 1));
}
