// Judge mode "unplug your own phone" scenario (demo-mode task 3, design section 4, R4.3 to R4.7). Build time only.
//
// `demoPlan(params)` searches for the number of simulated neighbors and droppers that the real engine confirms with the
// given parameters, with a margin. `ScenarioGenerator` makes a seeded fixture for that plan. `buildUnplugTrack` runs the
// real engine (through `buildReplay`) on it and keeps the frames as offsets from the judge's own unplug.
// The scenario numbers are chosen to pass the engine, never the other way round: thresholds are read, never changed,
// and no decision is written by hand (R4.6). The phone plays the frames and never runs the engine (ADR 0012).
import { DEFAULT_PARAMS, type Explanation, type Params } from '@outage/detection';
import { LAGOS_PARENT, syntheticFixture } from './fixture.ts';
import { buildReplay, type Fixture, type Replay, ReplayError, type ReplayState, runPrefix, stateOf } from './replay.ts';

/** Alias of the judge's own phone in the engine run. Its events are never listed as simulated drops (R5.6). */
export const JUDGE_ALIAS = 'JUDGE';
/** Armed phones in the demo, the judge's phone included: the decision "9 simulated neighbors" (requirements.md). */
export const DEMO_ARMED = 10;
/** The search gives up beyond this many armed phones. */
export const MAX_DEMO_ARMED = 30;
/** Drops beyond the smallest confirming number, so one late phone does not break the demo. */
export const DEMO_MARGIN = 2;
export const MAX_JITTER_MS = 2000; // R4.3
export const RESTORE_SPREAD_MS = 20_000; // decision: neighbors replug within 20 s of the judge's replug
export const CONFIRM_WITHIN_MS = 5000; // R4.5
export const DEMO_SEED = 20_261_114;

const ARM_STEP_MS = 1000;
const UNPLUG_AT = 120_000; // after everyone is armed
const OUTAGE_GAP_MS = 300_000; // nominal time between the judge's unplug and replug in the engine run

/** Small seeded generator (mulberry32). Same seed, same numbers, on any machine. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface ScenarioShape {
  /** Armed phones, the judge's included. */
  armed: number;
  /** Phones that drop, the judge's included. */
  drops: number;
}

export interface Scenario {
  fixture: Fixture;
  shape: ScenarioShape;
  /** Per dropping neighbor, ms after the judge's unplug. */
  jitterMs: number[];
  /** Per dropping neighbor, ms after the judge's replug. */
  replugSpreadMs: number[];
  judgeUnplugMs: number;
  judgeReplugMs: number;
}

const neighborAlias = (i: number): string => `N${i + 1}`;
const clamp = (x: number, hi: number): number => Math.min(hi, Math.max(0, Math.round(x)));

function ev(
  alias: string,
  seq: number,
  type: Fixture['events'][number]['type'],
  tMs: number,
): Fixture['events'][number] {
  return type === 'REPLUG'
    ? { alias, seq, type, tMs, schedulingDelayMs: 2000, simulated: true }
    : { alias, seq, type, tMs, simulated: true };
}

export class ScenarioGenerator {
  readonly seed: number;
  private readonly rand: () => number;

  constructor(seed: number = DEMO_SEED) {
    this.seed = seed;
    this.rand = seededRandom(seed);
  }

  /** `count` jitters, uniform 0 to 2,000 ms, ascending so "Simulated neighbor 1" drops first. */
  jitter(count: number): number[] {
    return Array.from({ length: count }, () => Math.floor(this.rand() * (MAX_JITTER_MS + 1))).sort((a, b) => a - b);
  }

  /** `count` replug offsets, uniform 0 to 20,000 ms, ascending. */
  spread(count: number): number[] {
    return Array.from({ length: count }, () => Math.floor(this.rand() * (RESTORE_SPREAD_MS + 1))).sort((a, b) => a - b);
  }

  /** Fixture for a shape. Explicit `jitterMs` and `replugSpreadMs` (clamped to the limits) replace the seeded draw. */
  generate(
    shape: ScenarioShape,
    fixed?: { jitterMs?: readonly number[]; replugSpreadMs?: readonly number[] },
  ): Scenario {
    const neighbors = shape.armed - 1;
    const droppers = shape.drops - 1;
    if (
      !(
        Number.isInteger(shape.armed) &&
        Number.isInteger(shape.drops) &&
        shape.drops >= 1 &&
        shape.drops <= shape.armed
      )
    ) {
      throw new ReplayError('scenario shape needs 1 <= drops <= armed');
    }
    const jitterMs = (fixed?.jitterMs ?? this.jitter(droppers)).slice(0, droppers).map((x) => clamp(x, MAX_JITTER_MS));
    const replugSpreadMs = (fixed?.replugSpreadMs ?? this.spread(droppers))
      .slice(0, droppers)
      .map((x) => clamp(x, RESTORE_SPREAD_MS));
    while (jitterMs.length < droppers) jitterMs.push(0);
    while (replugSpreadMs.length < droppers) replugSpreadMs.push(0);
    const judgeReplugMs = UNPLUG_AT + OUTAGE_GAP_MS;

    const phones: Fixture['phones'] = [
      { alias: JUDGE_ALIAS, role: 'REAL' },
      ...Array.from({ length: neighbors }, (_, i) => ({
        alias: neighborAlias(i),
        role: 'SIMULATED_NEIGHBOR' as const,
      })),
    ];
    const events: Fixture['events'] = phones.map((p, i) => ev(p.alias, 1, 'ARMED', i * ARM_STEP_MS));
    events.push(ev(JUDGE_ALIAS, 2, 'UNPLUG', UNPLUG_AT), ev(JUDGE_ALIAS, 3, 'REPLUG', judgeReplugMs));
    for (let i = 0; i < droppers; i++) {
      events.push(ev(neighborAlias(i), 2, 'UNPLUG', UNPLUG_AT + (jitterMs[i] ?? 0)));
      events.push(ev(neighborAlias(i), 3, 'REPLUG', judgeReplugMs + (replugSpreadMs[i] ?? 0)));
    }
    events.sort((a, b) => a.tMs - b.tMs || (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
    return {
      fixture: { source: 'SYNTHETIC', cell: LAGOS_PARENT, phones, events, labels: [] },
      shape,
      jitterMs,
      replugSpreadMs,
      judgeUnplugMs: UNPLUG_AT,
      judgeReplugMs,
    };
  }
}

export interface DemoPlanOptions {
  /** Smallest number of armed phones to try. Default `DEMO_ARMED`. */
  minArmed?: number;
  maxArmed?: number;
  /** Extra drops over the smallest confirming number. Default `DEMO_MARGIN`. */
  margin?: number;
}

export type DemoPlan =
  | {
      reachable: true;
      armed: number;
      drops: number;
      /** Simulated phones armed next to the judge's. */
      neighbors: number;
      /** Simulated phones that drop. */
      droppers: number;
      /** Smallest number of drops, the judge's included, that the engine confirms at worst-case timing. */
      neededDrops: number;
      margin: number;
    }
  | { reachable: false; reason: string; triedArmed: number };

/**
 * Does the engine, with `params`, confirm this shape at the worst timing the track allows (every neighbor drops last, 2 s
 * after the judge, and replugs last, 20 s after the judge's replug)? And is the judge's drop alone no alert?
 */
function passes(shape: ScenarioShape, params: Params): boolean {
  const droppers = shape.drops - 1;
  const sc = new ScenarioGenerator(0).generate(shape, {
    jitterMs: Array(droppers).fill(MAX_JITTER_MS),
    replugSpreadMs: Array(droppers).fill(RESTORE_SPREAD_MS),
  });
  const alone = stateOf(runPrefix(sc.fixture, sc.judgeUnplugMs, params));
  const lastDrop = sc.judgeUnplugMs + (droppers > 0 ? MAX_JITTER_MS : 0);
  const confirmed = stateOf(runPrefix(sc.fixture, lastDrop, params)) === 'CONFIRMED';
  const lastReplug = sc.judgeReplugMs + (droppers > 0 ? RESTORE_SPREAD_MS : 0);
  const restored = stateOf(runPrefix(sc.fixture, lastReplug, params)) === 'RESTORED';
  return confirmed && restored && (droppers === 0 ? true : alone !== 'CONFIRMED' && alone !== 'POSSIBLE');
}

/** The plan for `params`: the smallest armed count (from `minArmed`) and drop count that confirm, plus a margin. */
export function demoPlan(params: Params = DEFAULT_PARAMS, options: DemoPlanOptions = {}): DemoPlan {
  const minArmed = options.minArmed ?? DEMO_ARMED;
  const maxArmed = options.maxArmed ?? MAX_DEMO_ARMED;
  const margin = options.margin ?? DEMO_MARGIN;
  for (let armed = Math.max(2, minArmed); armed <= maxArmed; armed++) {
    let needed = 0;
    for (let k = 2; k <= armed; k++) {
      if (passes({ armed, drops: k }, params)) {
        needed = k;
        break;
      }
    }
    const drops = needed + margin;
    if (needed > 0 && drops <= armed && passes({ armed, drops }, params)) {
      return { reachable: true, armed, drops, neighbors: armed - 1, droppers: drops - 1, neededDrops: needed, margin };
    }
  }
  return {
    reachable: false,
    reason: `the engine does not confirm within ${maxArmed} armed phones with a margin of ${margin} drops`,
    triedArmed: maxArmed,
  };
}

export interface UnplugFrame {
  /** Milliseconds after the judge's unplug (phase UNPLUG) or after the judge's replug (phase REPLUG). */
  offsetMs: number;
  phase: 'UNPLUG' | 'REPLUG';
  simulated: true;
  state: ReplayState;
  /** The live event the phone waits for at this frame. It is the judge's own, so it is not a simulated drop. */
  judgeEvent?: 'UNPLUG' | 'REPLUG';
  /** Simulated neighbors' events at this offset. */
  events: { alias: string; type: string; simulated: true }[];
  explanation?: Explanation;
}

export interface UnplugTrack {
  simulated: true;
  label: 'Simulated neighbors';
  seed: number;
  /** The exact parameters the engine ran with (DM2). */
  engineParams: Params;
  armed: number;
  drops: number;
  neighbors: { alias: string; label: string; role: 'SIMULATED_NEIGHBOR'; simulated: true; drops: boolean }[];
  jitterMs: number[];
  replugSpreadMs: number[];
  /** Offset of the first CONFIRMED frame from the judge's unplug. */
  confirmedAtMs: number;
  /** Offset of the first RESTORED frame from the judge's replug. */
  restoredAtMs: number;
  frames: UnplugFrame[];
}

/** Engine frames of `sc` as a track. Fails the build when the engine does not confirm and restore in time. */
export function trackFromScenario(sc: Scenario, seed: number, params: Params = DEFAULT_PARAMS): UnplugTrack {
  const replay = buildReplay(sc.fixture, params);
  const frames: UnplugFrame[] = [];
  for (const f of replay.frames) {
    if (f.tMs < sc.judgeUnplugMs) continue;
    const phase = f.tMs >= sc.judgeReplugMs ? 'REPLUG' : 'UNPLUG';
    const base = phase === 'REPLUG' ? sc.judgeReplugMs : sc.judgeUnplugMs;
    const judge = f.events.find((e) => e.alias === JUDGE_ALIAS);
    const frame: UnplugFrame = {
      offsetMs: f.tMs - base,
      phase,
      simulated: true,
      state: f.cells[0]?.state ?? 'NORMAL',
      events: f.events
        .filter((e) => e.alias !== JUDGE_ALIAS)
        .map((e) => ({ alias: e.alias, type: e.type, simulated: true })),
    };
    if (judge) frame.judgeEvent = judge.type === 'REPLUG' ? 'REPLUG' : 'UNPLUG';
    if (f.explanation) frame.explanation = f.explanation;
    frames.push(frame);
  }
  const confirmed = frames.find((f) => f.phase === 'UNPLUG' && f.state === 'CONFIRMED');
  const restored = frames.find((f) => f.phase === 'REPLUG' && f.state === 'RESTORED');
  if (!confirmed || confirmed.offsetMs > CONFIRM_WITHIN_MS) {
    throw new ReplayError(`the engine does not confirm within ${CONFIRM_WITHIN_MS} ms of the judge's unplug`);
  }
  if (!restored) throw new ReplayError('the engine does not restore after the replugs');
  const droppers = sc.shape.drops - 1;
  return {
    simulated: true,
    label: 'Simulated neighbors',
    seed,
    engineParams: params,
    armed: sc.shape.armed,
    drops: sc.shape.drops,
    neighbors: Array.from({ length: sc.shape.armed - 1 }, (_, i) => ({
      alias: neighborAlias(i),
      label: `Simulated neighbor ${i + 1}`,
      role: 'SIMULATED_NEIGHBOR' as const,
      simulated: true as const,
      drops: i < droppers,
    })),
    jitterMs: sc.jitterMs,
    replugSpreadMs: sc.replugSpreadMs,
    confirmedAtMs: confirmed.offsetMs,
    restoredAtMs: restored.offsetMs,
    frames,
  };
}

/** The unplug track for `params` and `seed`. Throws `ReplayError` when the plan is not reachable. */
export function buildUnplugTrack(
  params: Params = DEFAULT_PARAMS,
  seed: number = DEMO_SEED,
  options: DemoPlanOptions = {},
): UnplugTrack {
  const plan = demoPlan(params, options);
  if (!plan.reachable) throw new ReplayError(`not reachable: ${plan.reason}`);
  return trackFromScenario(new ScenarioGenerator(seed).generate(plan), seed, params);
}

export type DemoReplay = Replay & { unplugTrack: UnplugTrack };

/** `replay.json`: the recorded (or synthetic) replay plus the unplug track, both from the real engine. */
export function buildDemoReplay(
  fixture: Fixture = syntheticFixture(),
  params: Params = DEFAULT_PARAMS,
  seed: number = DEMO_SEED,
): DemoReplay {
  return { ...buildReplay(fixture, params), unplugTrack: buildUnplugTrack(params, seed) };
}
