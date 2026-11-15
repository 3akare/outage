// Device-day telemetry aggregate and its strict validator (field-telemetry R1 to R3, design section 3).
// No schema library. Pure functions, no I/O, no clock. The Kotlin aggregator builds the same shape and reads the
// same fixtures (packages/shared/fixtures/telemetry/).
import { INSTALL_ID_PATTERN } from './ingest.ts';

export const DEVICE_DAY_VERSION = 1;
export const MAX_DEVICE_DAY_BYTES = 8192; // R2.3
export const MAKERS = ['tecno', 'infinix', 'itel', 'samsung', 'xiaomi', 'pixel', 'other'] as const;
export type Maker = (typeof MAKERS)[number];
/** Fixed upper edges of the gap-length histogram buckets, in ms. A bucket count is edges + 1 (the last is open-ended). */
export const GAP_EDGES_MS = [60_000, 300_000, 900_000, 3_600_000, 14_400_000] as const;
export const GAP_BUCKETS = GAP_EDGES_MS.length + 1;
export const MAX_DELAY_SAMPLES = 64; // per source, newest (design section 3)
export const MAX_REPLUG_SAMPLES = 16;
/** Longest day on a clock change plus margin; a larger charging total is rejected as impossible. */
export const MAX_DAY_MS = 26 * 3_600_000;
const MAX_KEYS = 32; // map entries (standby, stopReasons) and gap reasons
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,40}$/;
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export interface DeviceDay {
  v: 1;
  installId: string;
  day: string;
  maker: Maker;
  androidMajor: number;
  mode: { normalMs: number; stationMs: number };
  chargingMs: number;
  armedMs: number;
  gaps: { reason: string; count: number; lenHistMs: number[] }[];
  delayJobMs: number[];
  delayReceiverMs: number[];
  replugToRingMs: number[];
  prompts: { shown: number; yes: number; no: number; timeout: number };
  alarms: { expected: number; rung: number };
  writeFailures: number;
  standby: Record<string, number>;
  exemption: boolean;
  stopReasons: Record<string, number>;
}

export type DeviceDayCode = 'MALFORMED' | 'UNKNOWN_FIELD' | 'BAD_FIELD' | 'TOO_LARGE';
export type ParsedDeviceDay = { ok: true; value: DeviceDay } | { ok: false; code: DeviceDayCode; path?: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const nat = (x: unknown, max = Number.MAX_SAFE_INTEGER): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max;

class Reject extends Error {
  constructor(
    readonly code: DeviceDayCode,
    readonly path: string,
  ) {
    super(code);
  }
}
const bad = (path: string): never => {
  throw new Reject('BAD_FIELD', path);
};

/** Exactly these keys, no more, no fewer (R3.4). */
function exact(o: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!isObj(o)) return bad(path);
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new Reject('UNKNOWN_FIELD', path ? `${path}.${k}` : k);
  for (const k of keys) if (!Object.hasOwn(o, k)) return bad(path ? `${path}.${k}` : k);
  return o;
}

function natList(x: unknown, cap: number, path: string): number[] {
  if (!Array.isArray(x) || x.length > cap || !x.every((n) => nat(n, MAX_DAY_MS))) return bad(path);
  return x as number[];
}

function counters(x: unknown, path: string): Record<string, number> {
  if (!isObj(x)) return bad(path);
  const keys = Object.keys(x);
  if (keys.length > MAX_KEYS) return bad(path);
  for (const k of keys) if (!KEY_PATTERN.test(k) || !nat(x[k], 1_000_000)) return bad(`${path}.${k}`);
  return { ...(x as Record<string, number>) };
}

/**
 * Strict parse of one uploaded aggregate. Any key outside the schema is UNKNOWN_FIELD (R3.4); a wrong shape is
 * BAD_FIELD; an encoded size above 8 KiB is TOO_LARGE (R2.3). Returns a fresh copy with the keys in schema order.
 */
export function parseDeviceDay(input: unknown): ParsedDeviceDay {
  try {
    if (!isObj(input)) return { ok: false, code: 'MALFORMED' };
    const o = exact(
      input,
      [
        'v', 'installId', 'day', 'maker', 'androidMajor', 'mode', 'chargingMs', 'armedMs', 'gaps', 'delayJobMs',
        'delayReceiverMs', 'replugToRingMs', 'prompts', 'alarms', 'writeFailures', 'standby', 'exemption', 'stopReasons',
      ],
      '',
    );
    if (o.v !== DEVICE_DAY_VERSION) bad('v');
    if (typeof o.installId !== 'string' || !INSTALL_ID_PATTERN.test(o.installId)) bad('installId');
    if (typeof o.day !== 'string' || !DAY_PATTERN.test(o.day)) bad('day');
    if (typeof o.maker !== 'string' || !(MAKERS as readonly string[]).includes(o.maker)) bad('maker');
    if (!nat(o.androidMajor, 99) || (o.androidMajor as number) < 1) bad('androidMajor');
    const m = exact(o.mode, ['normalMs', 'stationMs'], 'mode');
    if (!nat(m.normalMs, MAX_DAY_MS)) bad('mode.normalMs');
    if (!nat(m.stationMs, MAX_DAY_MS)) bad('mode.stationMs');
    if (!nat(o.chargingMs, MAX_DAY_MS)) bad('chargingMs');
    if (!nat(o.armedMs, MAX_DAY_MS) || (o.armedMs as number) > (o.chargingMs as number)) bad('armedMs');
    if (!Array.isArray(o.gaps) || o.gaps.length > MAX_KEYS) bad('gaps');
    const reasons = new Set<string>();
    const gaps = (o.gaps as unknown[]).map((g, i) => {
      const e = exact(g, ['reason', 'count', 'lenHistMs'], `gaps[${i}]`);
      if (typeof e.reason !== 'string' || !KEY_PATTERN.test(e.reason) || reasons.has(e.reason)) bad(`gaps[${i}].reason`);
      reasons.add(e.reason as string);
      if (!nat(e.count, 1_000_000)) bad(`gaps[${i}].count`);
      const h = e.lenHistMs;
      if (!Array.isArray(h) || h.length !== GAP_BUCKETS || !h.every((n) => nat(n, 1_000_000))) bad(`gaps[${i}].lenHistMs`);
      if ((h as number[]).reduce((a, b) => a + b, 0) !== e.count) bad(`gaps[${i}].lenHistMs`);
      return { reason: e.reason as string, count: e.count as number, lenHistMs: [...(h as number[])] };
    });
    const delayJobMs = natList(o.delayJobMs, MAX_DELAY_SAMPLES, 'delayJobMs');
    const delayReceiverMs = natList(o.delayReceiverMs, MAX_DELAY_SAMPLES, 'delayReceiverMs');
    const replugToRingMs = natList(o.replugToRingMs, MAX_REPLUG_SAMPLES, 'replugToRingMs');
    const p = exact(o.prompts, ['shown', 'yes', 'no', 'timeout'], 'prompts');
    for (const k of ['shown', 'yes', 'no', 'timeout']) if (!nat(p[k], 1_000_000)) bad(`prompts.${k}`);
    const a = exact(o.alarms, ['expected', 'rung'], 'alarms');
    for (const k of ['expected', 'rung']) if (!nat(a[k], 1_000_000)) bad(`alarms.${k}`);
    if (!nat(o.writeFailures, 1_000_000)) bad('writeFailures');
    if (typeof o.exemption !== 'boolean') bad('exemption');
    const value: DeviceDay = {
      v: 1,
      installId: o.installId as string,
      day: o.day as string,
      maker: o.maker as Maker,
      androidMajor: o.androidMajor as number,
      mode: { normalMs: m.normalMs as number, stationMs: m.stationMs as number },
      chargingMs: o.chargingMs as number,
      armedMs: o.armedMs as number,
      gaps,
      delayJobMs: [...delayJobMs],
      delayReceiverMs: [...delayReceiverMs],
      replugToRingMs: [...replugToRingMs],
      prompts: { shown: p.shown as number, yes: p.yes as number, no: p.no as number, timeout: p.timeout as number },
      alarms: { expected: a.expected as number, rung: a.rung as number },
      writeFailures: o.writeFailures as number,
      standby: counters(o.standby, 'standby'),
      exemption: o.exemption as boolean,
      stopReasons: counters(o.stopReasons, 'stopReasons'),
    };
    // Every string in the value is ASCII (patterns above), so string length equals byte length.
    if (JSON.stringify(value).length > MAX_DEVICE_DAY_BYTES) {
      return { ok: false, code: 'TOO_LARGE' };
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, code: e.code, path: e.path };
    throw e;
  }
}
