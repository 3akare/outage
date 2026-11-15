// Per-device and per-class numbers for the report (field-telemetry R4). Pure; the formulas live in packages/shared.
import {
  type AliasedDeviceDay,
  alarmRate,
  armedRatio,
  bucketUpperMs,
  dayMode,
  GAP_BUCKETS,
  histPercentileBucket,
  isSuspectDay,
  MIN_P95_SAMPLES,
  mergeHists,
  nearestRank,
  type Maker,
  type PercentileResult,
  percentileOrHidden,
} from '@outage/shared';

export type Mode = 'normal' | 'station';

export interface ClassKey {
  maker: Maker;
  android: number;
  mode: Mode;
}

/**
 * Gap reasons come from phones. Only an upper-case word of letters, digits and underscores up to 24 characters is printed; anything
 * else is counted as OTHER, so an odd reason string can never put an identifier into a public report.
 */
export const safeReason = (r: string): string => (/^[A-Z][A-Z0-9_]{0,23}$/.test(r) ? r : 'OTHER');

export const classId = (k: ClassKey): string => `${k.maker}:${k.android}:${k.mode}`;
export const classOf = (d: AliasedDeviceDay): ClassKey => ({
  maker: d.maker,
  android: d.androidMajor,
  mode: dayMode(d),
});

export interface GapStat {
  reason: string;
  count: number;
  /** Upper edge of the bucket that holds the percentile, ms. `null` = longer than the last edge. */
  p50UpperMs: number | null;
  p95UpperMs: number | null;
  /** p95 is hidden below 20 gaps (R4.3). */
  p95Hidden: boolean;
}

export interface ClassStats {
  key: ClassKey;
  devices: number;
  deviceDays: number;
  chargingMs: number;
  armedMs: number;
  ratio: number | null;
  gaps: GapStat[];
  delayJob: { p50: number | null; p95: PercentileResult };
  delayReceiver: { p50: number | null; p95: PercentileResult };
  replug: { p50: number | null; p95: PercentileResult };
  promptsShown: number;
  alarmsExpected: number;
  alarmsRung: number;
  alarmRate: number | null;
  writeFailures: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const pair = (xs: number[]) => ({ p50: nearestRank(xs, 50), p95: percentileOrHidden(xs, 95) });

/** Suspect device-days (more than 26 h charging) are left out of every class number (metrics.md, sanity checks). */
export function classStats(days: readonly AliasedDeviceDay[]): ClassStats[] {
  const by = new Map<string, { key: ClassKey; days: AliasedDeviceDay[] }>();
  for (const d of days) {
    if (isSuspectDay(d)) continue;
    const key = classOf(d);
    const id = classId(key);
    const cur = by.get(id);
    if (cur) cur.days.push(d);
    else by.set(id, { key, days: [d] });
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, { key, days: ds }]) => {
      const reasons = new Map<string, number[]>();
      for (const d of ds) {
        for (const g of d.gaps) {
          const reason = safeReason(g.reason);
          reasons.set(reason, mergeHists(reasons.get(reason) ?? new Array<number>(GAP_BUCKETS).fill(0), g.lenHistMs));
        }
      }
      const gaps: GapStat[] = [...reasons.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([reason, hist]) => {
          const count = sum(hist);
          const b50 = histPercentileBucket(hist, 50);
          const b95 = histPercentileBucket(hist, 95);
          return {
            reason,
            count,
            p50UpperMs: b50 === null ? null : bucketUpperMs(b50),
            p95UpperMs: b95 === null ? null : bucketUpperMs(b95),
            p95Hidden: count < MIN_P95_SAMPLES,
          };
        });
      const chargingMs = sum(ds.map((d) => d.chargingMs));
      const armedMs = sum(ds.map((d) => d.armedMs));
      const expected = sum(ds.map((d) => d.alarms.expected));
      const rung = sum(ds.map((d) => d.alarms.rung));
      return {
        key,
        devices: new Set(ds.map((d) => d.alias)).size,
        deviceDays: ds.length,
        chargingMs,
        armedMs,
        ratio: armedRatio(armedMs, chargingMs),
        gaps,
        delayJob: pair(ds.flatMap((d) => d.delayJobMs)),
        delayReceiver: pair(ds.flatMap((d) => d.delayReceiverMs)),
        replug: pair(ds.flatMap((d) => d.replugToRingMs)),
        promptsShown: sum(ds.map((d) => d.prompts.shown)),
        alarmsExpected: expected,
        alarmsRung: rung,
        alarmRate: alarmRate(rung, expected),
        writeFailures: sum(ds.map((d) => d.writeFailures)),
      };
    });
}
