// Vitest API: https://vitest.dev/api/  fast-check: https://fast-check.dev/docs/core-blocks/properties/
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lnGamma, tail } from '../src/tail.ts';
import { bigTail } from './helpers/bigtail.ts';
import { NUM_RUNS } from './helpers/runs.ts';

const rel = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

describe('D2_poisson_tail_accuracy', () => {
  it('D2_poisson_tail_accuracy within 1e-9 of the BigInt reference', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 4000 }), (k, milli) => {
        const mu = milli / 1000;
        const ref = bigTail(k, BigInt(milli), 1000n);
        if (ref < 1e-300) return true; // below double range; tail() may return 0
        expect(rel(tail(k, mu), ref)).toBeLessThan(1e-9);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('D2_poisson_tail_accuracy keeps relative precision near 1e-12', () => {
    const ref = bigTail(10, 1n, 2n); // mu = 0.5, p ~ 1.7e-10
    expect(ref).toBeLessThan(1e-9);
    expect(rel(tail(10, 0.5), ref)).toBeLessThan(1e-9);
    const ref2 = bigTail(14, 1n, 2n);
    expect(ref2).toBeLessThan(1e-12);
    expect(rel(tail(14, 0.5), ref2)).toBeLessThan(1e-9);
  });

  it('D2_poisson_tail_accuracy is in [0,1], decreasing in k, increasing in mu', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), fc.double({ min: 0, max: 80, noNaN: true }), (k, mu) => {
        const p = tail(k, mu);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        expect(tail(k + 1, mu)).toBeLessThanOrEqual(p * (1 + 1e-12));
        expect(tail(k, mu + 0.5)).toBeGreaterThanOrEqual(p * (1 - 1e-12));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('D2_poisson_tail_accuracy edge cases', () => {
    expect(tail(0, 3)).toBe(1);
    expect(tail(3, 0)).toBe(0);
    expect(() => tail(-1, 1)).toThrow(RangeError);
    expect(() => tail(1.5, 1)).toThrow(RangeError);
    expect(() => tail(1, -1)).toThrow(RangeError);
    expect(() => tail(1, Number.NaN)).toThrow(RangeError);
    expect(tail(1, 1e-12)).toBeCloseTo(1e-12, 20);
  });

  it('D2_poisson_tail_accuracy table from ADR 0005 (min k for Possible and Confirmed)', () => {
    const lambda = 1 / 1800;
    const rows: [number, number, number][] = [
      [3, 2, 3],
      [5, 2, 4],
      [10, 3, 5],
      [20, 4, 6],
      [30, 5, 7],
      [50, 6, 10],
      [100, 10, 14],
    ];
    const minK = (n: number, maxP: number, floor: number) => {
      const mu = lambda * n * 90;
      for (let k = floor; k <= n; k++) if (tail(k, mu) < maxP) return k;
      return null;
    };
    for (const [n, possible, confirmed] of rows) {
      expect(minK(n, 0.05, 2)).toBe(possible);
      expect(minK(n, 0.001, 3)).toBe(confirmed);
    }
  });

  it('D2_poisson_tail_accuracy lnGamma matches known values', () => {
    expect(lnGamma(1)).toBe(0);
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(lnGamma(171)).toBeCloseTo(706.5730622457874, 9); // ln(170!)
    expect(lnGamma(300)).toBeCloseTo(1409.2020674704, 6); // Stirling branch, ln(299!) = ln(300!) - ln(300)
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    expect(() => lnGamma(0)).toThrow(RangeError);
  });
});

describe('D2_poisson_tail_accuracy large mu', () => {
  it('D2_poisson_tail_accuracy returns 1 when k is far below mu and the first term underflows', () => {
    for (const [k, mu] of [[1, 800], [3, 1000], [3, 5000], [5, 450000]] as const) {
      expect(Math.abs(tail(k, mu) - 1)).toBeLessThan(1e-9);
    }
  });

  it('D2_poisson_tail_accuracy is monotone in k for large mu', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 450000 }), fc.integer({ min: 1, max: 30 }), (mu, k) => {
        const a = tail(k, mu);
        const b = tail(k + 1, mu);
        expect(a).toBeGreaterThanOrEqual(b - 1e-12);
        expect(a).toBeLessThanOrEqual(1);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
