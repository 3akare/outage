import { cellToParent, getPentagons, getResolution, latLngToCell } from 'h3-js';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { isValidRes8Cell, res7Parent } from '../src/index.ts';
import { cellArb } from './arbs.ts';
import { NUM_RUNS } from './runs.ts';

it('R1.3 isValidRes8Cell accepts every real res-8 cell and rejects other resolutions', () => {
  fc.assert(
    fc.property(cellArb, fc.double({ min: -85, max: 85, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (cell, lat, lng) => {
      expect(isValidRes8Cell(cell)).toBe(true);
      for (const res of [0, 5, 7, 9, 15]) expect(isValidRes8Cell(latLngToCell(lat, lng, res))).toBe(false);
    }),
    { numRuns: NUM_RUNS },
  );
});

it('R7.1 res7Parent equals h3-js cellToParent at res 7 and is stable', () => {
  fc.assert(
    fc.property(cellArb, (cell) => {
      const parent = res7Parent(cell);
      expect(parent).toBe(cellToParent(cell, 7));
      expect(getResolution(parent)).toBe(7);
      expect(res7Parent(cell)).toBe(parent);
    }),
    { numRuns: NUM_RUNS },
  );
});

it('R7.1 res7Parent throws on an invalid cell; the 12 res-8 pentagons are valid and have a parent', () => {
  expect(() => res7Parent('nope')).toThrow();
  const pentagons = getPentagons(8);
  expect(pentagons).toHaveLength(12);
  for (const p of pentagons) {
    expect(isValidRes8Cell(p)).toBe(true);
    expect(getResolution(res7Parent(p))).toBe(7);
  }
});
