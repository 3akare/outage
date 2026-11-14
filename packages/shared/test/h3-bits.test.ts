import { cellToChildren, getResolution, cellToParent, getPentagons, gridDisk, isPentagon, isValidCell, latLngToCell, cellToBoundary } from 'h3-js';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { boundaryOf, cellOf, childrenOf, isCell, isParent, neighborsOf, parentOf } from '../src/index.ts';
import { cellArb } from './arbs.ts';
import { NUM_RUNS } from './runs.ts';

const pentagons8 = getPentagons(8);
const pentagons7 = getPentagons(7);
const anyCell = fc.oneof(cellArb, cellArb, fc.constantFrom(...pentagons8));

it('R1.2 isCell agrees with h3-js on random strings built from real cells with bits flipped', () => {
  fc.assert(
    fc.property(anyCell, fc.integer({ min: 0, max: 59 }), fc.boolean(), (cell, bit, flip) => {
      const idx = BigInt(`0x${cell}`);
      const s = (flip ? idx ^ (1n << BigInt(bit)) : idx).toString(16).padStart(15, '0');
      const ref = /^[0-9a-f]{15}$/.test(s) && isValidCell(s) && getResolution(s) === 8;
      expect(isCell(s)).toBe(ref);
    }),
    { numRuns: Math.max(NUM_RUNS, 10_000) },
  );
});

it('R1.2 parentOf equals h3-js cellToParent for random cells and the 12 pentagons', () => {
  fc.assert(fc.property(anyCell, (cell) => {
    expect(parentOf(cell)).toBe(cellToParent(cell, 7));
  }), { numRuns: Math.max(NUM_RUNS, 10_000) });
  for (const p of pentagons8) expect(parentOf(p)).toBe(cellToParent(p, 7));
});

it('R1.2 childrenOf equals h3-js cellToChildren (7 children, 6 for a pentagon) and inverts parentOf', () => {
  fc.assert(
    fc.property(anyCell, (cell) => {
      const parent = parentOf(cell);
      const kids = childrenOf(parent);
      expect([...kids].sort()).toEqual([...cellToChildren(parent, 8)].sort());
      expect(kids).toContain(cell);
      expect(kids.every((k) => parentOf(k) === parent)).toBe(true);
    }),
    { numRuns: Math.max(NUM_RUNS, 10_000) },
  );
  for (const p of pentagons7) {
    expect(childrenOf(p)).toHaveLength(6);
    expect(isPentagon(p)).toBe(true);
  }
  expect(pentagons7).toHaveLength(12);
});

it('R1.5 pentagon res-8 cells are valid cells; childrenOf and isParent reject bad input', () => {
  for (const p of pentagons8) expect(isCell(p)).toBe(true);
  for (const p of pentagons7) expect(isParent(p)).toBe(true);
  expect(isParent(pentagons8[0])).toBe(false);
  expect(isCell(pentagons7[0])).toBe(false);
  expect(() => childrenOf(pentagons8[0])).toThrow();
  expect(() => parentOf('zzz')).toThrow();
  // the deleted pentagon subsequence: digit 1 right after an all-zero prefix is invalid
  const pent = BigInt(`0x${pentagons7[0]}`);
  const bad = ((pent & ~(0xfn << 52n)) | (8n << 52n) | (1n << 21n)) & ~(7n << 21n) | (1n << 21n);
  expect(isCell(bad.toString(16).padStart(15, '0'))).toBe(false);
});

it('R1.2 neighborsOf, cellOf and boundaryOf match h3-js', async () => {
  const cells = fc.sample(anyCell, 50);
  for (const c of [...cells, ...pentagons8]) {
    expect(await neighborsOf(c)).toEqual(gridDisk(c, 1).filter((n) => n !== c).sort());
    expect(await boundaryOf(c)).toEqual(cellToBoundary(c));
  }
  expect(await cellOf(6.5244, 3.3792)).toBe(latLngToCell(6.5244, 3.3792, 8));
  expect((await neighborsOf(pentagons8[0])).length).toBe(5);
  await expect(neighborsOf('nope')).rejects.toThrow();
});
