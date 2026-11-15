// Field-telemetry records from the area reducer (field-telemetry task 3, R5; design sections 4 and 5).
// Pure helpers. Emitted records hold counts only: no install ID, no cell. The bookkeeping below (`FieldSent`) lives in
// the area state next to the event log and engine states, which already hold the same install IDs and cells.
import type { Decision as EngineDecision } from '@outage/detection';
import { countLabels, type MissRecordOut, type OutageRecordOut, type ScopeClass } from '@outage/shared';
import type { LoggedEvent, LoggedLabel } from './reducer.ts';

/** A "Yes" label waiting until the engine has had a full window to cover its unplug. */
export interface MissPending {
  installId: string;
  unplugSeq: number;
  dueMs: number;
}

/** What the area remembers about one reported outage, to emit only changes and to follow it when the engine moves it. */
export interface FieldSentEntry {
  /** Opaque key used in the emitted record. */
  pubKey: string;
  scopeKey: string;
  cells: string[];
  /** Earliest start seen for this outage; label counts are taken from here. */
  startMs: number;
  rec: OutageRecordOut;
}
export type FieldSent = Record<string, FieldSentEntry>;

/**
 * Opaque, stable key for an outage record. The engine's outage ID embeds an install ID and the scope key holds cells,
 * so neither may leave the actor. Two 32-bit FNV-style passes, hex. Only a name, not a security boundary.
 */
export function opaqueKey(outageKey: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ outageKey.length;
  for (let i = 0; i < outageKey.length; i++) {
    a = Math.imul(a ^ outageKey.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ outageKey.charCodeAt(outageKey.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Eligible drops of an outage: the first UNPLUG of each install inside the scope within one window of the outage start.
 * Same window as the co-outage records used for linking (session-notes, area-cells task 9).
 */
export function eligibleDrops(
  log: readonly LoggedEvent[],
  cells: ReadonlySet<string>,
  startMs: number,
  windowMs: number,
): { installId: string; seq: number }[] {
  const first = new Map<string, LoggedEvent>();
  for (const e of log) {
    if (e.type !== 'UNPLUG' || !cells.has(e.cell)) continue;
    if (e.eventTimeMs < startMs || e.eventTimeMs > startMs + windowMs) continue;
    const cur = first.get(e.installId);
    if (!cur || e.eventTimeMs < cur.eventTimeMs) first.set(e.installId, e);
  }
  return [...first.values()].map((e) => ({ installId: e.installId, seq: e.seq }));
}

/** One outage as an engine evaluation in this request last saw it. */
export interface FieldObservation {
  outageKey: string; // `${scopeKey}|${outageId}`
  outageId: string;
  scopeKey: string;
  scopeClass: ScopeClass;
  cells: readonly string[];
  decisions: readonly EngineDecision[];
  latest: EngineDecision;
  /** The scope is the one shown for at least one cell with a drop, so this scope reports the outage. */
  selected: boolean;
}

export interface FieldStepInput {
  sent: FieldSent;
  observed: ReadonlyMap<string, FieldObservation>;
  /** Scope keys evaluated in this request, with the outage IDs their engine still holds (open, closed or archived). */
  held: ReadonlyMap<string, ReadonlySet<string>>;
  log: readonly LoggedEvent[];
  labels: readonly LoggedLabel[];
  labelsChanged: boolean;
  windowMs: number;
  pruneBeforeMs: number;
}

const body = (r: OutageRecordOut): string => JSON.stringify({ ...r, key: '' });

function labelled(
  rec: OutageRecordOut,
  e: Pick<FieldSentEntry, 'cells' | 'startMs'>,
  i: FieldStepInput,
): OutageRecordOut {
  const c = countLabels(eligibleDrops(i.log, new Set(e.cells), e.startMs, i.windowMs), i.labels);
  return { ...rec, labelsYes: c.yes, labelsNo: c.no, labelsNone: c.none };
}

/**
 * Turn this request's engine observations into OUTAGE_RECORD emissions (R5.1). A record is emitted when it changed.
 * - An outage the engine re-dated (same scope, start within one window of a reported outage it no longer holds) keeps
 *   the earlier record's key and start, so one blackout is one record.
 * - A reported outage that its evaluated engine no longer holds is emitted once as `withdrawn`; its label counts keep
 *   following new labels. This is how an all-"No" false alarm reaches the report.
 */
export function fieldStep(i: FieldStepInput): { sent: FieldSent; records: OutageRecordOut[] } {
  const sent: FieldSent = { ...i.sent };
  const out: OutageRecordOut[] = [];
  const observedKeys = new Set(i.observed.keys());
  for (const k of [...i.observed.keys()].sort()) {
    const o = i.observed.get(k) as FieldObservation;
    let entry = sent[k];
    if (!entry) {
      const alias = Object.entries(sent)
        .filter(
          ([ok, e]) =>
            e.scopeKey === o.scopeKey &&
            !observedKeys.has(ok) &&
            !i.held.get(o.scopeKey)?.has(ok.slice(o.scopeKey.length + 1)),
        )
        .find(([, e]) => Math.abs(e.startMs - o.latest.startMs) <= i.windowMs);
      if (alias) {
        entry = alias[1];
        delete sent[alias[0]];
      }
    }
    if (!entry && !o.selected) continue;
    const d = o.latest;
    const startMs = Math.min(entry?.startMs ?? d.startMs, d.startMs);
    const confirmed = o.decisions.filter((x) => x.level === 'CONFIRMED').map((x) => x.decisionTimeMs);
    const base: OutageRecordOut = {
      kind: 'OUTAGE_RECORD',
      key: entry?.pubKey ?? opaqueKey(k),
      scopeClass: o.scopeClass,
      startMs,
      endMs: d.status === 'OPEN' ? null : (d.restoredAtMs ?? d.decisionTimeMs),
      level: d.level,
      drops: d.explanation.k,
      armedN: d.explanation.n,
      labelsYes: 0,
      labelsNo: 0,
      labelsNone: 0,
      confirmedMs:
        confirmed.length === 0
          ? (entry?.rec.confirmedMs ?? null)
          : Math.min(...confirmed, entry?.rec.confirmedMs ?? Infinity),
      withdrawn: false,
    };
    const e: FieldSentEntry = entry ?? {
      pubKey: base.key,
      scopeKey: o.scopeKey,
      cells: [...o.cells],
      startMs,
      rec: base,
    };
    const rec = labelled(base, { cells: e.cells, startMs }, i);
    if (!entry || body(entry.rec) !== body(rec)) out.push(rec);
    sent[k] = { ...e, startMs, cells: [...o.cells], rec };
  }
  for (const k of Object.keys(sent).sort()) {
    const e = sent[k];
    if (observedKeys.has(k)) continue;
    const held = i.held.get(e.scopeKey);
    const lost = held !== undefined && !held.has(k.slice(e.scopeKey.length + 1));
    if (!(lost || (e.rec.withdrawn && i.labelsChanged))) continue;
    const rec = labelled({ ...e.rec, withdrawn: true }, e, i);
    if (body(rec) !== body(e.rec)) {
      out.push(rec);
      sent[k] = { ...e, rec };
    }
  }
  for (const [k, e] of Object.entries(sent)) if (e.startMs < i.pruneBeforeMs) delete sent[k];
  return { sent, records: out };
}

/** An outage covers an unplug when the unplug's cell is in its scope and its time is inside [start, end or open]. */
export interface Coverage {
  cells: ReadonlySet<string>;
  startMs: number;
  endMs: number | null;
}

/**
 * Resolve pending "Yes" labels (R5.5). A label waits until its unplug is one window old. Then it is a miss when no
 * Possible or Confirmed outage covers the unplug. An unplug that also has a "No" label is not a miss ("No" wins, as in
 * the engine). A label whose unplug has left the log is dropped without a record.
 */
export function resolveMisses(
  pending: readonly MissPending[],
  log: readonly LoggedEvent[],
  labels: readonly LoggedLabel[],
  coverage: readonly Coverage[],
  armedIn: (cell: string) => number,
  nowMs: number,
): { misses: MissRecordOut[]; keep: MissPending[] } {
  const misses: MissRecordOut[] = [];
  const keep: MissPending[] = [];
  const done = new Set<string>();
  for (const p of pending) {
    const id = `${p.installId}|${p.unplugSeq}`;
    if (done.has(id)) continue;
    done.add(id);
    const u = log.find((e) => e.type === 'UNPLUG' && e.installId === p.installId && e.seq === p.unplugSeq);
    if (!u) continue;
    if (nowMs < p.dueMs) {
      keep.push(p);
      continue;
    }
    if (labels.some((l) => l.installId === p.installId && l.unplugSeq === p.unplugSeq && l.answer === 'NO')) continue;
    const covered = coverage.some(
      (c) => c.cells.has(u.cell) && u.eventTimeMs >= c.startMs && (c.endMs === null || u.eventTimeMs <= c.endMs),
    );
    if (!covered) misses.push({ kind: 'MISS', atMs: u.eventTimeMs, armedN: armedIn(u.cell) });
  }
  return { misses, keep };
}
