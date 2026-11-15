// demo-mode task 3: DM2 (default params), DM4 (plan confirms and restores), DM5 (one real drop). The engine is the real
// one in packages/detection; these tests never reimplement it, they call it directly on the same fixture prefix.
import { DEFAULT_PARAMS, evaluate, initialState, type Params } from '@outage/detection';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import committed from '../../../packages/shared/fixtures/replay.json' with { type: 'json' };
import { buildReplay, ReplayError, stateOf } from '../src/replay.ts';
import { scanForbidden } from '../src/sanitize.ts';
import {
  buildDemoReplay,
  buildUnplugTrack,
  CONFIRM_WITHIN_MS,
  DEMO_ARMED,
  DEMO_MARGIN,
  DEMO_SEED,
  demoPlan,
  JUDGE_ALIAS,
  MAX_JITTER_MS,
  RESTORE_SPREAD_MS,
  ScenarioGenerator,
  type UnplugTrack,
  seededRandom,
  trackFromScenario,
} from '../src/scenario.ts';
import { NUM_RUNS } from './runs.ts';

const PLAN = demoPlan();
if (!PLAN.reachable) throw new Error('the default plan must be reachable');
const SHAPE = { armed: PLAN.armed, drops: PLAN.drops };

/** Independent reference: the engine, called directly, on the fixture prefix up to `tMs`. */
function referenceState(sc: ReturnType<ScenarioGenerator['generate']>, tMs: number, params: Params) {
  const events = sc.fixture.events
    .filter((e) => e.tMs <= tMs)
    .map((e) => ({
      installId: e.alias,
      seq: e.seq,
      type: e.type,
      eventTimeMs: e.tMs,
      confidence: 'HIGH' as const,
      schedulingDelayMs: e.schedulingDelayMs ?? null,
    }));
  const out = evaluate(
    initialState(),
    { events, labels: [], context: { neighbors: [], manualReports: 0 }, nowMs: tMs },
    params,
  ).outputs;
  return stateOf(out);
}

const allFlagged = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.every(allFlagged);
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Objects that stand for a simulated thing carry the flag; engine parameter and explanation objects are numbers only.
    if ('alias' in o || 'frames' in o || 'offsetMs' in o) {
      if (o.simulated !== true) return false;
    }
    return Object.entries(o).every(([k, x]) => k === 'engineParams' || k === 'explanation' || allFlagged(x));
  }
  return true;
};

describe('DM2 default params', () => {
  it('DM2_default_params: the track records the engine parameters it ran with, equal to DEFAULT_PARAMS', () => {
    expect(buildUnplugTrack().engineParams).toEqual(DEFAULT_PARAMS);
    expect(committed.unplugTrack.engineParams).toEqual(DEFAULT_PARAMS);
    expect(buildDemoReplay().unplugTrack.engineParams).toEqual(DEFAULT_PARAMS);
  });

  it('DM2_default_params: the shipped plan is the decided 9 neighbors, 6 droppers, 7 drops of 10 (needs 5)', () => {
    expect(PLAN).toMatchObject({
      armed: DEMO_ARMED,
      drops: 7,
      neighbors: 9,
      droppers: 6,
      neededDrops: 5,
      margin: DEMO_MARGIN,
    });
  });

  it('DM2_default_params: every track frame state equals the engine run with DEFAULT_PARAMS on the same prefix', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const sc = new ScenarioGenerator(seed).generate(SHAPE);
        const track = trackFromScenario(sc, seed);
        for (const f of track.frames) {
          const base = f.phase === 'REPLUG' ? sc.judgeReplugMs : sc.judgeUnplugMs;
          expect(f.state).toBe(referenceState(sc, base + f.offsetMs, DEFAULT_PARAMS));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM2_params_are_inputs: a changed parameter set changes the track and is recorded; nothing is hard-coded', () => {
    const stricter: Params = { ...DEFAULT_PARAMS, confirmed: { ...DEFAULT_PARAMS.confirmed, minK: 6 } };
    const plan = demoPlan(stricter);
    expect(plan.reachable && plan.neededDrops).toBeGreaterThan(PLAN.neededDrops);
    const track = buildUnplugTrack(stricter);
    expect(track.engineParams).toEqual(stricter);
    expect(track.engineParams).not.toEqual(DEFAULT_PARAMS);
    expect(track.drops).toBeGreaterThan(PLAN.drops);
    expect(track.frames.find((f) => f.state === 'CONFIRMED')?.explanation?.k).toBeGreaterThanOrEqual(6);
  });
});

describe('DM4 plan confirms and restores', () => {
  it('DM4_plan_confirms_and_restores: any seed gives CONFIRMED within 5 s of the unplug and RESTORED after the replugs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const track = buildUnplugTrack(DEFAULT_PARAMS, seed);
        expect(track.confirmedAtMs).toBeLessThanOrEqual(CONFIRM_WITHIN_MS);
        expect(track.jitterMs.every((j) => j >= 0 && j <= MAX_JITTER_MS)).toBe(true);
        expect(track.replugSpreadMs.every((s) => s >= 0 && s <= RESTORE_SPREAD_MS)).toBe(true);
        const first = track.frames[0];
        expect(first?.judgeEvent).toBe('UNPLUG');
        expect(first?.offsetMs).toBe(0);
        expect(first?.state === 'NORMAL' || first?.state === 'SPOT_ONLY').toBe(true); // the judge's single drop is no alert
        expect(track.frames.some((f) => f.phase === 'REPLUG' && f.state === 'RESTORED')).toBe(true);
        const confirmed = track.frames.find((f) => f.state === 'CONFIRMED');
        expect(confirmed?.explanation?.thresholds).toMatchObject({
          possible: DEFAULT_PARAMS.possible,
          confirmed: DEFAULT_PARAMS.confirmed,
          minArmedForConfirm: DEFAULT_PARAMS.minArmedForConfirm,
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM4_any_jitter: any jitter up to 2 s and any replug spread up to 20 s still confirms and restores', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: MAX_JITTER_MS }), { minLength: PLAN.droppers, maxLength: PLAN.droppers }),
        fc.array(fc.integer({ min: 0, max: RESTORE_SPREAD_MS }), {
          minLength: PLAN.droppers,
          maxLength: PLAN.droppers,
        }),
        (jitterMs, replugSpreadMs) => {
          const sc = new ScenarioGenerator(1).generate(SHAPE, { jitterMs, replugSpreadMs });
          const track = trackFromScenario(sc, 1);
          expect(track.confirmedAtMs).toBeLessThanOrEqual(MAX_JITTER_MS);
          expect(track.restoredAtMs).toBeLessThanOrEqual(RESTORE_SPREAD_MS);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM4_margin: the plan still confirms with the margin of drops removed, and the judge alone does not', () => {
    const fewer = { armed: PLAN.armed, drops: PLAN.drops - DEMO_MARGIN };
    expect(fewer.drops).toBe(PLAN.neededDrops);
    expect(() => trackFromScenario(new ScenarioGenerator(DEMO_SEED).generate(fewer), DEMO_SEED)).not.toThrow();
    const tooFew = { armed: PLAN.armed, drops: PLAN.neededDrops - 1 };
    expect(() => trackFromScenario(new ScenarioGenerator(DEMO_SEED).generate(tooFew), DEMO_SEED)).toThrow(ReplayError);
    const alone = { armed: PLAN.armed, drops: 1 };
    expect(() => trackFromScenario(new ScenarioGenerator(DEMO_SEED).generate(alone), DEMO_SEED)).toThrow(ReplayError);
  });

  it('DM4_not_reachable: parameters the demo cannot satisfy give a "not reachable" plan and no file', () => {
    const impossible: Params = { ...DEFAULT_PARAMS, confirmed: { ...DEFAULT_PARAMS.confirmed, minK: 40 } };
    const plan = demoPlan(impossible);
    expect(plan.reachable).toBe(false);
    expect(!plan.reachable && plan.reason).toMatch(/does not confirm/);
    expect(() => buildUnplugTrack(impossible)).toThrow(/not reachable/);
    expect(() => buildDemoReplay(undefined, impossible)).toThrow(ReplayError);
    expect(demoPlan(DEFAULT_PARAMS, { maxArmed: 6 }).reachable).toBe(false);
  });

  it('DM4_plan_follows_params: when the confirm rule needs more drops, the plan grows and still confirms', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 8 }), (minK) => {
        const params: Params = { ...DEFAULT_PARAMS, confirmed: { ...DEFAULT_PARAMS.confirmed, minK } };
        const plan = demoPlan(params);
        if (!plan.reachable) return;
        const track = buildUnplugTrack(params, 7);
        expect(track.confirmedAtMs).toBeLessThanOrEqual(CONFIRM_WITHIN_MS);
        expect(plan.drops).toBe(plan.neededDrops + DEMO_MARGIN);
        expect(plan.neededDrops).toBeGreaterThanOrEqual(minK);
      }),
      { numRuns: Math.min(NUM_RUNS, 12) },
    );
  });
});

describe('DM5 one real drop', () => {
  const check = (track: UnplugTrack) => {
    const judgeUnplugs = track.frames.filter((f) => f.judgeEvent === 'UNPLUG');
    const judgeReplugs = track.frames.filter((f) => f.judgeEvent === 'REPLUG');
    expect(judgeUnplugs).toHaveLength(1); // the judge's own drop, played live and never stored as a simulated event
    expect(judgeReplugs).toHaveLength(1);
    const events = track.frames.flatMap((f) => f.events);
    expect(events.every((e) => e.simulated === true && e.alias !== JUDGE_ALIAS)).toBe(true);
    expect(events.filter((e) => e.type === 'UNPLUG')).toHaveLength(track.drops - 1);
    expect(events.filter((e) => e.type === 'REPLUG')).toHaveLength(track.drops - 1);
    expect(track.neighbors.every((n) => n.simulated === true && /^Simulated neighbor \d+$/.test(n.label))).toBe(true);
    expect(track.neighbors).toHaveLength(track.armed - 1);
    expect(track.neighbors.filter((n) => n.drops)).toHaveLength(track.drops - 1);
    expect(allFlagged(track)).toBe(true);
  };

  it('DM5_one_real_drop: every drop in the file is simulated and the judge has exactly one, for any seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        check(buildUnplugTrack(DEFAULT_PARAMS, seed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM5_one_real_drop: the committed replay.json has the same property', () => {
    check(committed.unplugTrack as unknown as UnplugTrack);
  });
});

describe('seeded generator and the committed file', () => {
  it('same seed, same numbers; a different seed differs', () => {
    expect(new ScenarioGenerator(5).generate(SHAPE).jitterMs).toEqual(
      new ScenarioGenerator(5).generate(SHAPE).jitterMs,
    );
    expect(new ScenarioGenerator(5).generate(SHAPE).jitterMs).not.toEqual(
      new ScenarioGenerator(6).generate(SHAPE).jitterMs,
    );
    const a = seededRandom(1);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('the generated fixture labels every event, phone and frame as simulated and has the judge as the only REAL phone', () => {
    const sc = new ScenarioGenerator(DEMO_SEED).generate(SHAPE);
    expect(sc.fixture.events.every((e) => e.simulated === true)).toBe(true);
    expect(sc.fixture.phones.filter((p) => p.role === 'REAL').map((p) => p.alias)).toEqual([JUDGE_ALIAS]);
    expect(buildReplay(sc.fixture).recordedDevices).toBe(0);
  });

  it('shape errors are refused', () => {
    expect(() => new ScenarioGenerator(1).generate({ armed: 3, drops: 4 })).toThrow(ReplayError);
    expect(() => new ScenarioGenerator(1).generate({ armed: 3, drops: 0 })).toThrow(ReplayError);
  });

  it('the committed replay.json equals a fresh build and holds no forbidden shape', () => {
    expect(JSON.parse(JSON.stringify(buildDemoReplay()))).toEqual(committed);
    expect(scanForbidden(committed)).toEqual([]);
  });
});
