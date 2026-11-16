// H3 helpers shared by the Worker and the tools. The phone computes its own cell (Kotlin) and the Worker only validates it.
// Hot path (isCell, parentOf, childrenOf) is pure bit arithmetic on the 64-bit index and loads no library (area-cells R1.2, R13.4).
// Index layout: https://h3geo.org/docs/core-library/h3indexing/ (1 reserved bit, 4 mode bits, 3 reserved bits,
// 4 resolution bits, 7 base-cell bits, then 15 three-bit digits; digits beyond the resolution are 7).
// h3-js API (gridDisk, latLngToCell, cellToBoundary), loaded lazily: https://uber.github.io/h3-js/

export const CELL_RESOLUTION = 8;
export const PARENT_RESOLUTION = 7;

// Canonical form only: 15 lowercase hex digits. The same cell must always map to the same actor name (R7.1).
const CANONICAL_INDEX = /^[0-9a-f]{15}$/;

const MODE_CELL = 1n;
const RES_SHIFT = 52n;
const BASE_SHIFT = 45n;
const BASE_CELLS = 122n;
// Base cells that are pentagons. Their first non-zero digit may not be 1 (the deleted K-axes subsequence).
const PENTAGON_BASES = new Set([4n, 14n, 24n, 38n, 49n, 58n, 63n, 72n, 83n, 97n, 107n, 117n]);

const digitShift = (res: number): bigint => BigInt(3 * (15 - res));
const digitOf = (idx: bigint, res: number): bigint => (idx >> digitShift(res)) & 7n;
const baseOf = (idx: bigint): bigint => (idx >> BASE_SHIFT) & 0x7fn;
const resOf = (idx: bigint): number => Number((idx >> RES_SHIFT) & 0xfn);

/** True when `value` is a canonical, valid H3 index at resolution 8. Pure; agrees with h3-js `isValidCell` plus res 8. */
export function isCell(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_INDEX.test(value)) return false;
  const idx = BigInt(`0x${value}`);
  if (idx >> 59n !== MODE_CELL) return false; // top bit and mode: 0b0_0001
  if (((idx >> 56n) & 7n) !== 0n) return false; // reserved bits
  if (resOf(idx) !== CELL_RESOLUTION) return false;
  const base = baseOf(idx);
  if (base >= BASE_CELLS) return false;
  let leading = true;
  for (let r = 1; r <= 15; r++) {
    const d = digitOf(idx, r);
    if (r <= CELL_RESOLUTION) {
      if (d === 7n) return false;
      if (leading && d !== 0n) {
        leading = false;
        if (d === 1n && PENTAGON_BASES.has(base)) return false;
      }
    } else if (d !== 7n) return false;
  }
  return true;
}

/** Same as `isCell`; the name the ingest code already uses. */
export const isValidRes8Cell = isCell;

const toHex = (idx: bigint): string => idx.toString(16).padStart(15, '0');

/** The res-7 parent of a valid res-8 cell: the name of its area actor (ADR 0006). Throws on an invalid cell. */
export function parentOf(cell: string): string {
  if (!isCell(cell)) throw new Error('not a valid res-8 cell');
  const idx = BigInt(`0x${cell}`);
  const withRes = (idx & ~(0xfn << RES_SHIFT) & ~(7n << digitShift(CELL_RESOLUTION))) | (BigInt(PARENT_RESOLUTION) << RES_SHIFT);
  return toHex(withRes | (7n << digitShift(CELL_RESOLUTION)));
}
export const res7Parent = parentOf;

/** True when `value` is a canonical, valid res-7 index. */
export function isParent(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_INDEX.test(value)) return false;
  const idx = BigInt(`0x${value}`);
  if (resOf(idx) !== PARENT_RESOLUTION) return false;
  // Re-use the res-8 check on the child with digit 0, which has the same validity.
  const child = (idx & ~(0xfn << RES_SHIFT) & ~(7n << digitShift(CELL_RESOLUTION))) | (BigInt(CELL_RESOLUTION) << RES_SHIFT);
  return isCell(toHex(child));
}

/** The res-8 children of a res-7 parent: 7, or 6 for a pentagon. Throws on an invalid parent. */
export function childrenOf(parent: string): string[] {
  if (!isParent(parent)) throw new Error('not a valid res-7 cell');
  const idx = BigInt(`0x${parent}`);
  const base = (idx & ~(0xfn << RES_SHIFT) & ~(7n << digitShift(CELL_RESOLUTION))) | (BigInt(CELL_RESOLUTION) << RES_SHIFT);
  const out: string[] = [];
  for (let d = 0n; d <= 6n; d++) {
    const child = toHex(base | (d << digitShift(CELL_RESOLUTION)));
    if (isCell(child)) out.push(child);
  }
  return out;
}

type H3 = typeof import('h3-js');
let lib: Promise<H3> | undefined;
const h3 = (): Promise<H3> => {
  lib ??= import('h3-js');
  return lib;
};

/** Res-8 cell for a point. The phone does this itself and discards the coordinates; the Worker never stores them. */
export async function cellOf(lat: number, lng: number): Promise<string> {
  return (await h3()).latLngToCell(lat, lng, CELL_RESOLUTION);
}

/** The ring-1 neighbors of a res-8 cell (6, or 5 for a pentagon), sorted. Throws on an invalid cell. */
export async function neighborsOf(cell: string): Promise<string[]> {
  if (!isCell(cell)) throw new Error('not a valid res-8 cell');
  return (await h3()).gridDisk(cell, 1).filter((c) => c !== cell).sort();
}

/** Outline of one cell as [lat, lng] pairs. For public views only the outline of a published scope may be built. */
export async function boundaryOf(cell: string): Promise<[number, number][]> {
  if (!isCell(cell) && !isParent(cell)) throw new Error('not a valid res-7 or res-8 cell');
  return (await h3()).cellToBoundary(cell) as [number, number][];
}
