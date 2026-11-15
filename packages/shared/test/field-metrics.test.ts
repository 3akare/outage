import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import normal from '../fixtures/telemetry/device-day.json';
import {
  GAP_BUCKETS,
  GAP_EDGES_MS,
  type DeviceDay,
  addGapToHist,
  alarmRate,
  armedRatio,
  bucketUpperMs,
  emptyHist,
  evaluateGates,
  gapBucket,
  histPercentileBucket,
  mergeHists,
  nearestRank,
  percentileOrHidden,
} from '../src/index.ts';
import { NUM_RUNS } from './runs.ts';

const day = (over: Partial<DeviceDay>): DeviceDay => ({ ...(normal as DeviceDay), ...over });
const ids = ['kg4yq7mxwb2ndpr3tfhj5vcsaz', 'aaaaaaaaaaaaaaaaaaaaaaaaab', 'aaaaaaaaaaaaaaaaaaaaaaaaac'];
const H = 3_600_000;

describe('F3_percentiles_and_ratio', () => {
  const xs = fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 200 });
  const pArb = fc.integer({ min: 1, max: 100 });

  it('F3 nearestRank equals a reference (count of values below the rank)', () => {
    fc.assert(
      fc.property(xs, pArb, (values, p) => {
        const r = nearestRank(values, p) as number;
        const n = values.length;
        const rank = Math.ceil((p * n) / 100);
        // Reference without sorting: the value v such that at least `rank` samples are <= v and fewer than rank are < v.
        const le = values.filter((v) => v <= r).length;
        const lt = values.filter((v) => v < r).length;
        expect(le).toBeGreaterThanOrEqual(rank);
        expect(lt).toBeLessThan(rank);
        expect(values).toContain(r);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F3 known values, empty input and range errors', () => {
    expect(nearestRank([15, 20, 35, 40, 50], 30)).toBe(20);
    expect(nearestRank([15, 20, 35, 40, 50], 100)).toBe(50);
    expect(nearestRank([], 95)).toBeNull();
    expect(() => nearestRank([1], 0)).toThrow(RangeError);
    expect(() => nearestRank([1], 101)).toThrow(RangeError);
  });

  it('F3 a p95 is hidden below 20 samples and shown from 20', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 1000 }), { maxLength: 60 }), (values) => {
        const r = percentileOrHidden(values, 95);
        expect(r.n).toBe(values.length);
        if (values.length < 20) expect(r).toMatchObject({ value: null, status: 'not enough data' });
        else expect(r).toEqual({ n: values.length, value: nearestRank(values, 95), status: 'ok' });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F3 the armed ratio is null below one hour of charging, else armed over charging', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 26 * H }), fc.double({ min: 0, max: 1, noNaN: true }), (charging, f) => {
        const armed = Math.floor(charging * f);
        const r = armedRatio(armed, charging);
        if (charging < H) expect(r).toBeNull();
        else expect(r).toBe(armed / charging);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(armedRatio(0, H - 1)).toBeNull();
    expect(armedRatio(H, H)).toBe(1);
  });

  it('F3 alarm rate is null with nothing expected', () => {
    expect(alarmRate(0, 0)).toBeNull();
    expect(alarmRate(1, 2)).toBe(0.5);
  });

  it('F3 gap histogram: bucket edges, adds and merges keep the count', () => {
    expect(gapBucket(0)).toBe(0);
    expect(gapBucket(GAP_EDGES_MS[0] - 1)).toBe(0);
    expect(gapBucket(GAP_EDGES_MS[0])).toBe(1);
    expect(gapBucket(GAP_EDGES_MS[GAP_EDGES_MS.length - 1])).toBe(GAP_BUCKETS - 1);
    expect(bucketUpperMs(GAP_BUCKETS - 1)).toBeNull();
    expect(bucketUpperMs(0)).toBe(GAP_EDGES_MS[0]);
    expect(histPercentileBucket(emptyHist(), 95)).toBeNull();
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 30 * H }), { maxLength: 80 }),
        fc.array(fc.nat({ max: 30 * H }), { maxLength: 80 }),
        (a, b) => {
          const ha = a.reduce(addGapToHist, emptyHist());
          const hb = b.reduce(addGapToHist, emptyHist());
          const merged = mergeHists(ha, hb);
          expect(merged).toEqual([...a, ...b].reduce(addGapToHist, emptyHist()));
          expect(merged.reduce((x, y) => x + y, 0)).toBe(a.length + b.length);
          // The histogram percentile lands in the bucket of the exact nearest-rank value.
          const all = [...a, ...b];
          if (all.length > 0)
            for (const p of [50, 95])
              expect(histPercentileBucket(merged, p)).toBe(gapBucket(nearestRank(all, p) as number));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('F7_gate_statuses', () => {
  const good = (i: number, over: Partial<DeviceDay> = {}) =>
    day({
      installId: ids[i],
      maker: 'tecno',
      exemption: true,
      chargingMs: 10 * H,
      armedMs: 9.5 * H,
      mode: { normalMs: 10 * H, stationMs: 0 },
      ...over,
    });

  it('F7 no data: every gate is "not enough data", the milestone is not measurable, the kill criterion too', () => {
    const g = evaluateGates([]);
    expect([g.armed.status, g.delay.status, g.oem.status]).toEqual([
      'not enough data',
      'not enough data',
      'not enough data',
    ]);
    expect(g.milestone).toBe('not measurable yet');
    expect(g.kill.status).toBe('not measurable yet');
  });

  it('F7 all three pass: milestone met, and the delay is exactly on the threshold', () => {
    const g = evaluateGates([good(0, { delayJobMs: Array(20).fill(60_000), delayReceiverMs: [] })]);
    expect(g.armed.status).toBe('pass');
    expect(g.delay).toMatchObject({ status: 'pass', value: 60_000 });
    expect(g.oem.status).toBe('pass');
    expect(g.milestone).toBe('met');
    expect(g.kill.status).toBe('not triggered');
  });

  it('F7 armed ratio is judged at 90% exactly and on the best phone', () => {
    const at = (armed: number) => evaluateGates([good(0, { armedMs: armed })]).armed.status;
    expect(at(9 * H)).toBe('pass');
    expect(at(9 * H - 1)).toBe('fail');
    const two = evaluateGates([good(0, { armedMs: 1 * H }), good(1, { armedMs: 9.5 * H })]);
    expect(two.armed.status).toBe('pass');
  });

  it('F7 delay: 19 samples is not enough, 20 over 60 s fails, a fail makes the milestone "not met"', () => {
    expect(evaluateGates([good(0, { delayJobMs: Array(19).fill(5_000), delayReceiverMs: [] })]).delay.status).toBe(
      'not enough data',
    );
    const slow = evaluateGates([good(0, { delayJobMs: Array(20).fill(60_001), delayReceiverMs: [] })]);
    expect(slow.delay.status).toBe('fail');
    expect(slow.milestone).toBe('not met');
  });

  it('F7 maker gate needs Tecno or Infinix with the exemption on; Samsung or no exemption does not count', () => {
    expect(evaluateGates([good(0, { maker: 'samsung' })]).oem.status).toBe('not enough data');
    expect(evaluateGates([good(0, { exemption: false })]).oem.status).toBe('not enough data');
    expect(evaluateGates([good(0, { maker: 'infinix' })]).oem.status).toBe('pass');
    expect(evaluateGates([good(0, { armedMs: 5 * H })]).oem.status).toBe('fail');
  });

  it('F7 station days are kept out of the normal-mode armed gate (R4.5)', () => {
    const st = good(0, { mode: { normalMs: 0, stationMs: 10 * H } });
    expect(evaluateGates([st]).armed.status).toBe('not enough data');
  });

  it('F7 a day with more than 26 h of charging is suspect and ignored', () => {
    expect(evaluateGates([good(0, { chargingMs: 27 * H, armedMs: 27 * H })]).armed.status).toBe('not enough data');
  });

  it('F7 kill criterion: triggered only when every exempt phone is under 50%', () => {
    const low = (i: number) => good(i, { armedMs: 4 * H });
    expect(evaluateGates([low(0), low(1)]).kill.status).toBe('triggered');
    expect(evaluateGates([low(0), good(1)]).kill.status).toBe('not triggered');
    expect(evaluateGates([good(0, { exemption: false, armedMs: 1 * H })]).kill.status).toBe('not measurable yet');
  });

  it('F7 status follows the thresholds for any ratio and delay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: H, max: 26 * H }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 120_000 }),
        (charging, f, delay) => {
          const armed = Math.floor(charging * f);
          const g = evaluateGates([
            good(0, {
              chargingMs: charging,
              armedMs: armed,
              mode: { normalMs: charging, stationMs: 0 },
              delayJobMs: Array(20).fill(delay),
              delayReceiverMs: [],
            }),
          ]);
          expect(g.armed.status).toBe(armed / charging >= 0.9 ? 'pass' : 'fail');
          expect(g.delay.status).toBe(delay <= 60_000 ? 'pass' : 'fail');
          expect(g.milestone).toBe(
            g.armed.status === 'pass' && g.delay.status === 'pass' && g.oem.status === 'pass' ? 'met' : 'not met',
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
