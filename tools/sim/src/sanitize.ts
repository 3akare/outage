// Fixture sanitizer and forbidden-shape scanner (demo-mode task 2, design section 6, R6.2 and R6.3). Build time only.
// A raw field recording stays on the owner's machine. `sanitize` turns it into the shared fixture format:
// install IDs become aliases (A1, A2, ...), times become offsets from the first event, and each res-8 cell becomes its
// res-7 parent. `scanForbidden` then looks for shapes that must never reach a committed fixture or a replay file.
// Privacy rules: .kiro/steering/privacy.md (no exact location, no install ID).
import { INSTALL_ID_PATTERN, isCell, parentOf } from '@outage/shared';
import type { Fixture } from './replay.ts';

export type RawEventType = Fixture['events'][number]['type'];

/** One event of a raw recording. These are real events: they carry no `simulated` flag. */
export interface RawEvent {
  installId: string;
  seq: number;
  type: RawEventType;
  /** Absolute epoch time in milliseconds. */
  eventTimeMs: number;
  /** Res-8 cell of the install. */
  cell: string;
  confidence?: 'HIGH' | 'LOW';
  schedulingDelayMs?: number | null;
}

export interface RawRecording {
  events: readonly RawEvent[];
  labels: readonly { installId: string; unplugSeq: number; answer: 'YES' | 'NO' }[];
}

export class SanitizeError extends Error {}

export type ForbiddenKind = 'INSTALL_ID' | 'RES8_CELL' | 'ISO_DATE' | 'EPOCH_MS' | 'COORDINATES';

export interface Finding {
  /** JSON path of the offending key or value, for example `events[3].alias`. */
  path: string;
  kind: ForbiddenKind;
}

// 26 base32 characters: INSTALL_ID_PATTERN from the ingest contract, without its anchors.
const INSTALL_ID_IN_TEXT = new RegExp(`(?<![a-z0-9])${INSTALL_ID_PATTERN.source.replace(/^\^|\$$/g, '')}(?![a-z0-9])`);
const HEX15 = /(?<![0-9a-f])[0-9a-f]{15}(?![0-9a-f])/g;
const ISO_DATE = /(?<!\d)(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/;
const LAT_LNG = /-?\d{1,3}\.\d{4,}\s*[,;]\s*-?\d{1,3}\.\d{4,}/;
const COORDINATE_KEY = /^(lat|lng|lon|long|latitude|longitude|coords?|coordinates)$/i;
/** 2000-01-01 in epoch milliseconds. A sanitized time is an offset and stays far below this. */
const EPOCH_MS_FLOOR = 946_684_800_000;

function scanString(text: string): ForbiddenKind[] {
  const kinds: ForbiddenKind[] = [];
  if (INSTALL_ID_IN_TEXT.test(text)) kinds.push('INSTALL_ID');
  if ((text.match(HEX15) ?? []).some((h) => isCell(h))) kinds.push('RES8_CELL');
  if (ISO_DATE.test(text)) kinds.push('ISO_DATE');
  if (LAT_LNG.test(text)) kinds.push('COORDINATES');
  return kinds;
}

/** Every forbidden shape found in the keys and values of any JSON-like value. An empty list means clean. */
export function scanForbidden(value: unknown): Finding[] {
  const found: Finding[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      for (const kind of scanString(v)) found.push({ path, kind });
    } else if (typeof v === 'number') {
      if (Number.isFinite(v) && Math.abs(v) >= EPOCH_MS_FLOOR) found.push({ path, kind: 'EPOCH_MS' });
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        walk(x, `${path}[${i}]`);
      });
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const at = path === '' ? k : `${path}.${k}`;
        for (const kind of scanString(k)) found.push({ path: `${at} (key)`, kind });
        if (COORDINATE_KEY.test(k)) found.push({ path: `${at} (key)`, kind: 'COORDINATES' });
        walk(x, at);
      }
    }
  };
  walk(value, '');
  return found;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Raw recording to sanitized fixture. Aliases follow each install's first event (ties by install ID, which the output
 * never shows). The fixture format has one area, so a recording across two res-7 parents is refused.
 * Output events carry `simulated: true` because the replay of a recording is a simulation of it (ADR 0015).
 */
export function sanitize(raw: RawRecording): Fixture {
  if (raw.events.length === 0) throw new SanitizeError('recording has no events');
  const parents = new Set<string>();
  for (const e of raw.events) {
    if (!isCell(e.cell)) throw new SanitizeError('event cell is not a valid res-8 cell');
    if (!Number.isSafeInteger(e.eventTimeMs) || e.eventTimeMs < 0) throw new SanitizeError('bad event time');
    parents.add(parentOf(e.cell));
  }
  const [parent, ...others] = parents;
  if (parent === undefined || others.length > 0) throw new SanitizeError('recording spans more than one area');

  const startMs = Math.min(...raw.events.map((e) => e.eventTimeMs));
  const firstSeen = new Map<string, number>();
  for (const e of raw.events) {
    firstSeen.set(e.installId, Math.min(firstSeen.get(e.installId) ?? e.eventTimeMs, e.eventTimeMs));
  }
  const order = [...firstSeen].sort((a, b) => a[1] - b[1] || byText(a[0], b[0]));
  const alias = new Map(order.map(([id], i) => [id, `A${i + 1}`]));
  const aliasOf = (id: string): string => {
    const a = alias.get(id);
    if (a === undefined) throw new SanitizeError('label for an install with no events');
    return a;
  };

  const events: Fixture['events'] = raw.events
    .map((e) => {
      const out: Fixture['events'][number] = {
        alias: aliasOf(e.installId),
        seq: e.seq,
        type: e.type,
        tMs: e.eventTimeMs - startMs,
        simulated: true,
      };
      if (e.confidence !== undefined) out.confidence = e.confidence;
      if (e.schedulingDelayMs !== undefined) out.schedulingDelayMs = e.schedulingDelayMs;
      return out;
    })
    .sort((a, b) => a.tMs - b.tMs || byText(a.alias, b.alias) || a.seq - b.seq);
  const labels: Fixture['labels'] = raw.labels.map((l) => ({
    alias: aliasOf(l.installId),
    unplugSeq: l.unplugSeq,
    answer: l.answer,
    simulated: true,
  }));
  const fixture: Fixture = {
    source: 'RECORDED',
    cell: parent,
    phones: order.map(([id]) => ({ alias: aliasOf(id), role: 'REAL' as const })),
    events,
    labels,
  };
  const leaks = scanForbidden(fixture);
  if (leaks.length > 0) {
    throw new SanitizeError(
      `sanitized fixture has forbidden shapes: ${leaks.map((f) => `${f.kind} at ${f.path}`).join(', ')}`,
    );
  }
  return fixture;
}
