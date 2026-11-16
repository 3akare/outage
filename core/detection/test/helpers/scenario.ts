// Scenario generators for the whole-engine properties (design 11.1). Everything is built from plain data so that
// fast-check can shrink it. Times are relative to T0; seq numbers follow each install's own time order.
import * as fc from 'fast-check';
import type { EngineEvent } from '../../src/index.ts';
import { HOUR, MIN, SEC, T0 } from './build.ts';

export type Outage = {
  /** Start offset from T0 + 20 min. */
  startMs: number;
  /** Fraction (per mille) of the installs that drop. */
  dropPerMille: number;
  /** Per-install jitter, at most 2 s (R6 generator `trueOutage`). */
  jitterMs: number[];
  /** Outage length before power returns. */
  lengthMs: number;
  /** Spread of the REPLUGs: 0..30 s is a grid restore, minutes is a generator restart. */
  replugSpreadMs: number;
};

export type Human = { install: number; atMs: number; downMs: number };

export type Scenario = { installs: number; humans: Human[]; outages: Outage[]; noisy: number };

export const outageArb = fc.record<Outage>({
  startMs: fc.integer({ min: 0, max: 3 * HOUR }),
  dropPerMille: fc.integer({ min: 200, max: 1000 }),
  jitterMs: fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 12, maxLength: 12 }),
  lengthMs: fc.integer({ min: 2 * MIN, max: 3 * HOUR }),
  replugSpreadMs: fc.oneof(fc.integer({ min: 0, max: 30 * SEC }), fc.integer({ min: 3 * MIN, max: 20 * MIN })),
});

export const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  installs: fc.integer({ min: 3, max: 12 }),
  humans: fc.array(
    fc.record({
      install: fc.integer({ min: 0, max: 11 }),
      atMs: fc.integer({ min: 0, max: 6 * HOUR }),
      downMs: fc.integer({ min: 5 * SEC, max: 20 * MIN }),
    }),
    { maxLength: 12 },
  ),
  outages: fc.array(outageArb, { maxLength: 2 }),
  /** Isolated unplugs of install i0 in the first 20 minutes: more than 8 makes it a noisy device. */
  noisy: fc.integer({ min: 0, max: 14 }),
});

/** Build events for a scenario. Each install gets ARMED, then its unplug/replug pairs in time order. */
export function buildScenario(s: Scenario): EngineEvent[] {
  const items: Map<string, { t: number; type: 'UNPLUG' | 'REPLUG'; delay?: number }[]> = new Map();
  const push = (id: string, t: number, type: 'UNPLUG' | 'REPLUG', delay?: number) => {
    const l = items.get(id) ?? [];
    l.push({ t, type, ...(delay === undefined ? {} : { delay }) });
    items.set(id, l);
  };
  for (const h of s.humans) {
    const id = `i${h.install % s.installs}`;
    push(id, T0 + 20 * MIN + h.atMs, 'UNPLUG');
    push(id, T0 + 20 * MIN + h.atMs + h.downMs, 'REPLUG', 2000);
  }
  for (let j = 0; j < s.noisy; j++) {
    push('i0', T0 + MIN + j * 80 * SEC, 'UNPLUG');
    push('i0', T0 + MIN + j * 80 * SEC + 20 * SEC, 'REPLUG', 2000);
  }
  for (const o of s.outages) {
    const dropCount = Math.max(1, Math.round((s.installs * o.dropPerMille) / 1000));
    for (let i = 0; i < dropCount; i++) {
      const id = `i${i}`;
      const t = T0 + 20 * MIN + o.startMs + o.jitterMs[i % o.jitterMs.length];
      push(id, t, 'UNPLUG');
      const spread = dropCount > 1 ? Math.floor((o.replugSpreadMs * i) / (dropCount - 1)) : 0;
      push(id, t + o.lengthMs + spread, 'REPLUG', 3000);
    }
  }
  const events: EngineEvent[] = [];
  for (let i = 0; i < s.installs; i++) {
    const id = `i${i}`;
    events.push({ installId: id, seq: 1, type: 'ARMED', eventTimeMs: T0 + i * SEC, confidence: 'HIGH' });
    const l = (items.get(id) ?? []).sort((a, b) => a.t - b.t || (a.type < b.type ? 1 : -1));
    l.forEach((x, j) => {
      events.push({
        installId: id,
        seq: 2 + j,
        type: x.type,
        eventTimeMs: x.t,
        confidence: j % 5 === 4 ? 'LOW' : 'HIGH',
        ...(x.delay === undefined ? {} : { schedulingDelayMs: x.delay }),
      });
    });
  }
  return events;
}

export const lastEventMs = (events: EngineEvent[]): number => events.reduce((m, e) => Math.max(m, e.eventTimeMs), 0);

/** "Final" evaluation time: later than every event plus 12 h (design 11.2, P3). */
export const finalNow = (events: EngineEvent[]): number => lastEventMs(events) + 13 * HOUR;

/** Deterministic permutation from a list of sort keys. */
export function permute<T>(items: T[], keys: number[]): T[] {
  return items.map((x, i) => [x, keys[i % Math.max(1, keys.length)] ?? 0, i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
}
