// The public scope view, as defined in .kiro/specs/area-cells/design.md section 5 (ADR 0007).
// The public index (task 7) will supply these; the web code only reads them.
export type Precision = 'CELL' | 'LINKED' | 'COARSE';
export type OutageLevel = 'POSSIBLE' | 'CONFIRMED';

export type PublicOutage = {
  startMs: number;
  endMs: number | null;
  level: OutageLevel;
  precision: Precision;
};

export type PublicScopeView = {
  scopeKind: 'CELL' | 'GROUP' | 'PARENT';
  precision: Precision;
  boundary: string[]; // res-8 cells (CELL, GROUP) or the parent res-7 cell
  status: 'NORMAL' | 'POSSIBLE' | 'CONFIRMED';
  openOutage?: { startMs: number; level: OutageLevel; precision: Precision };
  lastRestoredAtMs?: number;
  history30d: PublicOutage[];
  phones: '3+';
};
