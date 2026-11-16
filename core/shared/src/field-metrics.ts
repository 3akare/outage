// Field-telemetry metric functions and gate evaluation (field-telemetry R4, R10; design section 5).
// Pure, no I/O, no clock. `nearestRank` has the same definition as android/probe/analyze/src/stats.ts (rank =
// ceil(p/100 * n), 1-based), so probe and field numbers agree.
import { GAP_BUCKETS, GAP_EDGES_MS, type DeviceDay, type Maker } from './device-day.ts';

export const MIN_P95_SAMPLES = 20; // R4.3
export const MIN_ARMED_CHARGING_MS = 3_600_000; // design section 5: ratio is null below one hour of charging
export const GATE_ARMED_RATIO = 0.9;
export const GATE_DELAY_P95_MS = 60_000;
export const KILL_ARMED_RATIO = 0.5;
/** R10.1: Tecno, Infinix or Samsung, as the probe gate (ADR 0013). Human confirmed 2026-11-15. */
export const GATE_OEM_MAKERS: readonly Maker[] = ['tecno', 'infinix', 'samsung'];

/** Nearest-rank percentile. Empty input gives null; p outside (0, 100] throws. */
export function nearestRank(values: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError('p must be in (0, 100]');
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
}

export type PercentileResult = { n: number; value: number | null; status: 'ok' | 'not enough data' };
/** A percentile that is hidden below `minSamples` (R4.3). The sample count is always reported. */
export function percentileOrHidden(
  values: readonly number[],
  p: number,
  minSamples = MIN_P95_SAMPLES,
): PercentileResult {
  if (values.length < minSamples) return { n: values.length, value: null, status: 'not enough data' };
  return { n: values.length, value: nearestRank(values, p), status: 'ok' };
}

/** armedMs / chargingMs, or null below one hour of charging (design section 5). */
export function armedRatio(armedMs: number, chargingMs: number): number | null {
  if (chargingMs < MIN_ARMED_CHARGING_MS) return null;
  return armedMs / chargingMs;
}

/** rung / expected, or null when nothing was expected. */
export function alarmRate(rung: number, expected: number): number | null {
  return expected === 0 ? null : rung / expected;
}

// ---- gap histogram -----------------------------------------------------------------------------------------------

/** Bucket index of a gap: the first bucket whose upper edge is above `lenMs`; the last bucket is open-ended. */
export function gapBucket(lenMs: number): number {
  const i = GAP_EDGES_MS.findIndex((edge) => lenMs < edge);
  return i === -1 ? GAP_EDGES_MS.length : i;
}

export function emptyHist(): number[] {
  return new Array<number>(GAP_BUCKETS).fill(0);
}

export function addGapToHist(hist: readonly number[], lenMs: number): number[] {
  const out = [...hist];
  out[gapBucket(lenMs)] += 1;
  return out;
}

export function mergeHists(a: readonly number[], b: readonly number[]): number[] {
  return a.map((n, i) => n + (b[i] ?? 0));
}

/** Nearest-rank percentile on a histogram: the bucket index that holds the sample of that rank, or null when empty. */
export function histPercentileBucket(hist: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError('p must be in (0, 100]');
  const n = hist.reduce((a, b) => a + b, 0);
  if (n === 0) return null;
  const rank = Math.ceil((p / 100) * n);
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i];
    if (seen >= rank) return i;
  }
  return hist.length - 1;
}

/** Upper edge of a bucket in ms, or null for the open-ended last bucket ("longer than the last edge"). */
export function bucketUpperMs(i: number): number | null {
  return i < GAP_EDGES_MS.length ? GAP_EDGES_MS[i] : null;
}

// ---- gates -------------------------------------------------------------------------------------------------------

export type GateStatus = 'pass' | 'fail' | 'not enough data';
export type GateResult = { status: GateStatus; value: number | null; threshold: number; detail: string };
export type MilestoneStatus = 'met' | 'not met' | 'not measurable yet';
export type KillStatus = 'triggered' | 'not triggered' | 'not measurable yet';
export type FieldGates = {
  armed: GateResult;
  delay: GateResult;
  oem: GateResult;
  milestone: MilestoneStatus;
  kill: { status: KillStatus; detail: string };
};

/** A device-day with more charging than 26 hours is suspect (clock change, design section 8) and is left out of the ratios. */
export const isSuspectDay = (d: Pick<DeviceDay, 'chargingMs'>): boolean => d.chargingMs > 26 * 3_600_000;

/** Station mode when the station share is larger; normal otherwise (R4.5 reports the two apart). */
export const dayMode = (d: Pick<DeviceDay, 'mode'>): 'normal' | 'station' =>
  d.mode.stationMs > d.mode.normalMs ? 'station' : 'normal';

type PerDevice = { installId: string; maker: Maker; exemption: boolean; chargingMs: number; armedMs: number };

function perDevice(days: readonly DeviceDay[]): PerDevice[] {
  const by = new Map<string, PerDevice>();
  for (const d of days) {
    if (isSuspectDay(d)) continue;
    const cur = by.get(d.installId);
    if (cur) {
      cur.chargingMs += d.chargingMs;
      cur.armedMs += d.armedMs;
      cur.exemption = cur.exemption && d.exemption; // exempt only if every day was
    } else
      by.set(d.installId, {
        installId: d.installId,
        maker: d.maker,
        exemption: d.exemption,
        chargingMs: d.chargingMs,
        armedMs: d.armedMs,
      });
  }
  return [...by.values()];
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

/**
 * Milestone-1 gate over the given device-days (R4.3, R10).
 * - armed: at least one phone with 1 h or more of charging and armed ratio >= 90%. Normal-mode devices only (R4.5).
 * - delay: scheduling delay (job and receiver samples pooled) p95 <= 60 s, hidden below 20 samples.
 * - oem: a Tecno, Infinix or Samsung phone with the battery exemption on and armed ratio >= 90%.
 * - kill: every measurable phone with the exemption on is under 50%.
 */
export function evaluateGates(days: readonly DeviceDay[]): FieldGates {
  const normalDays = days.filter((d) => dayMode(d) === 'normal');
  const devs = perDevice(normalDays).map((d) => ({ ...d, ratio: armedRatio(d.armedMs, d.chargingMs) }));
  const measurable = devs.filter((d) => d.ratio !== null);
  const best = measurable.reduce<number | null>(
    (b, d) => (b === null || (d.ratio ?? 0) > b ? (d.ratio ?? 0) : b),
    null,
  );
  const armed: GateResult =
    best === null
      ? {
          status: 'not enough data',
          value: null,
          threshold: GATE_ARMED_RATIO,
          detail: 'no phone has 1 h of charging in normal mode',
        }
      : {
          status: best >= GATE_ARMED_RATIO ? 'pass' : 'fail',
          value: best,
          threshold: GATE_ARMED_RATIO,
          detail: `best phone ${pct(best)} of ${measurable.length} measurable`,
        };

  const samples = days.filter((d) => !isSuspectDay(d)).flatMap((d) => [...d.delayJobMs, ...d.delayReceiverMs]);
  const p95 = percentileOrHidden(samples, 95);
  const delay: GateResult =
    p95.value === null
      ? {
          status: 'not enough data',
          value: null,
          threshold: GATE_DELAY_P95_MS,
          detail: `${p95.n} samples, ${MIN_P95_SAMPLES} needed`,
        }
      : {
          status: p95.value <= GATE_DELAY_P95_MS ? 'pass' : 'fail',
          value: p95.value,
          threshold: GATE_DELAY_P95_MS,
          detail: `p95 over ${p95.n} samples`,
        };

  const oemDevs = measurable.filter((d) => GATE_OEM_MAKERS.includes(d.maker) && d.exemption);
  const oemBest = oemDevs.reduce<number | null>(
    (b, d) => (b === null || (d.ratio ?? 0) > b ? (d.ratio ?? 0) : b),
    null,
  );
  const oem: GateResult =
    oemBest === null
      ? {
          status: 'not enough data',
          value: null,
          threshold: GATE_ARMED_RATIO,
          detail: 'no Tecno, Infinix or Samsung phone with the exemption on and 1 h of charging',
        }
      : {
          status: oemBest >= GATE_ARMED_RATIO ? 'pass' : 'fail',
          value: oemBest,
          threshold: GATE_ARMED_RATIO,
          detail: `best Tecno, Infinix or Samsung ${pct(oemBest)}`,
        };

  const all = [armed, delay, oem];
  const milestone: MilestoneStatus = all.some((g) => g.status === 'fail')
    ? 'not met'
    : all.every((g) => g.status === 'pass')
      ? 'met'
      : 'not measurable yet';

  const exempt = measurable.filter((d) => d.exemption);
  const kill: FieldGates['kill'] =
    exempt.length === 0
      ? { status: 'not measurable yet', detail: 'no phone with the exemption on and 1 h of charging' }
      : exempt.every((d) => (d.ratio ?? 0) < KILL_ARMED_RATIO)
        ? { status: 'triggered', detail: `all ${exempt.length} exempt phones under ${KILL_ARMED_RATIO * 100}%` }
        : {
            status: 'not triggered',
            detail: `${exempt.filter((d) => (d.ratio ?? 0) >= KILL_ARMED_RATIO).length} of ${exempt.length} exempt phones at or above ${KILL_ARMED_RATIO * 100}%`,
          };

  return { armed, delay, oem, milestone, kill };
}
