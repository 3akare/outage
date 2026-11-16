import { DEFAULT_PARAMS, evaluate, initialState } from '@outage/detection';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import committed from '../../../core/shared/fixtures/replay.json' with { type: 'json' };
import { DEFAULT_SYNTHETIC, LAGOS_PARENT, type SyntheticOptions, syntheticFixture } from '../src/fixture.ts';
import { buildReplay, type Fixture, ReplayError, recordedDevices } from '../src/replay.ts';
import { NUM_RUNS } from './runs.ts';

const optionsArb: fc.Arbitrary<SyntheticOptions> = fc.record({
  phones: fc.integer({ min: 3, max: 14 }),
  drops: fc.integer({ min: 0, max: 14 }),
  jitterMs: fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 1, maxLength: 14 }),
  replugSpreadMs: fc.oneof(fc.integer({ min: 0, max: 30_000 }), fc.integer({ min: 180_000, max: 1_200_000 })),
  spotPhone: fc.boolean(),
});

/** Independent reference: the engine on the raw prefix, written without the builder's helpers. */
function reference(fx: Fixture, tMs: number) {
  const events = fx.events
    .filter((e) => e.tMs <= tMs)
    .map((e) => ({
      installId: e.alias,
      seq: e.seq,
      type: e.type,
      eventTimeMs: e.tMs,
      confidence: e.confidence ?? ('HIGH' as const),
      schedulingDelayMs: e.schedulingDelayMs ?? null,
    }));
  const labels = fx.labels
    .filter((l) => events.some((e) => e.installId === l.alias && e.seq === l.unplugSeq))
    .map((l) => ({ installId: l.alias, unplugSeq: l.unplugSeq, answer: l.answer }));
  return evaluate(
    initialState(),
    { events, labels, context: { neighbors: [], manualReports: 0 }, nowMs: tMs },
    DEFAULT_PARAMS,
  ).outputs;
}

describe('W5 replay matches the engine', () => {
  it('W5_replay_matches_engine: every frame state and explanation equal the engine output for the same fixture prefix', () => {
    fc.assert(
      fc.property(optionsArb, (o) => {
        const fx = syntheticFixture(o);
        const replay = buildReplay(fx);
        const times = [...new Set(fx.events.map((e) => e.tMs))].sort((a, b) => a - b);
        expect(replay.frames.map((f) => f.tMs)).toEqual(times);
        let seen = new Set<string>();
        for (const f of replay.frames) {
          const out = reference(fx, f.tMs);
          const lastDecision = [...out.decisions].sort((a, b) => a.decisionTimeMs - b.decisionTimeMs).at(-1);
          const expected =
            out.areaStatus.level !== 'NORMAL'
              ? out.areaStatus.level
              : lastDecision?.kind === 'RESTORED'
                ? 'RESTORED'
                : out.spotStates.length > 0
                  ? 'SPOT_ONLY'
                  : 'NORMAL';
          expect(f.cells).toEqual([{ cell: LAGOS_PARENT, state: expected }]);
          const fresh = out.decisions.filter((d) => !seen.has(`${d.outageId}|${d.kind}`));
          seen = new Set(out.decisions.map((d) => `${d.outageId}|${d.kind}`));
          if (fresh.length === 0) expect(f.explanation).toBeUndefined();
          else expect(fresh.map((d) => d.explanation)).toContainEqual(f.explanation);
        }
      }),
      { numRuns: Math.min(NUM_RUNS, 200) },
    );
  });

  it('W5_replay_matches_engine: the default fixture steps through Your spot only, Possible or Confirmed, Confirmed and Restored', () => {
    const replay = buildReplay(syntheticFixture(DEFAULT_SYNTHETIC));
    const states = replay.frames.map((f) => f.cells[0]?.state);
    const order = states.filter((s, i) => s !== states[i - 1]);
    expect(order[0]).toBe('NORMAL');
    expect(order).toContain('SPOT_ONLY');
    expect(order).toContain('CONFIRMED');
    expect(order.at(-1)).toBe('RESTORED');
    expect(order.indexOf('SPOT_ONLY')).toBeLessThan(order.indexOf('CONFIRMED'));
    const confirmed = replay.frames.find((f) => f.cells[0]?.state === 'CONFIRMED');
    expect(confirmed?.explanation?.k).toBeGreaterThanOrEqual(DEFAULT_PARAMS.confirmed.minK);
    expect(confirmed?.explanation?.thresholds.confirmed).toEqual(DEFAULT_PARAMS.confirmed);
  });

  it('W5_replay_matches_engine: the committed replay.json equals a fresh build (regenerate with npm run build:replay -w tools/sim)', () => {
    // The unplug track (demo-mode task 3) is checked against a fresh build in scenario.test.ts.
    const { unplugTrack: _track, ...replayPart } = committed;
    expect(replayPart).toEqual(JSON.parse(JSON.stringify(buildReplay(syntheticFixture()))));
  });
});

describe('R6.2 R6.3 labels and honest device count', () => {
  it('R6.2 the replay, every phone and every frame carry simulated: true and the label', () => {
    fc.assert(
      fc.property(optionsArb, (o) => {
        const r = buildReplay(syntheticFixture(o));
        expect(r.simulated).toBe(true);
        expect(r.label).toBe('Simulated replay');
        for (const p of r.phones) expect(p.simulated).toBe(true);
        for (const f of r.frames) expect(f.simulated).toBe(true);
      }),
      { numRuns: Math.min(NUM_RUNS, 50) },
    );
  });

  it('R6.3 a synthetic fixture claims 0 real devices; a recording counts only REAL phones', () => {
    const fx = syntheticFixture();
    expect(recordedDevices(fx)).toBe(0);
    expect(buildReplay(fx)).toMatchObject({ source: 'SYNTHETIC', recordedDevices: 0 });
    const rec: Fixture = {
      ...fx,
      source: 'RECORDED',
      phones: fx.phones.map((p, i) => ({ ...p, role: i < 2 ? 'REAL' : 'SIMULATED_NEIGHBOR' })),
    };
    expect(buildReplay(rec)).toMatchObject({ source: 'RECORDED', recordedDevices: 2 });
  });

  it('R14 a fixture event without simulated: true is refused, and the build never mutates the fixture', () => {
    const fx = syntheticFixture();
    const copy = JSON.parse(JSON.stringify(fx));
    buildReplay(fx);
    expect(fx).toEqual(copy);
    const bad = { ...fx, events: [{ ...fx.events[0], simulated: false }, ...fx.events.slice(1)] } as unknown as Fixture;
    expect(() => buildReplay(bad)).toThrow(ReplayError);
  });

  it('DM2 the replay is built with the default parameters object', () => {
    expect(JSON.stringify(buildReplay(syntheticFixture()))).toBe(
      JSON.stringify(buildReplay(syntheticFixture(), DEFAULT_PARAMS)),
    );
  });
});
