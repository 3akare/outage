// Ingest wire schema and hand-written strict validator (event-ingest R1, R4, R8, R10; design section 5).
// No schema library (R11.6). Pure functions, no I/O, no clock.
import { isValidRes8Cell } from './h3.ts';

export const MAX_ELAPSED_MS = 604_800_000; // 7 days (brief, event-time.md)

export const STATE_TYPES = ['ARMED', 'DISARMED'] as const;
export const DETECTION_TYPES = ['UNPLUG', 'BATTERY_FULL', 'REPLUG', 'LABEL', 'REPORT'] as const;
/**
 * Legacy: the `reason` of a DISARMED heartbeat that APKs built with the removed Home Watch feature send while on
 * battery. Current apps never send it. The Worker accepts and ignores it so installed old phones do not log state
 * changes (ADR 0055).
 */
export const HEARTBEAT_ON_BATTERY = 'HEARTBEAT_ON_BATTERY';

export const EVENT_TYPES = ['ARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG', 'DISARMED', 'LABEL', 'REPORT'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export type StateType = (typeof STATE_TYPES)[number];

export type RejectCode =
  | 'UNKNOWN_FIELD'
  | 'BAD_CELL'
  | 'BAD_ELAPSED'
  | 'TIME_LOST'
  | 'SIMULATED_REJECTED'
  | 'BAD_FIELD' // not in the spec list: a known field is missing or has the wrong shape (permanent)
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

export const PERMANENT_CODES: readonly RejectCode[] = [
  'UNKNOWN_FIELD',
  'BAD_CELL',
  'BAD_ELAPSED',
  'TIME_LOST',
  'SIMULATED_REJECTED',
  'BAD_FIELD',
];

export function isPermanent(code: RejectCode): boolean {
  return PERMANENT_CODES.includes(code);
}

/** State events are write-behind and droppable; everything else (UNPLUG, BATTERY_FULL, REPLUG, LABEL, REPORT) is detection-class. */
export function isStateType(type: EventType): type is StateType {
  return type === 'ARMED' || type === 'DISARMED';
}

export interface BaseWireEvent {
  installId: string;
  seq: number;
  type: 'ARMED' | 'UNPLUG' | 'BATTERY_FULL' | 'REPLUG' | 'DISARMED';
  elapsedMs: number;
  cell: string;
  confidence: 'HIGH' | 'LOW';
  timeQuality: 'OK';
  stopReason?: string;
  reason?: string;
  schedulingDelayMs?: number | null;
  batteryPct?: number;
  plugType?: string;
}

/** alerts-and-light-alarm design section 4: the user's answer to "did the power go out?", tied to an UNPLUG by seq. */
export interface LabelWireEvent {
  installId: string;
  seq: number;
  type: 'LABEL';
  elapsedMs: number;
  cell: string;
  confidence: 'HIGH';
  timeQuality: 'OK';
  refSeq: number;
  answer: 'YES' | 'NO';
}

/** power-log R7.4: the user's "Power is out" tap. Only kind OUT is uploaded; "Power is back" stays on the phone (R7.3). */
export interface ReportWireEvent {
  installId: string;
  seq: number;
  type: 'REPORT';
  elapsedMs: number;
  cell: string;
  confidence: 'HIGH';
  timeQuality: 'OK';
  kind: 'OUT';
}

export type WireEvent = BaseWireEvent | LabelWireEvent | ReportWireEvent;

export interface EventsRequest {
  installId: string;
  events: WireEvent[];
}
export interface EventResult {
  seq: number;
  status: 'accepted' | 'duplicate' | 'rejected';
  code?: RejectCode;
  permanent?: boolean;
}
export interface EventsResponse {
  results: EventResult[];
  retryAfterMs?: number;
}
export interface RegisterResponse {
  installId: string;
  token: string;
}
export interface DeleteRequest {
  installId: string;
  cells: string[];
}

/** Legacy `pairIds` sent by APKs built with the removed Home Watch feature: accepted when well formed, then ignored. */
const LEGACY_PAIR_ID = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{2}[0-9a-f]{32}$/;
const MAX_LEGACY_PAIR_IDS = 25;
const isLegacyPairId = (v: unknown): boolean => typeof v === 'string' && LEGACY_PAIR_ID.test(v);

const BASE_REQUIRED = ['installId', 'seq', 'type', 'elapsedMs', 'cell', 'confidence', 'timeQuality'] as const;
const BASE_OPTIONAL = ['stopReason', 'reason', 'schedulingDelayMs', 'batteryPct', 'plugType'] as const;
const BASE_FIELDS: ReadonlySet<string> = new Set([...BASE_REQUIRED, ...BASE_OPTIONAL]);
const LABEL_FIELDS: ReadonlySet<string> = new Set([...BASE_REQUIRED, 'refSeq', 'answer']);
const REPORT_FIELDS: ReadonlySet<string> = new Set([...BASE_REQUIRED, 'kind']);

/** 128-bit id as 26 lowercase base32 characters. */
export const INSTALL_ID_PATTERN = /^[a-z2-7]{26}$/;
// Free-text fields are short identifiers only (letters, digits, `_ . : -`), so no coordinates or sentences fit.
const SHORT_ID = /^[A-Za-z0-9_.:-]{1,40}$/;

export function isInstallId(value: unknown): value is string {
  return typeof value === 'string' && INSTALL_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export type ValidatedEvent = { ok: true; event: WireEvent } | { ok: false; code: RejectCode };
const rej = (code: RejectCode): ValidatedEvent => ({ ok: false, code });

/**
 * Validate one event. `requestInstallId` is the install the token proved; an event for any other install is BAD_FIELD.
 * Check order: simulated marker, type, unknown fields, shape, timeQuality, elapsedMs, cell, the rest.
 */
export function validateEvent(raw: unknown, requestInstallId: string, maxElapsedMs = MAX_ELAPSED_MS): ValidatedEvent {
  if (!isRecord(raw)) return rej('BAD_FIELD');
  if (Object.hasOwn(raw, 'simulated')) return rej('SIMULATED_REJECTED'); // R10.1, property P9
  const type = raw.type;
  if (typeof type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(type)) return rej('BAD_FIELD');
  const allowed = type === 'LABEL' ? LABEL_FIELDS : type === 'REPORT' ? REPORT_FIELDS : BASE_FIELDS;
  for (const key of Object.keys(raw)) if (!allowed.has(key)) return rej('UNKNOWN_FIELD'); // R1.2
  for (const key of BASE_REQUIRED) if (!Object.hasOwn(raw, key)) return rej('BAD_FIELD');

  if (raw.installId !== requestInstallId) return rej('BAD_FIELD');
  if (!nonNegInt(raw.seq)) return rej('BAD_FIELD');
  if (typeof raw.timeQuality !== 'string') return rej('BAD_FIELD');
  if (raw.timeQuality !== 'OK') return rej('TIME_LOST'); // R4.3
  const elapsed = raw.elapsedMs;
  if (typeof elapsed !== 'number' || !Number.isInteger(elapsed) || elapsed < 0 || elapsed > maxElapsedMs) {
    return rej('BAD_ELAPSED'); // R4.1, R4.2
  }
  if (!isValidRes8Cell(raw.cell)) return rej('BAD_CELL'); // R1.3
  if (raw.confidence !== 'HIGH' && raw.confidence !== 'LOW') return rej('BAD_FIELD');

  if (type === 'LABEL') {
    if (raw.confidence !== 'HIGH') return rej('BAD_FIELD');
    if (!nonNegInt(raw.refSeq)) return rej('BAD_FIELD');
    if (raw.answer !== 'YES' && raw.answer !== 'NO') return rej('BAD_FIELD');
    return {
      ok: true,
      event: {
        installId: requestInstallId,
        seq: raw.seq,
        type: 'LABEL',
        elapsedMs: elapsed,
        cell: raw.cell,
        confidence: 'HIGH',
        timeQuality: 'OK',
        refSeq: raw.refSeq,
        answer: raw.answer,
      },
    };
  }

  if (type === 'REPORT') {
    if (raw.confidence !== 'HIGH') return rej('BAD_FIELD');
    if (raw.kind !== 'OUT') return rej('BAD_FIELD');
    return {
      ok: true,
      event: {
        installId: requestInstallId,
        seq: raw.seq,
        type: 'REPORT',
        elapsedMs: elapsed,
        cell: raw.cell,
        confidence: 'HIGH',
        timeQuality: 'OK',
        kind: 'OUT',
      },
    };
  }

  const event: BaseWireEvent = {
    installId: requestInstallId,
    seq: raw.seq,
    type: type as BaseWireEvent['type'],
    elapsedMs: elapsed,
    cell: raw.cell,
    confidence: raw.confidence,
    timeQuality: 'OK',
  };
  for (const key of ['stopReason', 'reason', 'plugType'] as const) {
    if (!Object.hasOwn(raw, key)) continue;
    const v = raw[key];
    if (typeof v !== 'string' || !SHORT_ID.test(v)) return rej('BAD_FIELD');
    event[key] = v;
  }
  if (Object.hasOwn(raw, 'schedulingDelayMs')) {
    const v = raw.schedulingDelayMs;
    if (v !== null && !nonNegInt(v)) return rej('BAD_FIELD');
    event.schedulingDelayMs = v as number | null;
  }
  if (Object.hasOwn(raw, 'batteryPct')) {
    const v = raw.batteryPct;
    if (!nonNegInt(v) || v > 100) return rej('BAD_FIELD');
    event.batteryPct = v;
  }
  return { ok: true, event };
}

export type ParsedRequest = { ok: true; installId: string; events: unknown[] } | { ok: false; reason: 'MALFORMED' | 'TOO_MANY_EVENTS' };

/** Request envelope: exactly `installId` and `events`. Events stay unvalidated so one bad event cannot fail the rest (R8.2). */
export function parseEventsRequest(raw: unknown, maxBatch: number): ParsedRequest {
  if (!isRecord(raw)) return { ok: false, reason: 'MALFORMED' };
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !Object.hasOwn(raw, 'installId') || !Object.hasOwn(raw, 'events')) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (!isInstallId(raw.installId) || !Array.isArray(raw.events)) return { ok: false, reason: 'MALFORMED' };
  if (raw.events.length > maxBatch) return { ok: false, reason: 'TOO_MANY_EVENTS' };
  return { ok: true, installId: raw.installId, events: raw.events };
}

export type ParsedDelete = { ok: true; installId: string; cells: string[] } | { ok: false };

/** An optional `pairIds` array from older APKs is still accepted (validated, then dropped) so their deletes succeed. */
export function parseDeleteRequest(raw: unknown, maxCells: number): ParsedDelete {
  if (!isRecord(raw)) return { ok: false };
  const keys = Object.keys(raw);
  const withPairs = Object.hasOwn(raw, 'pairIds');
  if (keys.length !== (withPairs ? 3 : 2) || !isInstallId(raw.installId) || !Array.isArray(raw.cells)) return { ok: false };
  if (raw.cells.length > maxCells || !raw.cells.every(isValidRes8Cell)) return { ok: false };
  if (withPairs && (!Array.isArray(raw.pairIds) || raw.pairIds.length > MAX_LEGACY_PAIR_IDS || !raw.pairIds.every(isLegacyPairId))) {
    return { ok: false };
  }
  return { ok: true, installId: raw.installId, cells: raw.cells as string[] };
}
