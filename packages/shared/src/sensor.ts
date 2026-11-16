// Sensor types on the phone (sensor-android design section 7, station-mode section 7). The Kotlin sensor in
// apps/android mirrors these; the fixtures in packages/shared/fixtures/sensor/ are read by both test suites.
// Pure: no I/O, no clock. No location: the cell is added by the Uploader, never by the sensor (R9.6).

export const SENSOR_EVENT_TYPES = ['ARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG', 'DISARMED', 'LABEL'] as const;
export type SensorEventType = (typeof SENSOR_EVENT_TYPES)[number];
export const TIME_QUALITIES = ['OK', 'LOST'] as const;
export type TimeQuality = (typeof TIME_QUALITIES)[number];
export const CONFIDENCES = ['HIGH', 'LOW'] as const;
export type Confidence = (typeof CONFIDENCES)[number];
export const PLUG_TYPES = ['AC', 'USB', 'WIRELESS', 'DOCK', 'NONE'] as const;
export type PlugType = (typeof PLUG_TYPES)[number];
export const SOURCES = ['RECEIVER', 'JOB'] as const;
export type Source = (typeof SOURCES)[number];

/** One event as the app reads it from the sensor (`getPendingEvents`). `elapsedMs` is computed at read time. */
export interface SensorEvent {
  seq: number;
  type: SensorEventType;
  elapsedMs: number;
  timeQuality: TimeQuality;
  confidence: Confidence;
  stopReason: string | null;
  batteryPct: number;
  plugType: PlugType;
  schedulingDelayMs: number | null;
  reason: string | null;
  /** station-mode R3.4: which driver saw it. Local only for now, not on the ingest wire (ADR 0033). */
  source: Source;
}

/** Field-test telemetry for one period (R10). */
export interface SensorTelemetry {
  periodMs: number;
  chargingMs: number;
  armedMs: number;
  /** armedMs / chargingMs, or null when the phone did not charge. */
  armedRatio: number | null;
  replugDelaysMs: number[];
  gaps: { reason: string; lengthMs: number | null }[];
}

/** What the sensor knows about why it may miss events (R8.4, R10.4). */
export interface Diagnostics {
  androidSdk: number;
  manufacturer: string;
  standbyBucket: string | null;
  batteryExempt: boolean | null;
  receiverRunning: boolean;
  receiverBlockedReason: string | null;
  notificationHidden: boolean;
  stopReasonCounts: Record<string, number>;
  broadcastMismatches: number;
  writeFailures: number;
  recentGaps: { reason: string; lengthMs: number | null }[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);
const optStr = (v: unknown) => v === null || typeof v === 'string';

const SENSOR_EVENT_FIELDS: ReadonlySet<string> = new Set([
  'seq',
  'type',
  'elapsedMs',
  'timeQuality',
  'confidence',
  'stopReason',
  'batteryPct',
  'plugType',
  'schedulingDelayMs',
  'reason',
  'source',
]);

/** Strict check of a sensor event: every field present, no extra field. Used by the contract tests. */
export function isSensorEvent(v: unknown): v is SensorEvent {
  if (!isRecord(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== SENSOR_EVENT_FIELDS.size || keys.some((k) => !SENSOR_EVENT_FIELDS.has(k))) return false;
  return (
    nonNegInt(v.seq) &&
    oneOf(SENSOR_EVENT_TYPES, v.type) &&
    nonNegInt(v.elapsedMs) &&
    oneOf(TIME_QUALITIES, v.timeQuality) &&
    oneOf(CONFIDENCES, v.confidence) &&
    optStr(v.stopReason) &&
    nonNegInt(v.batteryPct) &&
    (v.batteryPct as number) <= 100 &&
    oneOf(PLUG_TYPES, v.plugType) &&
    (v.schedulingDelayMs === null || nonNegInt(v.schedulingDelayMs)) &&
    optStr(v.reason) &&
    oneOf(SOURCES, v.source)
  );
}
