// Outage records for the field report and their classification (field-telemetry R5, design sections 4 and 5).
// Counts only: no install ID, no cell. Pure functions.

export type ScopeClass = 'CELL' | 'GROUP' | 'PARENT';

/** `OUTAGE_RECORD`: written by the area actor when an outage opens, changes or closes (design section 4). */
export interface OutageRecordOut {
  kind: 'OUTAGE_RECORD';
  /** Opaque key of the outage inside its area, so a changed record replaces the earlier one. Not an install ID and not a cell. */
  key: string;
  scopeClass: ScopeClass;
  startMs: number;
  endMs: number | null;
  level: 'POSSIBLE' | 'CONFIRMED';
  /** Drops the engine counted (its `k`). */
  drops: number;
  /** Armed phones in the scope when it was decided (its `n`). */
  armedN: number;
  /** Eligible drops by label: yes, no, unlabeled (R5.1). */
  labelsYes: number;
  labelsNo: number;
  labelsNone: number;
  confirmedMs: number | null;
  /**
   * The engine no longer holds this outage without having closed it: its drops were relabeled (a "No" label makes an
   * unplug human, so a false alarm leaves the engine) or re-evaluated away. The level is the last one seen.
   */
  withdrawn: boolean;
}

/** `MISS`: a "Yes" label whose unplug no Possible or Confirmed outage covers (R5.5). */
export interface MissRecordOut {
  kind: 'MISS';
  /** Time of the labeled unplug. */
  atMs: number;
  /** Armed phones in the unplug's cell when the miss was recorded. */
  armedN: number;
}

export type FieldRecord = OutageRecordOut | MissRecordOut;

export type OutageClass = 'NOT_CLASSIFIED' | 'CONFIRMED_TRUE' | 'FALSE_ALARM' | 'INCONCLUSIVE';

export interface LabelCounts {
  yes: number;
  no: number;
  none: number;
}

/**
 * Design section 5. Only a Confirmed outage is classified. One "Yes" makes it confirmed-true. A false alarm needs at
 * least one "No" and no "Yes" and no unlabeled drop; a mix of "No" and unlabeled drops is inconclusive.
 */
export function classifyOutage(o: {
  level: 'POSSIBLE' | 'CONFIRMED';
  labelsYes: number;
  labelsNo: number;
  labelsNone: number;
}): OutageClass {
  if (o.level !== 'CONFIRMED') return 'NOT_CLASSIFIED';
  if (o.labelsYes >= 1) return 'CONFIRMED_TRUE';
  if (o.labelsNo >= 1 && o.labelsNone === 0) return 'FALSE_ALARM';
  return 'INCONCLUSIVE';
}

/**
 * Label counts over the eligible drops of one outage (R5.1). A drop is identified by (installId, seq). As in the engine
 * (`labelFor` in core/detection/src/merge.ts), "No" wins over "Yes", so the count does not depend on label order.
 * Labels that refer to no eligible drop are not counted.
 */
export function countLabels(
  drops: readonly { installId: string; seq: number }[],
  labels: readonly { installId: string; unplugSeq: number; answer: 'YES' | 'NO' }[],
): LabelCounts {
  const answer = new Map<string, 'YES' | 'NO'>();
  for (const l of labels) {
    const k = `${l.installId}|${l.unplugSeq}`;
    if (answer.get(k) !== 'NO') answer.set(k, l.answer);
  }
  const seen = new Set<string>();
  const c: LabelCounts = { yes: 0, no: 0, none: 0 };
  for (const d of drops) {
    const k = `${d.installId}|${d.seq}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = answer.get(k);
    if (a === 'YES') c.yes++;
    else if (a === 'NO') c.no++;
    else c.none++;
  }
  return c;
}
