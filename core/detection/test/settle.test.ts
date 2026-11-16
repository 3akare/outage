// Task 14: settle and archive, state migration, state size (R16). Property D5.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type EngineEvent,
  type Params,
  StateVersionError,
  evaluate,
  initialState,
  migrate,
  removeInstall,
} from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P } from './helpers/build.ts';
import { NUM_RUNS } from './helpers/runs.ts';
import { type Scenario, buildScenario, outageArb } from './helpers/scenario.ts';

/** Reference parameters: the same thresholds, a horizon so long that nothing ever settles. */
const NEVER: Params = { ...P, horizonMs: 1e13 };

const longScenarioArb: fc.Arbitrary<Scenario> = fc.record({
  installs: fc.integer({ min: 3, max: 8 }),
  humans: fc.array(
    fc.record({
      install: fc.integer({ min: 0, max: 7 }),
      atMs: fc.integer({ min: 0, max: 24 * DAY_MS }),
      downMs: fc.integer({ min: 5 * SEC, max: 20 * MIN }),
    }),
    { maxLength: 25 },
  ),
  outages: fc.array(outageArb.map((o) => ({ ...o, startMs: 0 })), { maxLength: 0 }).chain(() =>
    fc.array(
      fc.record({ day: fc.integer({ min: 0, max: 24 * 24 }), o: outageArb }).map(({ day, o }) => ({ ...o, startMs: (day * DAY_MS) / 24 })),
      { maxLength: 5 },
    ),
  ),
  noisy: fc.integer({ min: 0, max: 12 }),
});

/** A BATTERY_FULL every two days per install keeps it armed (stale expiry is 7 days). */
function withKeepAlive(events: EngineEvent[], count: number): EngineEvent[] {
  const out = [...events];
  const installs = [...new Set(events.map((e) => e.installId))];
  for (const id of installs) for (let j = 0; j < count; j++) out.push(ev(id, 1000 + j, 'BATTERY_FULL', T0 + (j + 1) * 2 * DAY_MS + 7 * HOUR));
  return out;
}

function runChronological(events: EngineEvent[], params: Params, chunks: number, finalNow: number) {
  const sorted = [...events].sort((a, b) => a.eventTimeMs - b.eventTimeMs);
  let state = initialState();
  const per = Math.ceil(sorted.length / chunks);
  for (let c = 0; c < chunks; c++) {
    const batch = sorted.slice(c * per, (c + 1) * per);
    if (batch.length === 0) continue;
    state = evaluate(state, input(batch, batch[batch.length - 1].eventTimeMs + MIN), params).state;
  }
  return evaluate(state, input([], finalNow), params);
}

describe('D5_settle_equivalence', () => {
  it('D5_settle_equivalence: settling and archiving gives the same decisions as never settling, inside the horizon', () => {
    fc.assert(
      fc.property(longScenarioArb, fc.integer({ min: 2, max: 12 }), fc.integer({ min: 13 * HOUR, max: 12 * DAY_MS }), (scenario, chunks, later) => {
        const events = withKeepAlive(buildScenario(scenario), 12);
        const last = Math.max(...events.map((e) => e.eventTimeMs));
        const now = last + later;
        const settled = runChronological(events, P, chunks, now);
        const full = runChronological(events, NEVER, chunks, now);
        const kept = new Set(settled.outputs.decisions.map((d) => d.outageId));
        // Every outage that ends inside the horizon is still reported, with identical decisions.
        const inside = full.outputs.decisions.filter((d) => d.startMs + P.unknownEndMs >= now - P.horizonMs + P.windowMs);
        for (const d of inside) expect(kept.has(d.outageId)).toBe(true);
        expect(settled.outputs.decisions).toEqual(full.outputs.decisions.filter((d) => kept.has(d.outageId)));
        expect(settled.outputs.areaStatus).toEqual(full.outputs.areaStatus);
        // Archive records carry counts only and every archived outage is gone from the live list.
        for (const a of settled.state.archive) {
          expect(kept.has(a.id)).toBe(false);
          expect(JSON.stringify(a)).not.toMatch(/"i\d+"/);
        }
        expect(settled.state.archive.length + kept.size).toBeGreaterThanOrEqual(new Set(full.outputs.decisions.map((d) => d.outageId)).size);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 120_000); // 2000 runs of a 12-day replay take about 16 s; the 5 s default only fits the CI run count

  it('D5_settle_equivalence: a second outage three weeks later sees the same baseline as the unsettled run', () => {
    const phones = ids(10);
    const humans: EngineEvent[] = [];
    for (let d = 0; d < 20; d++) {
      for (let j = 0; j < 4; j++) {
        const id = phones[(d + j) % 10];
        humans.push(ev(id, 10 + d * 8 + 2 * j, 'UNPLUG', T0 + d * DAY_MS + 3 * HOUR + j * 7 * MIN));
        humans.push(ev(id, 11 + d * 8 + 2 * j, 'REPLUG', T0 + d * DAY_MS + 3 * HOUR + j * 7 * MIN + 30 * SEC));
      }
    }
    const drop = (at: number, seq: number) => phones.slice(0, 7).map((id, i) => ev(id, seq, 'UNPLUG', at + i * 100));
    const events = withKeepAlive([...armAll(phones, T0), ...humans, ...drop(T0 + 2 * DAY_MS, 400), ...drop(T0 + 21 * DAY_MS, 500)], 12);
    const now = T0 + 25 * DAY_MS;
    const settled = runChronological(events, P, 10, now);
    const full = runChronological(events, NEVER, 10, now);
    expect(settled.state.cutMs).not.toBeNull();
    expect(settled.state.archive.length).toBeGreaterThan(0);
    const late = (r: typeof full) => r.outputs.decisions.filter((d) => d.startMs >= T0 + 20 * DAY_MS);
    expect(late(settled).length).toBeGreaterThan(0);
    expect(late(settled)).toEqual(late(full));
  });

  it('D5_settle_equivalence: the live state shrinks and old events are rejected after a settle', () => {
    const phones = ids(5);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + HOUR + i * 100)), ...phones.map((id, i) => ev(id, 3, 'REPLUG', T0 + 2 * HOUR + i * SEC))];
    const first = evaluate(initialState(), input(events, T0 + 3 * HOUR), P);
    const later = evaluate(first.state, input([], T0 + 20 * DAY_MS), P);
    expect(later.state.archive).toHaveLength(1);
    expect(later.state.archive[0].status).toBe('RESTORED');
    expect(later.state.decisions).toEqual([]);
    expect(Object.keys(later.state.installs).length).toBeLessThanOrEqual(5);
    const stale = evaluate(later.state, input([ev('late', 1, 'ARMED', T0 + HOUR)], T0 + 20 * DAY_MS), P);
    expect(stale.outputs.rejected).toHaveLength(1);
  });
});

describe('R16 state', () => {
  it('R16_6_state_for_100_installs_over_the_horizon_stays_below_1_MB', () => {
    const installs = ids(100);
    const events: EngineEvent[] = [];
    const span = 7.5 * DAY_MS;
    for (const [i, id] of installs.entries()) {
      events.push(ev(id, 1, 'ARMED', T0 + i * SEC));
      for (let j = 0; j < 75; j++) {
        // ten events a day: five unplug/replug pairs, offset per install so most are isolated
        const t = T0 + Math.floor((j * span) / 75) + i * 997;
        events.push(ev(id, 2 + 2 * j, 'UNPLUG', t), ev(id, 3 + 2 * j, 'REPLUG', t + 40 * SEC, { schedulingDelayMs: 1500 }));
      }
    }
    const r = evaluate(initialState(), input(events, T0 + span + HOUR), P);
    const size = JSON.stringify(r.state).length;
    expect(Object.keys(r.state.installs)).toHaveLength(100);
    expect(size).toBeLessThan(1_000_000);
  });

  it('R16_4_state_is_json_serializable_and_partitioned_by_install', () => {
    const events = [...armAll(ids(5), T0), ...ids(5).map((id, i) => ev(id, 2, 'UNPLUG', T0 + HOUR + i * 100))];
    const r = evaluate(initialState(), input(events, T0 + 2 * HOUR), P);
    const roundTrip = JSON.parse(JSON.stringify(r.state));
    expect(roundTrip).toEqual(r.state);
    const again = evaluate(migrate(roundTrip), input([ev('i0', 3, 'REPLUG', T0 + 3 * HOUR)], T0 + 4 * HOUR), P);
    expect(again.outputs.decisions.length).toBeGreaterThan(0);
    // Only the touched install part is a new object; the others are shared (a store can write only changed parts).
    const reloaded = migrate(roundTrip);
    const next = evaluate(reloaded, input([ev('i0', 4, 'ARMED', T0 + 5 * HOUR)], T0 + 6 * HOUR), P).state;
    expect(next.installs.i1).toBe(reloaded.installs.i1);
    expect(next.installs.i0).not.toBe(reloaded.installs.i0);
  });

  it('R16_5_delete_my_data_removes_one_install_and_leaves_archive_records_unchanged', () => {
    const phones = ids(5);
    const events = [...armAll(phones, T0), ...phones.map((id, i) => ev(id, 2, 'UNPLUG', T0 + HOUR + i * 100)), ...phones.map((id, i) => ev(id, 3, 'REPLUG', T0 + 2 * HOUR + i * SEC))];
    const settled = evaluate(evaluate(initialState(), input(events, T0 + 3 * HOUR), P).state, input([], T0 + 20 * DAY_MS), P).state;
    const trimmed = removeInstall(settled, 'i2');
    expect(trimmed.archive).toEqual(settled.archive);
    expect(Object.keys(trimmed.installs)).not.toContain('i2');
    expect(JSON.stringify(trimmed)).not.toContain('"i2"');
    expect(removeInstall(settled, 'nobody')).toBe(settled);
    expect(() => evaluate(trimmed, input([], T0 + 21 * DAY_MS), P)).not.toThrow();
    const live = evaluate(initialState(), input(events, T0 + 3 * HOUR), P).state;
    expect(JSON.stringify(removeInstall(live, 'i2'))).not.toContain('i2');
  });

  it('R16_migrate_accepts_the_current_version_and_throws_a_typed_error_otherwise', () => {
    expect(migrate(initialState())).toEqual(initialState());
    expect(() => migrate({ version: 0 })).toThrow(StateVersionError);
    expect(() => migrate({ version: 99 })).toThrow(StateVersionError);
    expect(() => migrate(null)).toThrow(StateVersionError);
    expect(() => migrate('state')).toThrow(StateVersionError);
  });
});
