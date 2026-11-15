// Failure signatures from one day (field-telemetry R8.1, R8.2; skill reference signatures.md). Pure.
// A signature is `CHECK:maker:androidMajor:mode`. Checks about outages and misses are not tied to one phone class, so they use
// `other:unknown:normal` (the form `new-bugfix.mjs` accepts).
import {
  type AliasedDeviceDay,
  armedRatio,
  classifyOutage,
  type FieldDump,
  GATE_ARMED_RATIO,
  GATE_DELAY_P95_MS,
  isSuspectDay,
  KILL_ARMED_RATIO,
  percentileOrHidden,
} from '@outage/shared';
import { type ClassKey, classId, classOf } from './stats.ts';

export const MISS_MIN_ARMED = 3; // design section 6: a miss counts only with at least 3 armed phones in scope
export const FGS_BLOCKED_REASON = 'FGS_START_BLOCKED'; // station-mode R9, key in `stopReasons`

export type CheckName =
  | 'ARMED_LOW'
  | 'ARMED_CRITICAL'
  | 'DELAY_SLOW'
  | 'ALARM_MISSED'
  | 'FALSE_ALARM'
  | 'MISS'
  | 'WRITE_FAIL'
  | 'FGS_BLOCKED'
  | 'UPLOAD_GAP';

export interface SignatureHit {
  signature: string;
  check: CheckName;
  /** Numbers only. No alias, no identifier: it goes into a Bugfix Spec in the public repo. */
  evidence: string;
}

const DAY_MS = 86_400_000;
const pct = (x: number) => x.toFixed(2);
const sec = (ms: number) => (ms / 1000).toFixed(1);
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
const outageSignature = (check: CheckName) => `${check}:other:unknown:normal`;
const signatureOf = (check: CheckName, k: ClassKey) => `${check}:${k.maker}:${k.android}:${k.mode}`;

export function deriveSignatures(dump: FieldDump): SignatureHit[] {
  const hits = new Map<string, SignatureHit>();
  const add = (h: SignatureHit) => {
    if (!hits.has(h.signature)) hits.set(h.signature, h);
  };
  const days = dump.devices.filter((d) => !isSuspectDay(d));
  const classes = new Map<string, { key: ClassKey; days: AliasedDeviceDay[] }>();
  for (const d of days) {
    const key = classOf(d);
    const cur = classes.get(classId(key));
    if (cur) cur.days.push(d);
    else classes.set(classId(key), { key, days: [d] });
  }

  for (const { key, days: ds } of classes.values()) {
    // Armed time. A device-day under 50% raises ARMED_CRITICAL; one between 50% and 90% raises ARMED_LOW.
    const ratios = ds.flatMap((d) => {
      const r = armedRatio(d.armedMs, d.chargingMs);
      return r === null ? [] : [r];
    });
    const critical = ratios.filter((r) => r < KILL_ARMED_RATIO);
    const low = ratios.filter((r) => r >= KILL_ARMED_RATIO && r < GATE_ARMED_RATIO);
    if (critical.length > 0) {
      add({
        signature: signatureOf('ARMED_CRITICAL', key),
        check: 'ARMED_CRITICAL',
        evidence: `Armed ratio ${pct(Math.min(...critical))} at the lowest, below ${KILL_ARMED_RATIO}, on ${critical.length} of ${ratios.length} device-days with at least 1 h of charging (${key.maker}, Android ${key.android}, ${key.mode} mode).`,
      });
    }
    if (low.length > 0) {
      add({
        signature: signatureOf('ARMED_LOW', key),
        check: 'ARMED_LOW',
        evidence: `Armed ratio ${pct(Math.min(...low))} at the lowest, below ${GATE_ARMED_RATIO}, on ${low.length} of ${ratios.length} device-days with at least 1 h of charging (${key.maker}, Android ${key.android}, ${key.mode} mode).`,
      });
    }
    const delay = percentileOrHidden(
      ds.flatMap((d) => [...d.delayJobMs, ...d.delayReceiverMs]),
      95,
    );
    if (delay.value !== null && delay.value > GATE_DELAY_P95_MS) {
      add({
        signature: signatureOf('DELAY_SLOW', key),
        check: 'DELAY_SLOW',
        evidence: `Scheduling delay p95 ${sec(delay.value)} s over ${delay.n} samples, above ${sec(GATE_DELAY_P95_MS)} s (${key.maker}, Android ${key.android}, ${key.mode} mode).`,
      });
    }
    const missedDays = ds.filter((d) => d.alarms.expected > d.alarms.rung);
    if (missedDays.length > 0) {
      const expected = missedDays.reduce((n, d) => n + d.alarms.expected, 0);
      const rung = missedDays.reduce((n, d) => n + d.alarms.rung, 0);
      add({
        signature: signatureOf('ALARM_MISSED', key),
        check: 'ALARM_MISSED',
        evidence: `${rung} alarms rung of ${expected} expected on ${missedDays.length} device-days (${key.maker}, Android ${key.android}, ${key.mode} mode).`,
      });
    }
    const failedWrites = ds.filter((d) => d.writeFailures > 0);
    if (failedWrites.length > 0) {
      add({
        signature: signatureOf('WRITE_FAIL', key),
        check: 'WRITE_FAIL',
        evidence: `${failedWrites.reduce((n, d) => n + d.writeFailures, 0)} write failures on ${failedWrites.length} device-days (${key.maker}, Android ${key.android}, ${key.mode} mode).`,
      });
    }
    const blocked = ds.filter((d) => (d.stopReasons[FGS_BLOCKED_REASON] ?? 0) > 0);
    if (blocked.length > 0) {
      add({
        signature: signatureOf('FGS_BLOCKED', key),
        check: 'FGS_BLOCKED',
        evidence: `The Station foreground service was blocked ${blocked.reduce((n, d) => n + (d.stopReasons[FGS_BLOCKED_REASON] ?? 0), 0)} times on ${blocked.length} device-days (${key.maker}, Android ${key.android}).`,
      });
    }
  }

  // An opted-in device with no aggregate for more than a day (R8.1): its last upload is two or more days before this day.
  const gaps = new Map<string, { key: ClassKey; longest: number; n: number }>();
  for (const s of dump.silent) {
    const missing = dayNumber(dump.day) - dayNumber(s.lastDay);
    if (missing < 2) continue;
    const key: ClassKey = { maker: s.maker, android: s.androidMajor, mode: 'normal' };
    const cur = gaps.get(classId(key));
    if (cur) {
      cur.longest = Math.max(cur.longest, missing);
      cur.n += 1;
    } else gaps.set(classId(key), { key, longest: missing, n: 1 });
  }
  for (const { key, longest, n } of gaps.values()) {
    add({
      signature: signatureOf('UPLOAD_GAP', key),
      check: 'UPLOAD_GAP',
      evidence: `${n} opted-in devices sent no aggregate for up to ${longest} days (${key.maker}, Android ${key.android}).`,
    });
  }

  const falseAlarms = dump.outages.filter((o) => classifyOutage(o) === 'FALSE_ALARM');
  if (falseAlarms.length > 0) {
    add({
      signature: outageSignature('FALSE_ALARM'),
      check: 'FALSE_ALARM',
      evidence: `${falseAlarms.length} Confirmed outages where every label was No (${falseAlarms.map((o) => `${o.drops} of ${o.armedN} phones dropped`).join('; ')}).`,
    });
  }
  const misses = dump.misses.filter((m) => m.armedN >= MISS_MIN_ARMED);
  if (misses.length > 0) {
    add({
      signature: outageSignature('MISS'),
      check: 'MISS',
      evidence: `${misses.length} Yes labels with no outage covering the unplug, with ${misses.map((m) => m.armedN).join(', ')} armed phones in the cell.`,
    });
  }
  return [...hits.values()].sort((a, b) => (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0));
}
