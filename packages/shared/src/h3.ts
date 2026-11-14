// H3 helpers shared by the Worker and the tools. The phone computes its own cell (Kotlin) and the Worker only validates it.
// h3-js API (isValidCell, getResolution, cellToParent): https://uber.github.io/h3-js/#iscell
import { cellToParent, getResolution, isValidCell } from 'h3-js';

export const CELL_RESOLUTION = 8;
export const PARENT_RESOLUTION = 7;

// Canonical form only: 15 lowercase hex digits. The same cell must always map to the same actor name (R7.1).
const CANONICAL_INDEX = /^[0-9a-f]{15}$/;

/** True when `value` is a canonical, valid H3 index at resolution 8. */
export function isValidRes8Cell(value: unknown): value is string {
  return (
    typeof value === 'string' && CANONICAL_INDEX.test(value) && isValidCell(value) && getResolution(value) === CELL_RESOLUTION
  );
}

/** The res-7 parent of a valid res-8 cell: the name of its area actor (ADR 0006). Throws on an invalid cell. */
export function res7Parent(cell: string): string {
  if (!isValidRes8Cell(cell)) throw new Error('not a valid res-8 cell');
  return cellToParent(cell, PARENT_RESOLUTION);
}
