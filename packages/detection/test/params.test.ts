import { describe, expect, it } from 'vitest';
import { assertParams, DEFAULT_PARAMS, ParamsError, validateParams } from '../src/params.ts';

describe('R1.4 params', () => {
  it('R1_4_defaults_are_valid', () => {
    expect(validateParams(DEFAULT_PARAMS)).toEqual([]);
    expect(() => assertParams(DEFAULT_PARAMS)).not.toThrow();
  });

  it('R1_4_defaults_match_adr_0005', () => {
    expect(DEFAULT_PARAMS.windowMs).toBe(90_000);
    expect(DEFAULT_PARAMS.possible).toEqual({ minK: 2, maxP: 0.05 });
    expect(DEFAULT_PARAMS.confirmed).toEqual({ minK: 3, maxP: 0.001 });
    expect(DEFAULT_PARAMS.weight).toEqual({ cut: 0.5, u0: 8, lookbackMs: 86_400_000 });
    expect(DEFAULT_PARAMS.baseline.priorLambdaPerSec).toBeCloseTo(1 / 1800, 15);
    expect(DEFAULT_PARAMS.horizonMs).toBe(7 * 86_400_000 + 12 * 3_600_000);
    expect(DEFAULT_PARAMS.staleArmedMs).toBe(7 * 86_400_000);
    expect(DEFAULT_PARAMS.unknownEndMs).toBe(12 * 3_600_000);
    expect(DEFAULT_PARAMS.pushMaxAgeMs).toBe(10 * 60_000);
  });

  it('R1_4_rejects_impossible_values', () => {
    const bad = (f: (p: typeof DEFAULT_PARAMS) => void) => {
      const p = JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as typeof DEFAULT_PARAMS;
      f(p);
      return validateParams(p);
    };
    expect(bad((p) => (p.windowMs = 0))).not.toEqual([]);
    expect(bad((p) => (p.windowMs = -5))).not.toEqual([]);
    expect(bad((p) => (p.possible.maxP = 1.5))).not.toEqual([]);
    expect(bad((p) => (p.confirmed.maxP = 0))).not.toEqual([]);
    expect(bad((p) => (p.confirmed.maxP = 0.5))).not.toEqual([]); // looser than possible
    expect(bad((p) => (p.confirmed.minK = 1))).not.toEqual([]);
    expect(bad((p) => (p.weight.cut = 0))).not.toEqual([]);
    expect(bad((p) => (p.weight.lookbackMs = 10))).not.toEqual([]);
    expect(bad((p) => (p.baseline.dailyDecay = 1.2))).not.toEqual([]);
    expect(bad((p) => (p.horizonMs = 1000))).not.toEqual([]);
    expect(bad((p) => (p.localOffsetMs = 1.5))).not.toEqual([]);
    expect(bad((p) => (p.restore.minQuorum = 0))).not.toEqual([]);
    expect(bad((p) => (p.windowMs = Number.NaN))).not.toEqual([]);
    const p = JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as typeof DEFAULT_PARAMS;
    p.windowMs = 0;
    expect(() => assertParams(p)).toThrow(ParamsError);
  });
});
