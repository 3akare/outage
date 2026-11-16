import { nearestRank } from './stats.ts';
import { TWELVE_HOURS_MS, type CondResult, type DeviceResult } from './analyze.ts';

// Gate from the brief, Part I milestone 1, as amended by the human on 2026-11-14 (feasibility-probe requirements, "Gate"; ADR 0013).
// Amendment: the maker check accepts Samsung as well as Tecno or Infinix (the only phone available is a Samsung), and the
// 12 hours of charging may be collected over several days (they add up per condition).
export const GATE = { armedRatio: 0.9, minChargingMs: TWELVE_HOURS_MS, delayP95Ms: 60_000, minDelaySamples: 20, killRatio: 0.5 } as const;
/** Makers with aggressive battery managers that the maker check accepts. Tecno and Infinix stay an open risk if untested. */
export const OEM_MAKERS = /samsung|tecno|infinix/i;

export type Verdict = 'pass' | 'fail' | 'not measured';
export type Check = { verdict: Verdict; detail: string };
export type Gate = { armed: Check; delay: Check; oem: Check; kill: { triggered: boolean; detail: string }; overall: 'PASS' | 'FAIL' | 'INCOMPLETE'; worstDeviceP95Ms: number | null };

const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)} h`;
const longEnough = (c: CondResult) => c.totals.chargingMs >= GATE.minChargingMs && c.armedRatio !== null;

/**
 * Armed: at least one phone, in one condition with 12 h or more of charging, armed at least 90%.
 * Delay: p95 of plug-in to job start, pooled over all phones, with at least 20 replugs. The worst single phone is
 *        reported next to it (whether the gate should use the worst phone is for the human, ADR 0013).
 * Maker: a Samsung, Tecno or Infinix phone, over 12 h or more of charging (in total) with the exemption on, armed at least 90%.
 * Kill: every phone with 12 h or more of charging stays under 50% armed overall.
 */
export function gate(devices: readonly DeviceResult[]): Gate {
  const long = devices.flatMap((d) => d.byCond.filter(longEnough).map((c) => ({ d, c })));
  const bestArmed = long.reduce<{ d: DeviceResult; c: CondResult } | null>((b, x) => (!b || (x.c.armedRatio ?? 0) > (b.c.armedRatio ?? 0) ? x : b), null);
  const armed: Check = !bestArmed
    ? { verdict: 'not measured', detail: 'no phone has a condition with 12 h of charging yet' }
    : { verdict: (bestArmed.c.armedRatio ?? 0) >= GATE.armedRatio ? 'pass' : 'fail', detail: `best: ${bestArmed.d.alias} "${bestArmed.c.cond}" ${pct(bestArmed.c.armedRatio)} over ${hours(bestArmed.c.totals.chargingMs)}` };

  const delays = devices.flatMap((d) => d.m2.pairs.map((p) => p.delayMs));
  const p95 = nearestRank(delays, 95);
  const perDevice = devices.filter((d) => d.m2.pairs.length >= GATE.minDelaySamples).map((d) => d.m2.delay.p95 ?? 0);
  const worstDeviceP95Ms = perDevice.length ? Math.max(...perDevice) : null;
  const delay: Check = delays.length < GATE.minDelaySamples
    ? { verdict: 'not measured', detail: `${delays.length} replugs paired; at least ${GATE.minDelaySamples} needed` }
    : { verdict: (p95 ?? Infinity) <= GATE.delayP95Ms ? 'pass' : 'fail', detail: `pooled p95 ${((p95 ?? 0) / 1000).toFixed(1)} s over ${delays.length} replugs; worst phone p95 ${worstDeviceP95Ms === null ? 'n/a' : `${(worstDeviceP95Ms / 1000).toFixed(1)} s`}` };

  const tr = devices.filter((d) => OEM_MAKERS.test(`${d.maker} ${d.brand}`));
  const trLong = tr.filter((d) => d.exempt.totals.chargingMs >= GATE.minChargingMs);
  const trBest = trLong.reduce<DeviceResult | null>((b, d) => (!b || (d.exempt.armedRatio ?? 0) > (b.exempt.armedRatio ?? 0) ? d : b), null);
  const oem: Check = !tr.length
    ? { verdict: 'not measured', detail: 'no Samsung, Tecno or Infinix phone in the data' }
    : !trBest
      ? { verdict: 'not measured', detail: `${tr.map((d) => d.alias).join(', ')}: less than 12 h of charging with the exemption on` }
      : { verdict: (trBest.exempt.armedRatio ?? 0) >= GATE.armedRatio ? 'pass' : 'fail', detail: `${trBest.alias} with exemption ${pct(trBest.exempt.armedRatio)} over ${hours(trBest.exempt.totals.chargingMs)}` };

  const measured = devices.filter((d) => d.overall.totals.chargingMs >= GATE.minChargingMs);
  const killTriggered = measured.length > 0 && measured.every((d) => (d.overall.armedRatio ?? 0) < GATE.killRatio);
  const kill = { triggered: killTriggered, detail: measured.length ? measured.map((d) => `${d.alias} ${pct(d.overall.armedRatio)}`).join(', ') : 'no phone measured for 12 h yet' };

  const checks = [armed, delay, oem];
  const overall = checks.some((c) => c.verdict === 'fail') || killTriggered ? 'FAIL' : checks.every((c) => c.verdict === 'pass') ? 'PASS' : 'INCOMPLETE';
  return { armed, delay, oem, kill, overall, worstDeviceP95Ms };
}
