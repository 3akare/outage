import type { Row } from './types.ts';

export type Segment = { bootCount: number; startId: number; endId: number; startMonoMs: number; endMonoMs: number; endedBy: 'reboot' | 'restart' | 'end' };
export type Totals = { chargingMs: number; armedChargingMs: number; armedMs: number };
export type Step = { fromId: number; ms: number; charging: boolean; armed: boolean; cond: string; exempt: boolean | null };

export const condOf = (r: Row): string | null => {
  if (r.kind !== 'NOTE' || typeof r.fields.text !== 'string') return null;
  const m = /^\s*cond:\s*(.+?)\s*$/i.exec(r.fields.text);
  return m ? m[1] : null;
};
const isRestart = (r: Row) => r.kind === 'SESSION' && (r.fields.kind === 'restart' || r.fields.kind === 'start');

/** Segments: a new segment starts at a reboot (boot count changes) or at an app (re)start. */
export function segments(rows: readonly Row[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  for (const r of rows) {
    if (cur && r.bootCount !== cur.bootCount) { cur.endedBy = 'reboot'; out.push(cur); cur = null; }
    else if (cur && isRestart(r)) { cur.endedBy = 'restart'; out.push(cur); cur = null; }
    if (!cur) cur = { bootCount: r.bootCount, startId: r.id, endId: r.id, startMonoMs: r.monoMs, endMonoMs: r.monoMs, endedBy: 'end' };
    cur.endId = r.id; cur.endMonoMs = r.monoMs;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Walk the rows in order. Between two consecutive rows of the same boot, the state after the first row holds:
 * charging (last `charging` field seen), armed (JOB_START until JOB_STOP), condition (last `cond:` note), exemption.
 * Rules (design section 7): the step that ends at an app (re)start counts as NOT armed, because the process was dead;
 * a reboot gap has no comparable clock and is not counted; after a (re)start the job is unarmed until a JOB_START.
 */
export function steps(rows: readonly Row[]): Step[] {
  const out: Step[] = [];
  let charging = false, armed = false, cond = 'none';
  let exempt: boolean | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c = condOf(r); if (c) cond = c;
    if (typeof r.fields.charging === 'boolean') charging = r.fields.charging;
    if (typeof r.fields.exempt === 'boolean') exempt = r.fields.exempt;
    if (isRestart(r)) armed = false;
    if (r.kind === 'JOB_START') armed = true;
    if (r.kind === 'JOB_STOP') armed = false;
    const next = rows[i + 1];
    if (!next) break;
    if (next.bootCount !== r.bootCount) { charging = false; armed = false; continue; }
    const ms = next.monoMs - r.monoMs;
    if (ms <= 0) continue;
    out.push({ fromId: r.id, ms, charging, armed: armed && !isRestart(next), cond, exempt });
  }
  return out;
}

export function totals(list: readonly Step[], keep: (s: Step) => boolean = () => true): Totals {
  const t: Totals = { chargingMs: 0, armedChargingMs: 0, armedMs: 0 };
  for (const s of list) {
    if (!keep(s)) continue;
    if (s.armed) t.armedMs += s.ms;
    if (s.charging) { t.chargingMs += s.ms; if (s.armed) t.armedChargingMs += s.ms; }
  }
  return t;
}

export const ratio = (t: Totals): number | null => (t.chargingMs > 0 ? t.armedChargingMs / t.chargingMs : null);
