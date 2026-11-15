// Strict reader for the admin endpoint's JSON (field-telemetry R6.4: the generator works from the day's JSON alone).
// The Worker already validated every device-day on upload. This re-checks the shape of what arrives over the network, so a
// wrong or hostile file cannot reach the report. Anything outside the schema is rejected, never printed.
import {
  ALIAS_PATTERN,
  type DeviceDay,
  type FieldDump,
  MAKERS,
  type MissRecordOut,
  type OutageRecordOut,
  parseDeviceDay,
  type SilentDevice,
} from '@outage/shared';

export type ParsedDump = { ok: true; value: FieldDump } | { ok: false; reason: string };

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Stands in for the install ID so `parseDeviceDay` can check every other field. Never leaves this file. */
const PLACEHOLDER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const nat = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const hasOnly = (o: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));

function outage(x: unknown): OutageRecordOut | null {
  const keys = [
    'kind',
    'key',
    'scopeClass',
    'startMs',
    'endMs',
    'level',
    'drops',
    'armedN',
    'labelsYes',
    'labelsNo',
    'labelsNone',
    'confirmedMs',
    'withdrawn',
  ];
  if (!isObj(x) || !hasOnly(x, keys)) return null;
  const ok =
    x.kind === 'OUTAGE_RECORD' &&
    typeof x.key === 'string' &&
    /^[0-9a-f]{16}$/.test(x.key) &&
    (x.scopeClass === 'CELL' || x.scopeClass === 'GROUP' || x.scopeClass === 'PARENT') &&
    nat(x.startMs) &&
    (x.endMs === null || nat(x.endMs)) &&
    (x.level === 'POSSIBLE' || x.level === 'CONFIRMED') &&
    nat(x.drops) &&
    nat(x.armedN) &&
    nat(x.labelsYes) &&
    nat(x.labelsNo) &&
    nat(x.labelsNone) &&
    (x.confirmedMs === null || nat(x.confirmedMs)) &&
    typeof x.withdrawn === 'boolean';
  return ok ? (x as unknown as OutageRecordOut) : null;
}

function miss(x: unknown): MissRecordOut | null {
  if (!isObj(x) || !hasOnly(x, ['kind', 'atMs', 'armedN'])) return null;
  return x.kind === 'MISS' && nat(x.atMs) && nat(x.armedN) ? (x as unknown as MissRecordOut) : null;
}

function silent(x: unknown): SilentDevice | null {
  if (!isObj(x) || !hasOnly(x, ['alias', 'maker', 'androidMajor', 'lastDay'])) return null;
  const ok =
    typeof x.alias === 'string' &&
    ALIAS_PATTERN.test(x.alias) &&
    typeof x.maker === 'string' &&
    (MAKERS as readonly string[]).includes(x.maker) &&
    nat(x.androidMajor) &&
    typeof x.lastDay === 'string' &&
    DAY.test(x.lastDay);
  return ok ? (x as unknown as SilentDevice) : null;
}

export function parseFieldDump(input: unknown): ParsedDump {
  const no = (reason: string): ParsedDump => ({ ok: false, reason });
  if (!isObj(input) || !hasOnly(input, ['v', 'day', 'devices', 'silent', 'outages', 'misses']))
    return no('unexpected shape');
  if (input.v !== 1) return no('unknown version');
  if (typeof input.day !== 'string' || !DAY.test(input.day)) return no('bad day');
  if (!Array.isArray(input.devices) || !Array.isArray(input.silent)) return no('devices or silent is not a list');
  if (!Array.isArray(input.outages) || !Array.isArray(input.misses)) return no('outages or misses is not a list');

  const aliases = new Set<string>();
  const devices: FieldDump['devices'] = [];
  for (const [i, d] of input.devices.entries()) {
    if (!isObj(d) || typeof d.alias !== 'string' || !ALIAS_PATTERN.test(d.alias) || aliases.has(d.alias)) {
      return no(`device ${i}: bad alias`);
    }
    if (Object.hasOwn(d, 'installId')) return no(`device ${i}: carries an install ID`);
    aliases.add(d.alias);
    const { alias, ...rest } = d;
    const parsed = parseDeviceDay({ ...rest, installId: PLACEHOLDER_ID });
    if (!parsed.ok) return no(`device ${i}: ${parsed.code}${parsed.path ? ` at ${parsed.path}` : ''}`);
    const { installId: _drop, ...value } = parsed.value as DeviceDay;
    devices.push({ alias, ...value });
  }
  const quiet: SilentDevice[] = [];
  for (const [i, s] of input.silent.entries()) {
    const v = silent(s);
    if (!v || aliases.has(v.alias)) return no(`silent ${i}: bad entry`);
    aliases.add(v.alias);
    quiet.push(v);
  }
  const outages: OutageRecordOut[] = [];
  for (const [i, o] of input.outages.entries()) {
    const v = outage(o);
    if (!v) return no(`outage ${i}: bad record`);
    outages.push(v);
  }
  const misses: MissRecordOut[] = [];
  for (const [i, m] of input.misses.entries()) {
    const v = miss(m);
    if (!v) return no(`miss ${i}: bad record`);
    misses.push(v);
  }
  return { ok: true, value: { v: 1, day: input.day, devices, silent: quiet, outages, misses } };
}
