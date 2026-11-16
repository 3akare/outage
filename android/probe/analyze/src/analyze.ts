import { plugLag, plugToStart, restartGaps, unplugToStop, type Pairing } from './pairing.ts';
import { type Summary, summarize } from './stats.ts';
import { ratio, segments, steps, totals, type Segment, type Totals } from './timeline.ts';
import type { DeviceLog, Row } from './types.ts';

export const TWELVE_HOURS_MS = 12 * 3_600_000;

export type CondResult = { cond: string; totals: Totals; armedRatio: number | null };
export type DeviceResult = {
  alias: string; maker: string; brand: string; androidSdk: number;
  rows: number; firstWallMs: number | null; lastWallMs: number | null;
  segments: Segment[]; reboots: number; restarts: number;
  overall: CondResult; byCond: CondResult[];
  exempt: CondResult; notExempt: CondResult;
  m2: Pairing & { delay: Summary }; m6: Pairing & { delay: Summary }; plugLag: { checked: number; differ: number };
  stopReasons: Record<string, number>; m5Gaps: Summary;
  m7: { cond: string; connected: number; disconnected: number; lag1s: number }[];
  m8: string | null; m9: { phase: string; delayMs: number | null; error: string | null }[];
  m11: { cond: string; plug: string }[]; m12: boolean | null;
  m13: Record<string, Summary>; m14: { checked: number; mismatch: number };
  notes: { id: number; text: string }[];
};

const condResult = (cond: string, t: Totals): CondResult => ({ cond, totals: t, armedRatio: ratio(t) });
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function analyzeDevice(log: DeviceLog): DeviceResult {
  const rows: Row[] = log.rows;
  const st = steps(rows);
  const segs = segments(rows);
  const conds = [...new Set(st.map((s) => s.cond))];
  const m2 = plugToStart(rows), m6 = unplugToStop(rows);
  const stopReasons: Record<string, number> = {};
  for (const r of rows) if (r.kind === 'JOB_STOP') { const k = String(r.fields.stopReasonName ?? 'UNKNOWN'); stopReasons[k] = (stopReasons[k] ?? 0) + 1; }

  const m7 = new Map<string, { cond: string; connected: number; disconnected: number; lag1s: number }>();
  let cond = 'none';
  const m11: { cond: string; plug: string }[] = [];
  for (const r of rows) {
    if (r.kind === 'NOTE' && typeof r.fields.text === 'string') { const m = /^\s*cond:\s*(.+?)\s*$/i.exec(r.fields.text); if (m) cond = m[1]; }
    if (r.kind !== 'PLUG') continue;
    const e = m7.get(cond) ?? { cond, connected: 0, disconnected: 0, lag1s: 0 };
    if (r.fields.action === 'CONNECTED') { e.connected++; m11.push({ cond, plug: String(r.fields.plug) }); } else e.disconnected++;
    if (r.fields.plugAfter1s !== undefined && r.fields.plugAfter1s !== r.fields.plug) e.lag1s++;
    m7.set(cond, e);
  }

  const m13: Record<string, number[]> = {};
  for (const r of rows) {
    if (r.kind !== 'UPLOAD' || r.fields.ok !== true || typeof r.fields.durationMs !== 'number') continue;
    const net = String(r.fields.network ?? 'OTHER');
    if (!m13[net]) m13[net] = [];
    m13[net].push(r.fields.durationMs);
  }
  const stopsWithFacts = rows.filter((r) => r.kind === 'JOB_STOP' && typeof r.fields.mismatch === 'boolean');
  const expedited = [...rows].reverse().find((r) => r.kind === 'SESSION' && r.fields.kind === 'expedited');
  const fullScreen = [...rows].reverse().find((r) => r.kind === 'SESSION' && typeof r.fields.fullScreen === 'boolean');
  const walls = rows.map((r) => r.wallMs);

  return {
    ...log.device,
    rows: rows.length,
    firstWallMs: walls.length ? Math.min(...walls) : null,
    lastWallMs: walls.length ? Math.max(...walls) : null,
    segments: segs,
    reboots: segs.filter((s) => s.endedBy === 'reboot').length,
    restarts: rows.filter((r) => r.kind === 'SESSION' && r.fields.kind === 'restart').length,
    overall: condResult('all', totals(st)),
    byCond: conds.map((c) => condResult(c, totals(st, (s) => s.cond === c))).filter((c) => c.totals.chargingMs > 0 || c.totals.armedMs > 0),
    exempt: condResult('exempt', totals(st, (s) => s.exempt === true)),
    notExempt: condResult('not exempt', totals(st, (s) => s.exempt !== true)),
    m2: { ...m2, delay: summarize(m2.pairs.map((p) => p.delayMs)) },
    m6: { ...m6, delay: summarize(m6.pairs.map((p) => p.delayMs)) },
    plugLag: plugLag(rows),
    stopReasons,
    m5Gaps: summarize(restartGaps(rows).map((g) => g.gapMs)),
    m7: [...m7.values()],
    m8: expedited ? (expedited.fields.ok === true ? 'accepted' : `refused: ${str(expedited.fields.error) ?? 'no reason logged'}`) : null,
    m9: rows.filter((r) => r.kind === 'ALARM_TEST').map((r) => ({ phase: String(r.fields.phase), delayMs: typeof r.fields.delayMs === 'number' ? r.fields.delayMs : null, error: str(r.fields.error) })),
    m11,
    m12: fullScreen ? (fullScreen.fields.fullScreen as boolean) : null,
    m13: Object.fromEntries(Object.entries(m13).map(([k, v]) => [k, summarize(v)])),
    m14: { checked: stopsWithFacts.length, mismatch: stopsWithFacts.filter((r) => r.fields.mismatch === true).length },
    notes: rows.filter((r) => r.kind === 'NOTE').map((r) => ({ id: r.id, text: String(r.fields.text ?? '') })),
  };
}
