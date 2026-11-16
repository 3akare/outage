// Task 8: baseline lambda (R4) and the restore-delay p95 (R10.1). Weight side of D4 lives in decisions.test.ts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, evaluate, initialState, p95Before } from '../src/index.ts';
import { DAY_MS, HOUR_MS, localDay, localHour } from '../src/time.ts';
import { HOUR, MIN, SEC, ev, ids, input, P } from './helpers/build.ts';

const OFF = P.localOffsetMs;
const D0 = 20_000 * DAY_MS - OFF; // a local midnight
const at = (day: number, hour: number, min = 0) => D0 + day * DAY_MS + hour * HOUR + min * MIN;
const PRIOR = P.baseline.priorLambdaPerSec;

/**
 * Day `day`: ten installs armed all day. Installs i0..i5 unplug six times each in local hour `hour`, one unplug every
 * 100 s (so no two share a window), 20 s down each: 36 human unplugs, 3.6 per sensor-hour. Pass `cycles` = 0 for none.
 */
function dayEvents(day: number, hour: number, cycles: number) {
  const out = [];
  for (const [i, id] of ids(10).entries()) out.push(ev(id, 100 * day + 1, 'ARMED', at(day, 0, i)));
  for (let j = 0; j < cycles; j++) {
    for (let i = 0; i < 6; i++) {
      const id = `i${i}`;
      const t = at(day, hour) + (j * 6 + i) * 100 * SEC;
      out.push(ev(id, 100 * day + 2 + 2 * j, 'UNPLUG', t));
      out.push(ev(id, 100 * day + 3 + 2 * j, 'REPLUG', t + 20 * SEC));
    }
  }
  return out;
}
const noLabels = (day: number, cycles: number) =>
  Array.from({ length: cycles * 6 }, (_, x) => ({
    installId: `i${x % 6}`,
    unplugSeq: 100 * day + 2 + 2 * Math.floor(x / 6),
    answer: 'NO' as const,
  }));

/** Outage of three installs on `day` at `hour`; returns the lambda the engine used for the opening window. */
function lambdaAt(day: number, hour: number, history: ReturnType<typeof dayEvents>, labels: ReturnType<typeof noLabels>) {
  const start = at(day, hour, 40);
  const trio = ['i7', 'i8', 'i9'];
  const outage = trio.map((id, k) => ev(id, 9000 + k, 'UNPLUG', start + k * 100));
  const r = evaluate(initialState(), input([...history, ...outage], start + 13 * HOUR, { labels }), P);
  const d = r.outputs.decisions.find((x) => x.startMs === start);
  return d?.explanation.lambdaPerSec;
}

describe('R4 baseline', () => {
  it('R4_1_prior_is_used_with_no_history', () => {
    const history = dayEvents(0, 10, 0);
    expect(lambdaAt(0, 10, history, [])).toBeCloseTo(PRIOR, 15);
  });

  it('R4_5_same_day_data_never_enters_the_same_day_lambda', () => {
    // Many human unplugs earlier on the same day at the same hour do not move lambda for that day.
    const hist = dayEvents(0, 10, 6);
    const hist2 = hist.filter((e) => !(e.type === 'UNPLUG' || e.type === 'REPLUG'));
    expect(lambdaAt(0, 10, hist, noLabels(0, 6))).toBeCloseTo(lambdaAt(0, 10, hist2, []) as number, 15);
  });

  it('R4_2_earlier_days_move_the_hour_that_had_the_unplugs_and_leave_others', () => {
    const hist = [...dayEvents(0, 10, 6)];
    const labels = noLabels(0, 6);
    const same = lambdaAt(1, 10, hist, labels) as number;
    const other = lambdaAt(1, 15, hist, labels) as number;
    expect(same).toBeGreaterThan(PRIOR);
    expect(other).toBeLessThan(PRIOR); // exposure grew with no unplugs in that hour
    expect(other).toBeGreaterThan(0);
  });

  it('R4_2_closed_form_for_one_earlier_day', () => {
    // lambda_h(D) = (a0 + C_h) / (b0 + E_h), a0 = b0 x prior, b0 = 36,000 s; the factor 0.9^(D-1-d) is 1 for d = D-1.
    const got = lambdaAt(1, 10, dayEvents(0, 10, 6), noLabels(0, 6)) as number;
    const exposureSec = 10 * 3600 - 36 * 20; // ten installs armed all hour, less 36 unplugs of 20 s
    const want = (36_000 * PRIOR + 36) / (36_000 + exposureSec);
    expect(got).toBeCloseTo(want, 12);
  });

  it('R4_2_older_days_decay_by_the_daily_factor', () => {
    const d0 = dayEvents(0, 10, 6);
    const labels = noLabels(0, 6);
    const near = lambdaAt(1, 10, d0, labels) as number;
    const far = lambdaAt(5, 10, d0, labels) as number;
    expect(far).toBeLessThan(near);
    // Closed form: days 1 to 4 add 36,000 s of exposure each and no unplugs; day 0 is decayed by 0.9^4.
    const g = P.baseline.dailyDecay;
    const c = 36 * g ** 4;
    const e = 35_280 * g ** 4 + 36_000 * (g ** 3 + g ** 2 + g + 1);
    expect(far).toBeCloseTo((36_000 * PRIOR + c) / (36_000 + e), 12);
  });

  it('R4_3_labeled_unplugs_count_as_human_unplugs', () => {
    const hist = dayEvents(0, 10, 6);
    const labeled = lambdaAt(1, 10, hist, noLabels(0, 6)) as number;
    const noAnswer = lambdaAt(1, 10, hist, []) as number;
    // Without labels the isolated unplugs still count (R4.3), so the two agree; a label NO must never lower lambda.
    expect(labeled).toBeGreaterThan(PRIOR);
    expect(labeled).toBeGreaterThanOrEqual(noAnswer - 1e-15);
  });

  it('R4_4_outage_time_is_left_out_of_the_exposure', () => {
    // Day 0: a Confirmed outage in hour 10 (all ten drop), 40 minutes long. Day 1: lambda at hour 10 compared with a
    // day with no outage and no unplugs. Exposure is lower, lambda is higher.
    const arm = ids(10).map((id, i) => ev(id, 1, 'ARMED', at(0, 0, i)));
    const drops = ids(10).map((id, i) => ev(id, 2, 'UNPLUG', at(0, 10, 0) + i * 100));
    const back = ids(10).map((id, i) => ev(id, 3, 'REPLUG', at(0, 10, 40) + i * SEC));
    const withOutage = lambdaAt(1, 10, [...arm, ...drops, ...back], []) as number;
    const quiet = lambdaAt(1, 10, arm, []) as number;
    expect(withOutage).toBeGreaterThan(quiet);
  });

  it('R4_6_the_local_offset_comes_from_params', () => {
    expect(localHour(at(0, 23, 30), OFF)).toBe(23);
    expect(localDay(at(0, 23, 59), OFF)).toBe(localDay(at(0, 0), OFF));
    expect(localHour(at(0, 23, 30), 0)).toBe(22);
    expect(localHour(D0, -OFF)).toBe(22);
    expect(HOUR_MS).toBe(HOUR);
  });
});

describe('R10_1 restore delay p95', () => {
  const samples = (delays: number[]): [number, number][] => delays.map((d, i) => [1000 + i, d]);
  it('R10_1_fewer_than_20_samples_use_the_prior', () => {
    const r = p95Before(samples([5, 5, 5]), 1e9, P);
    expect(r).toEqual({ p95Ms: 60_000, count: 3, wrMs: 150_000 });
  });
  it('R10_1_nearest_rank_p95_with_20_samples', () => {
    const d = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
    const r = p95Before(samples(d), 1e9, P);
    expect(r.p95Ms).toBe(19_000); // ceil(0.95 x 20) = 19th value
    expect(r.wrMs).toBe(90_000 + 19_000);
  });
  it('R10_1_only_delays_before_the_outage_start_are_used', () => {
    const d = Array.from({ length: 30 }, () => 1000);
    const s = samples(d);
    s.push([5000, 999_999]);
    expect(p95Before(s, 5000, P).p95Ms).toBe(1000);
    expect(p95Before(s, 5001, P).count).toBe(31);
  });
  it('R10_1_keeps_only_the_newest_500', () => {
    const s: [number, number][] = Array.from({ length: 600 }, (_, i) => [i, i < 100 ? 90_000 : 10]);
    expect(p95Before(s, 1e9, P).p95Ms).toBe(10);
  });
  it('R10_1_default_params_prior', () => {
    expect(DEFAULT_PARAMS.restore.priorP95Ms).toBe(60_000);
  });
});
