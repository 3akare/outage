import { KINDS, type DeviceLog, type Export, type FieldValue, type Kind, type Row } from './types.ts';

const ALIAS = /^[a-z0-9-]{1,32}$/;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate one row. Returns the row or a reason. Shared rules with the Worker (contract README). */
export function parseRow(v: unknown): Row | string {
  if (!isObj(v)) return 'row is not an object';
  if (!isInt(v.id) || v.id < 0) return 'id must be a whole number >= 0';
  if (typeof v.kind !== 'string' || !KINDS.includes(v.kind as Kind)) return `unknown kind ${String(v.kind)}`;
  if (!isNum(v.monoMs) || v.monoMs < 0) return 'monoMs must be a number >= 0';
  if (!isNum(v.wallMs)) return 'wallMs must be a number';
  if (!isInt(v.bootCount)) return 'bootCount must be a whole number';
  if (!isObj(v.fields)) return 'fields must be an object';
  const fields: Record<string, FieldValue> = {};
  for (const [k, x] of Object.entries(v.fields)) {
    if (x === null || typeof x === 'string' || typeof x === 'boolean' || isNum(x)) fields[k] = x;
    else return `field ${k} must be a string, number, boolean or null`;
  }
  if (JSON.stringify(fields).length > 2000) return 'fields longer than 2000 characters';
  return { id: v.id, kind: v.kind as Kind, monoMs: v.monoMs, wallMs: v.wallMs, bootCount: v.bootCount, fields };
}

/**
 * Put rows in time order. Boots follow each other in id order, and inside one boot `monoMs` is the true order. Ids alone
 * are not enough: the reference logger writes its PLUG row one second after the broadcast, with the broadcast time, so
 * its id comes after the job row it caused (found by the emulator run, 2026-11-14).
 */
export function timeOrder(rows: Row[]): Row[] {
  const byId = [...rows].sort((a, b) => a.id - b.id);
  const out: Row[] = [];
  let run: Row[] = [];
  const flush = () => { out.push(...run.sort((a, b) => a.monoMs - b.monoMs || a.id - b.id)); run = []; };
  for (const r of byId) { if (run.length && r.bootCount !== run[0].bootCount) flush(); run.push(r); }
  flush();
  return out;
}

/** Parse an export file. Invalid rows are counted, never guessed; rows are put in time order (see timeOrder). */
export function parseExport(v: unknown): { data: Export; problems: string[] } {
  const problems: string[] = [];
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.devices)) throw new Error('not a probe export (version 1)');
  const devices: DeviceLog[] = [];
  for (const d of v.devices) {
    if (!isObj(d) || !isObj(d.device) || !Array.isArray(d.rows)) { problems.push('device entry malformed'); continue; }
    const dev = d.device;
    if (typeof dev.alias !== 'string' || !ALIAS.test(dev.alias)) { problems.push(`bad alias ${String(dev.alias)}`); continue; }
    const rows: Row[] = [];
    const seen = new Set<number>();
    for (const raw of d.rows) {
      const r = parseRow(raw);
      if (typeof r === 'string') { problems.push(`${dev.alias}: ${r}`); continue; }
      if (seen.has(r.id)) continue; // duplicate upload
      seen.add(r.id); rows.push(r);
    }
    devices.push({ device: { alias: dev.alias, maker: String(dev.maker ?? ''), brand: String(dev.brand ?? ''), androidSdk: Number(dev.androidSdk ?? 0) }, rows: timeOrder(rows) });
  }
  return { data: { version: 1, devices }, problems };
}
