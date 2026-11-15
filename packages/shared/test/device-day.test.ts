import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import invalid from '../fixtures/telemetry/device-day-invalid.json';
import station from '../fixtures/telemetry/device-day-station.json';
import normal from '../fixtures/telemetry/device-day.json';
import { GAP_BUCKETS, MAKERS, MAX_DAY_MS, MAX_DEVICE_DAY_BYTES, parseDeviceDay } from '../src/index.ts';
import { INSTALL } from './arbs.ts';
import { NUM_RUNS } from './runs.ts';

const TOP = [
  'v',
  'installId',
  'day',
  'maker',
  'androidMajor',
  'mode',
  'chargingMs',
  'armedMs',
  'gaps',
  'delayJobMs',
  'delayReceiverMs',
  'replugToRingMs',
  'prompts',
  'alarms',
  'writeFailures',
  'standby',
  'exemption',
  'stopReasons',
];
const key = fc.stringMatching(/^[A-Z_]{1,12}$/);
const count = fc.nat({ max: 1000 });

const gapArb = (reason: string) =>
  fc.array(fc.nat({ max: 50 }), { minLength: GAP_BUCKETS, maxLength: GAP_BUCKETS }).map((h) => ({
    reason,
    count: h.reduce((a, b) => a + b, 0),
    lenHistMs: h,
  }));

const deviceDayArb = fc
  .record({
    charging: fc.integer({ min: 0, max: MAX_DAY_MS }),
    normal: fc.integer({ min: 0, max: MAX_DAY_MS }),
    reasons: fc.uniqueArray(key, { maxLength: 6 }),
  })
  .chain(({ charging, normal: normalMs, reasons }) =>
    fc.record({
      v: fc.constant(1),
      installId: fc.constant(INSTALL),
      day: fc.constantFrom('2026-11-14', '2027-02-28', '2026-12-31'),
      maker: fc.constantFrom(...MAKERS),
      androidMajor: fc.integer({ min: 8, max: 16 }),
      mode: fc.constant({ normalMs, stationMs: MAX_DAY_MS - normalMs }),
      chargingMs: fc.constant(charging),
      armedMs: fc.integer({ min: 0, max: charging }),
      gaps: fc.tuple(...reasons.map(gapArb)),
      delayJobMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 64 }),
      delayReceiverMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 64 }),
      replugToRingMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 16 }),
      prompts: fc.record({ shown: count, yes: count, no: count, timeout: count }),
      alarms: fc.record({ expected: count, rung: count }),
      writeFailures: count,
      standby: fc.dictionary(key, count, { maxKeys: 6 }),
      exemption: fc.boolean(),
      stopReasons: fc.dictionary(key, count, { maxKeys: 6 }),
    }),
  );

describe('field-telemetry contract fixtures', () => {
  it('R2 valid fixtures parse and round-trip unchanged', () => {
    for (const doc of [normal, station]) expect(parseDeviceDay(doc)).toEqual({ ok: true, value: doc });
  });

  it('R3.4 every invalid fixture is rejected with its documented code', () => {
    expect(invalid.length).toBeGreaterThan(10);
    for (const c of invalid) {
      const r = parseDeviceDay(c.doc);
      expect(r.ok, c.name).toBe(false);
      if (!r.ok) expect(r.code, c.name).toBe(c.code);
    }
  });
});

describe('F1_aggregate_privacy_and_size (schema part)', () => {
  it('F1 any valid aggregate parses, has only schema keys and fits in 8 KiB', () => {
    fc.assert(
      fc.property(deviceDayArb, (doc) => {
        const r = parseDeviceDay(doc);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(Object.keys(r.value)).toEqual(TOP);
        expect(JSON.stringify(r.value).length).toBeLessThanOrEqual(MAX_DEVICE_DAY_BYTES);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F1 an extra field anywhere is rejected (location, cell, model, timestamp)', () => {
    const extra = fc.constantFrom('lat', 'cell', 'model', 'ts', 'brand', 'extra');
    const where = fc.constantFrom('top', 'mode', 'prompts', 'alarms', 'gap');
    fc.assert(
      fc.property(deviceDayArb, extra, where, fc.jsonValue(), (doc, name, at, val) => {
        const d = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
        if (at === 'top') d[name] = val;
        else if (at === 'gap') {
          if (doc.gaps.length === 0) return;
          (d.gaps as Record<string, unknown>[])[0][name] = val;
        } else (d[at] as Record<string, unknown>)[name] = val;
        const r = parseDeviceDay(d);
        expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_FIELD' });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F1 removing any top-level field is rejected', () => {
    fc.assert(
      fc.property(deviceDayArb, fc.constantFrom(...TOP), (doc, k) => {
        const { [k as keyof typeof doc]: _gone, ...rest } = doc;
        expect(parseDeviceDay(rest).ok).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('F1 the largest aggregate the caps allow still fits in 8 KiB', () => {
    const reasons = Array.from({ length: 32 }, (_, i) => `REASON_${String(i).padStart(2, '0')}_${'X'.repeat(28)}`);
    const big = {
      ...normal,
      gaps: reasons.map((reason) => ({ reason, count: 0, lenHistMs: [0, 0, 0, 0, 0, 0] })),
      standby: Object.fromEntries(reasons.map((r) => [r, 1_000_000])),
      stopReasons: Object.fromEntries(reasons.map((r) => [r, 1_000_000])),
      delayJobMs: Array(64).fill(MAX_DAY_MS),
      delayReceiverMs: Array(64).fill(MAX_DAY_MS),
    };
    expect(parseDeviceDay(big).ok).toBe(true);
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(MAX_DEVICE_DAY_BYTES);
  });

  it('F1 arbitrary JSON never throws and is never accepted unless it is a full aggregate', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(parseDeviceDay(v).ok).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
