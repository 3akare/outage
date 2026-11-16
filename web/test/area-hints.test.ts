import { type Context, DEFAULT_PARAMS, type EngineEvent, evaluate, initialState } from '@outage/detection';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildContext, type HintInput, manualHint } from '../api/area/hints.ts';
import type { Level, Notice, NoticeTable } from '../api/area/neighbors.ts';
import { NUM_RUNS } from './runs.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const ring: Record<string, string[]> = { a: ['b', 'x1'], b: ['a', 'c', 'x2'], c: ['b', 'x3'] };
const neighborsOf = (c: string): readonly string[] => ring[c] ?? [];
const base: HintInput = {
  scopeCells: ['a'],
  nowMs: NOW,
  notices: new Map(),
  neighborsOf,
  localLevels: new Map(),
  linkedCells: [],
  manualInstalls: 0,
};
const notice = (cell: string, level: Level, maxK: number, asOfMs = NOW - MIN): Notice => ({
  cell,
  level,
  maxK,
  asOfMs,
});
const table = (...ns: Notice[]): NoticeTable => new Map(ns.map((n) => [n.cell, n]));

describe('hints wiring', () => {
  it('A7_hints_never_confirm_alone: neighbor notices, local levels and linked cells become engine hints', () => {
    const ctx = buildContext({
      ...base,
      notices: table(notice('x1', 'CONFIRMED', 6), notice('x2', 'POSSIBLE', 2)),
      localLevels: new Map([['b', { level: 'POSSIBLE' as Level, maxK: 4 }]]),
    });
    expect(ctx.neighbors).toEqual([
      { level: 'POSSIBLE', maxK: 4, linked: false }, // b, a local neighbor
      { level: 'CONFIRMED', maxK: 6, linked: false }, // x1, a notice
    ]);
    const linked = buildContext({
      ...base,
      linkedCells: ['c'],
      localLevels: new Map([['c', { level: 'CONFIRMED' as Level, maxK: 5 }]]),
    });
    expect(linked.neighbors).toEqual([{ level: 'CONFIRMED', maxK: 5, linked: true }]);
  });

  it('A7_hints_never_confirm_alone: notices older than 12 hours and NORMAL levels give no hint; a linked cell is not also a neighbor', () => {
    const old = notice('x1', 'CONFIRMED', 6, NOW - 13 * 3_600_000);
    expect(buildContext({ ...base, notices: table(old) }).neighbors).toEqual([]);
    const both = buildContext({
      ...base,
      linkedCells: ['b'],
      localLevels: new Map([['b', { level: 'CONFIRMED' as Level, maxK: 4 }]]),
    });
    expect(both.neighbors).toEqual([{ level: 'CONFIRMED', maxK: 4, linked: true }]);
    expect(
      buildContext({
        ...base,
        scopeCells: ['a', 'b'],
        localLevels: new Map([['b', { level: 'CONFIRMED' as Level, maxK: 4 }]]),
      }).neighbors,
    ).toEqual([]);
  });

  it('A7_hints_never_confirm_alone: the manual-report count applies only for 2 or more distinct installs', () => {
    expect(manualHint(0)).toBe(0);
    expect(manualHint(1)).toBe(0);
    expect(manualHint(2)).toBe(2);
    expect(manualHint(Number.NaN)).toBe(0);
    expect(buildContext({ ...base, manualInstalls: 1 }).manualReports).toBe(0);
    expect(buildContext({ ...base, manualInstalls: 3 }).manualReports).toBe(3);
  });

  it('A7_hints_never_confirm_alone: through the engine, no scope reaches CONFIRMED when k < 3 here and in every hinting scope', () => {
    const levelArb = fc.constantFrom<Level>('NORMAL', 'POSSIBLE', 'CONFIRMED');
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 }), // k here: phones that unplug
        fc.integer({ min: 3, max: 12 }), // n armed phones
        fc.array(fc.record({ level: levelArb, maxK: fc.integer({ min: 0, max: 2 }) }), { maxLength: 3 }),
        fc.array(fc.record({ level: levelArb, maxK: fc.integer({ min: 0, max: 2 }) }), { maxLength: 2 }),
        fc.integer({ min: 0, max: 6 }),
        (k, n, nbs, lks, manual) => {
          const ids = Array.from({ length: n }, (_, i) => `i${i}`);
          const events: EngineEvent[] = [
            ...ids.map(
              (id, i): EngineEvent => ({
                installId: id,
                seq: 1,
                type: 'ARMED',
                eventTimeMs: NOW - 10 * MIN + i * 1000,
                confidence: 'HIGH',
              }),
            ),
            ...ids
              .slice(0, k)
              .map(
                (id, i): EngineEvent => ({
                  installId: id,
                  seq: 2,
                  type: 'UNPLUG',
                  eventTimeMs: NOW + i * 100,
                  confidence: 'HIGH',
                }),
              ),
          ];
          const notices = table(...nbs.map((x, i) => notice(`x${i + 1}`, x.level, x.maxK)));
          const local = new Map(lks.map((x, i) => [i === 0 ? 'b' : 'c', x]));
          const context: Context = buildContext({
            ...base,
            notices,
            localLevels: local,
            linkedCells: lks.length > 0 ? ['b', 'c'].slice(0, lks.length) : [],
            manualInstalls: manual,
          });
          const { outputs } = evaluate(
            initialState(),
            { events, labels: [], context, nowMs: NOW + 5 * MIN },
            DEFAULT_PARAMS,
          );
          expect(outputs.areaStatus.level).not.toBe('CONFIRMED');
          for (const d of outputs.decisions) expect(d.level).not.toBe('CONFIRMED');
          expect(outputs.pushes.filter((p) => p.kind === 'CONFIRMED')).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A7_hints_never_confirm_alone: with k >= 3 elsewhere and k = 2 here a neighbor hint may raise to CONFIRMED, and is named', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `i${i}`);
    const events: EngineEvent[] = [
      ...ids.map(
        (id, i): EngineEvent => ({
          installId: id,
          seq: 1,
          type: 'ARMED',
          eventTimeMs: NOW - 10 * MIN + i * 1000,
          confidence: 'HIGH',
        }),
      ),
      ...ids
        .slice(0, 3)
        .map(
          (id, i): EngineEvent => ({
            installId: id,
            seq: 2,
            type: 'UNPLUG',
            eventTimeMs: NOW + i * 100,
            confidence: 'HIGH',
          }),
        ),
    ];
    const context = buildContext({ ...base, notices: table(notice('x1', 'CONFIRMED', 6)) });
    const { outputs } = evaluate(initialState(), { events, labels: [], context, nowMs: NOW + 5 * MIN }, DEFAULT_PARAMS);
    expect(outputs.areaStatus.level).toBe('CONFIRMED');
    expect(outputs.decisions.find((d) => d.kind === 'RAISED')?.explanation.raisedBy).toBe('NEIGHBOR');
  });
});
