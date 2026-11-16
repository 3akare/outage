// Task 12: restore and unknown end (R10, R11). Properties P5 and P6.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate, initialState, p95Before } from '../src/index.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P, replugAll, unplugAll } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { buildScenario, finalNow, scenarioArb } from './helpers/scenario.ts';

/** Twenty-plus earlier REPLUG samples, all with `delayMs`, so that p95 = delayMs and W_r = 90 s + delayMs. */
const delaySamples = (count: number, delayMs: number, at: number) =>
  Array.from({ length: count }, (_, i) => [
    ev(`old${i}`, 1, 'REPLUG', at + i * SEC, { schedulingDelayMs: delayMs }),
    ev(`old${i}`, 2, 'DISARMED', at + i * SEC + 500), // the sample installs leave, so they do not count in n
  ]).flat();

describe('P5_spread_replugs_never_restore', () => {
  it('P5_spread_replugs_never_restore: REPLUGs spaced wider than W_r never give a restore', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 15 }), // dropped installs
        fc.integer({ min: 0, max: 40 }), // earlier delay samples
        fc.integer({ min: 0, max: 120_000 }), // their delay
        fc.integer({ min: 1, max: 200_000 }), // gap beyond W_r
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 15, maxLength: 15 }),
        (n, samples, delayMs, beyond, jitter) => {
          const start = T0 + 2 * HOUR;
          const phones = ids(n);
          const old = delaySamples(samples, delayMs, T0);
          const wr = p95Before(
            old.filter((e) => e.type === 'REPLUG').map((e) => [e.eventTimeMs, e.schedulingDelayMs ?? 0] as [number, number]),
            start,
            P,
          ).wrMs;
          const gap = wr + beyond; // strictly wider than W_r between any two REPLUGs
          const events = [
            ...old,
            ...armAll(phones, start, 5 * MIN),
            ...phones.map((id, i) => ev(id, 2, 'UNPLUG', start + jitter[i])),
            ...phones.map((id, i) => ev(id, 3, 'REPLUG', start + 5 * MIN + i * gap)),
          ];
          const r = evaluate(initialState(), input(events, start + 20 * HOUR + n * gap), P);
          expect(r.outputs.decisions.length).toBeGreaterThan(0);
          expect(r.outputs.decisions.some((d) => d.kind === 'RESTORED')).toBe(false);
          expect(r.outputs.decisions.at(-1)?.kind).toBe('ENDED_UNKNOWN');
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('P5_spread_replugs_never_restore: the same REPLUGs squeezed inside W_r do restore (control)', () => {
    const start = T0 + 2 * HOUR;
    const phones = ids(6);
    const events = [
      ...armAll(phones, start, 5 * MIN),
      ...unplugAll(phones, start, 300),
      ...replugAll(phones, start + 5 * MIN, 10 * SEC), // 5 REPLUGs inside 50 s < 150 s
    ];
    const r = evaluate(initialState(), input(events, start + HOUR), P).outputs.decisions;
    expect(r.at(-1)?.kind).toBe('RESTORED');
  });

  it('P5_spread_replugs_never_restore: a generator restart spread over minutes is not a grid restore', () => {
    const start = T0 + 2 * HOUR;
    const phones = ids(10);
    const events = [
      ...armAll(phones, start, 5 * MIN),
      ...unplugAll(phones, start, 300),
      ...replugAll(phones, start + 5 * MIN, 3 * MIN), // one every 3 min
    ];
    const r = evaluate(initialState(), input(events, start + 20 * HOUR), P).outputs.decisions;
    expect(r.some((d) => d.kind === 'RESTORED')).toBe(false);
  });

  it('P5_spread_replugs_never_restore: a REPLUG exactly W_r apart still counts, one ms more does not', () => {
    const start = T0 + 2 * HOUR;
    const mk = (gap: number) => [
      ...armAll(['a', 'b', 'c'], start, 5 * MIN),
      ...unplugAll(['a', 'b', 'c'], start, 100),
      ev('a', 3, 'REPLUG', start + 5 * MIN),
      ev('b', 3, 'REPLUG', start + 5 * MIN + gap),
    ];
    const wr = 150_000; // prior p95 60 s
    expect(evaluate(initialState(), input(mk(wr), start + HOUR), P).outputs.decisions.some((d) => d.kind === 'RESTORED')).toBe(true);
    expect(evaluate(initialState(), input(mk(wr + 1), start + HOUR), P).outputs.decisions.some((d) => d.kind === 'RESTORED')).toBe(false);
  });
});

describe('P6_restore_needs_outage', () => {
  it('P6_restore_needs_outage: every restore follows an opened outage of Possible or Confirmed', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const events = buildScenario(scenario);
        const d = evaluate(initialState(), input(events, finalNow(events)), P).outputs.decisions;
        for (const r of d.filter((x) => x.kind === 'RESTORED')) {
          const opened = d.find((x) => x.outageId === r.outageId && x.kind === 'OPENED');
          expect(opened).toBeDefined();
          expect(['POSSIBLE', 'CONFIRMED']).toContain(opened?.level);
          expect(opened?.decisionTimeMs).toBeLessThanOrEqual(r.decisionTimeMs);
          expect(r.restoredAtMs).toBeGreaterThanOrEqual(r.startMs);
          expect(r.decisionTimeMs).toBeGreaterThanOrEqual(r.restoredAtMs as number);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P6_restore_needs_outage: REPLUGs with no drop give no decision at all', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 40 }), fc.integer({ min: 0, max: 60_000 }), (n, step) => {
        const phones = ids(n);
        const events = [...armAll(phones, T0), ...replugAll(phones, T0 + HOUR, step)];
        expect(evaluate(initialState(), input(events, T0 + 20 * HOUR), P).outputs.decisions).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('P6_restore_needs_outage: a single dropped install (no outage) never restores', () => {
    const events = [...armAll(ids(5), T0), ev('i0', 2, 'UNPLUG', T0 + HOUR), ev('i0', 3, 'REPLUG', T0 + 2 * HOUR), ev('i1', 2, 'REPLUG', T0 + 2 * HOUR)];
    expect(evaluate(initialState(), input(events, T0 + 20 * HOUR), P).outputs.decisions).toEqual([]);
  });
});

describe('R10 R11 restore rules', () => {
  const start = T0 + 2 * HOUR;
  const phones = ids(6);
  const drop = [...armAll(phones, start, 5 * MIN), ...unplugAll(phones, start, 300)];

  it('R10_6_replugs_of_installs_that_did_not_drop_never_count', () => {
    const others = ids(6, 'o').map((id, i) => ev(id, 2, 'REPLUG', start + 5 * MIN + i * SEC));
    const events = [...drop, ...armAll(ids(6, 'o'), start, 5 * MIN), ...others, ev('i0', 3, 'REPLUG', start + 5 * MIN)];
    expect(evaluate(initialState(), input(events, start + HOUR), P).outputs.decisions.some((d) => d.kind === 'RESTORED')).toBe(false);
  });

  it('R10_3_restored_time_is_the_first_replug_and_evidence_the_one_that_completed_the_quorum', () => {
    const events = [...drop, ev('i0', 3, 'REPLUG', start + 5 * MIN), ev('i1', 3, 'REPLUG', start + 5 * MIN + 20 * SEC), ev('i2', 3, 'REPLUG', start + 5 * MIN + 40 * SEC)];
    // d = 6, quorum 3: restored at the first REPLUG, evidence at the third.
    const d = evaluate(initialState(), input(events, start + HOUR), P).outputs.decisions.at(-1);
    expect(d?.kind).toBe('RESTORED');
    expect(d?.restoredAtMs).toBe(start + 5 * MIN);
    expect(d?.decisionTimeMs).toBe(start + 5 * MIN + 40 * SEC);
    expect(d?.explanation.restore).toMatchObject({ d: 6, quorum: 3, replugs: 3, wrMs: 150_000, p95SampleCount: 0, p95Ms: 60_000 });
  });

  it('R10_2_a_replug_before_the_install_dropped_does_not_count', () => {
    const before = ['i0', 'i1', 'i2'].map((id, i) => ev(id, 9, 'REPLUG', start - 20 * SEC + i * SEC));
    const r = evaluate(initialState(), input([...drop, ...before], start + HOUR), P).outputs.decisions;
    expect(r.some((d) => d.kind === 'RESTORED')).toBe(false);
  });

  it('R10_7_a_restored_outage_is_closed_and_later_drops_open_a_new_one', () => {
    const events = [...drop, ...replugAll(phones, start + 5 * MIN, SEC), ...unplugAll(phones, start + HOUR, 300).map((e) => ({ ...e, seq: 4 }))];
    const d = evaluate(initialState(), input(events, start + 30 * HOUR), P).outputs.decisions;
    expect(new Set(d.map((x) => x.outageId)).size).toBe(2);
  });

  it('R10_1_the_delay_p95_before_the_start_widens_W_r', () => {
    const old = delaySamples(25, 100_000, T0); // W_r = 190 s
    const events = [...old, ...drop, ev('i0', 3, 'REPLUG', start + 5 * MIN), ev('i1', 3, 'REPLUG', start + 5 * MIN + 180 * SEC), ev('i2', 3, 'REPLUG', start + 5 * MIN + 185 * SEC)];
    const d = evaluate(initialState(), input(events, start + HOUR), P).outputs.decisions.at(-1);
    expect(d?.kind).toBe('RESTORED');
    expect(d?.explanation.restore).toMatchObject({ wrMs: 190_000, p95SampleCount: 25, p95Ms: 100_000 });
  });

  it('R10_1_the_outages_own_replug_delays_are_not_in_its_sample', () => {
    // Delays inside the outage are huge. They must not widen W_r for this outage.
    const events = [...drop, ev('i0', 3, 'REPLUG', start + 5 * MIN, { schedulingDelayMs: 500_000 }), ev('i1', 3, 'REPLUG', start + 5 * MIN + 160 * SEC, { schedulingDelayMs: 500_000 })];
    expect(evaluate(initialState(), input(events, start + HOUR), P).outputs.decisions.some((d) => d.kind === 'RESTORED')).toBe(false);
  });

  it('R11_1_no_evidence_within_12_h_ends_unknown_with_no_end_time', () => {
    const early = evaluate(initialState(), input(drop, start + 12 * HOUR), P).outputs;
    const late = evaluate(initialState(), input(drop, start + 12 * HOUR + 1), P).outputs;
    expect(early.decisions.some((d) => d.kind === 'ENDED_UNKNOWN')).toBe(false);
    expect(early.areaStatus.level).not.toBe('NORMAL');
    const end = late.decisions.at(-1);
    expect(end?.kind).toBe('ENDED_UNKNOWN');
    expect(end?.restoredAtMs).toBeUndefined();
    expect(end?.decisionTimeMs).toBe(start + 12 * HOUR);
    expect(late.areaStatus.level).toBe('NORMAL');
  });

  it('R11_3_evidence_inside_12_h_that_arrives_late_gives_a_restore', () => {
    const first = evaluate(initialState(), input(drop, start + 20 * HOUR), P);
    expect(first.outputs.decisions.at(-1)?.kind).toBe('ENDED_UNKNOWN');
    const lateEvidence = [ev('i0', 3, 'REPLUG', start + 11 * HOUR), ev('i1', 3, 'REPLUG', start + 11 * HOUR + 20 * SEC), ev('i2', 3, 'REPLUG', start + 11 * HOUR + 30 * SEC)];
    const second = evaluate(first.state, input(lateEvidence, start + 21 * HOUR), P);
    expect(second.outputs.decisions.at(-1)?.kind).toBe('RESTORED');
    expect(second.outputs.pushes).toEqual([]); // far older than 10 minutes
  });

  it('R11_3_evidence_after_12_h_does_not_restore', () => {
    const events = [...drop, ev('i0', 3, 'REPLUG', start + 12 * HOUR + SEC), ev('i1', 3, 'REPLUG', start + 12 * HOUR + 2 * SEC), ev('i2', 3, 'REPLUG', start + 12 * HOUR + 3 * SEC)];
    expect(evaluate(initialState(), input(events, start + 20 * HOUR), P).outputs.decisions.at(-1)?.kind).toBe('ENDED_UNKNOWN');
  });
});
