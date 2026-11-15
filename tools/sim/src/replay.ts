// Replay builder (web-and-area-pages task 9, design section 7, R6.4 and R6.6). Build time only.
// A fixture goes through the real detection engine with the default parameters, one engine run per distinct event
// time, and becomes `replay.json`. Frames are never written by hand (W5).
//
// The fixture's events carry `simulated: true`. The engine ignores simulated input (detection-engine R14), so the
// builder strips the flag only on the copy it passes to `evaluate`. This is the one place simulated data meets the
// engine: offline, in this tool, never in the Worker (structure.md: the Worker and tools/sim are the only callers).
import {
  DEFAULT_PARAMS,
  type Decision,
  type EngineEvent,
  type EngineOutputs,
  type Explanation,
  evaluate,
  initialState,
  type Label,
  type Params,
} from '@outage/detection';

export type ReplayState = 'NORMAL' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED' | 'SPOT_ONLY';
export type PhoneRole = 'REAL' | 'SIMULATED_NEIGHBOR';

/** Sanitized fixture (demo-mode design section 6): aliases, offsets from the start, a res-7 parent, no install IDs. */
export interface Fixture {
  source: 'RECORDED' | 'SYNTHETIC';
  /** res-7 parent shown as the replay's area. */
  cell: string;
  phones: { alias: string; role: PhoneRole }[];
  events: {
    alias: string;
    seq: number;
    type: EngineEvent['type'];
    tMs: number;
    confidence?: 'HIGH' | 'LOW';
    schedulingDelayMs?: number | null;
    simulated: true;
  }[];
  labels: { alias: string; unplugSeq: number; answer: 'YES' | 'NO'; simulated: true }[];
}

export interface Frame {
  tMs: number;
  simulated: true;
  cells: { cell: string; state: ReplayState }[];
  events: { alias: string; type: string }[];
  explanation?: Explanation;
}

export interface Replay {
  simulated: true;
  label: 'Simulated replay';
  /** Honest count of real devices that recorded the outage; 0 for a synthetic fixture (R6.3). */
  recordedDevices: number;
  source: 'RECORDED' | 'SYNTHETIC';
  durationMs: number;
  phones: { alias: string; role: PhoneRole; simulated: true }[];
  frames: Frame[];
}

export class ReplayError extends Error {}

/** Real devices are counted only for a recording. A synthetic fixture never claims a real device. */
export function recordedDevices(fx: Fixture): number {
  return fx.source === 'RECORDED' ? fx.phones.filter((p) => p.role === 'REAL').length : 0;
}

/** Engine inputs for the fixture prefix up to `tMs` (inclusive). The flag is dropped on this copy only (see top). */
export function engineInput(fx: Fixture, tMs: number): { events: EngineEvent[]; labels: Label[] } {
  const events: EngineEvent[] = fx.events
    .filter((e) => e.tMs <= tMs)
    .map((e) => ({
      installId: e.alias,
      seq: e.seq,
      type: e.type,
      eventTimeMs: e.tMs,
      confidence: e.confidence ?? 'HIGH',
      schedulingDelayMs: e.schedulingDelayMs ?? null,
    }));
  const seen = new Set(events.map((e) => `${e.installId}|${e.seq}`));
  const labels: Label[] = fx.labels
    .filter((l) => seen.has(`${l.alias}|${l.unplugSeq}`))
    .map((l) => ({ installId: l.alias, unplugSeq: l.unplugSeq, answer: l.answer }));
  return { events, labels };
}

/** Run the engine on the prefix at `tMs`. */
export function runPrefix(fx: Fixture, tMs: number, params: Params = DEFAULT_PARAMS): EngineOutputs {
  const { events, labels } = engineInput(fx, tMs);
  return evaluate(initialState(), { events, labels, context: { neighbors: [], manualReports: 0 }, nowMs: tMs }, params)
    .outputs;
}

const KIND_RANK: Record<Decision['kind'], number> = { OPENED: 0, RAISED: 1, RESTORED: 2, ENDED_UNKNOWN: 3 };
const latest = (ds: readonly Decision[]): Decision | undefined =>
  [...ds].sort((a, b) => a.decisionTimeMs - b.decisionTimeMs || KIND_RANK[a.kind] - KIND_RANK[b.kind])[ds.length - 1];

/** Area state from engine outputs: an open outage's level; else Restored right after a restore; else a spot-only phone. */
export function stateOf(out: EngineOutputs): ReplayState {
  if (out.areaStatus.level !== 'NORMAL') return out.areaStatus.level;
  if (latest(out.decisions)?.kind === 'RESTORED') return 'RESTORED';
  return out.spotStates.length > 0 ? 'SPOT_ONLY' : 'NORMAL';
}

const key = (d: Decision): string => `${d.outageId}|${d.kind}`;

export function buildReplay(fx: Fixture, params: Params = DEFAULT_PARAMS): Replay {
  if (fx.events.some((e) => e.simulated !== true) || fx.labels.some((l) => l.simulated !== true)) {
    throw new ReplayError('every fixture event and label must carry simulated: true');
  }
  const aliases = new Set(fx.phones.map((p) => p.alias));
  if (fx.events.some((e) => !aliases.has(e.alias))) throw new ReplayError('event for an unknown phone alias');
  const times = [...new Set(fx.events.map((e) => e.tMs))].sort((a, b) => a - b);
  if (times.length === 0) throw new ReplayError('fixture has no events');
  const frames: Frame[] = [];
  let before = new Set<string>();
  for (const t of times) {
    const out = runPrefix(fx, t, params);
    const fresh = out.decisions.filter((d) => !before.has(key(d)));
    before = new Set(out.decisions.map(key));
    const frame: Frame = {
      tMs: t,
      simulated: true,
      cells: [{ cell: fx.cell, state: stateOf(out) }],
      events: fx.events.filter((e) => e.tMs === t).map((e) => ({ alias: e.alias, type: e.type })),
    };
    const d = latest(fresh);
    if (d) frame.explanation = d.explanation;
    frames.push(frame);
  }
  return {
    simulated: true,
    label: 'Simulated replay',
    recordedDevices: recordedDevices(fx),
    source: fx.source,
    durationMs: times[times.length - 1] - times[0],
    phones: fx.phones.map((p) => ({ alias: p.alias, role: p.role, simulated: true })),
    frames,
  };
}
