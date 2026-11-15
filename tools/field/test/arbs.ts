// Arbitraries for field dumps: valid per the shared schema, with free-text fields (gap reasons) drawn from anything the
// schema allows, including strings that look like install IDs, so the report has to keep them out.
import fc from 'fast-check';
import { GAP_BUCKETS, MAKERS, type AliasedDeviceDay, type FieldDump, type OutageRecordOut } from '@outage/shared';

const MAX_DAY_MS = 26 * 3_600_000;
const count = fc.nat({ max: 1000 });
const key = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9_.:-]{1,40}$/),
  fc.stringMatching(/^[a-z2-7]{26}$/), // looks like an install ID
  fc.stringMatching(/^[0-9a-f]{32,40}$/), // looks like a hash
  fc.stringMatching(/^8[0-9a-f]{14}$/), // looks like an H3 cell
);

const hist = fc.array(fc.nat({ max: 50 }), { minLength: GAP_BUCKETS, maxLength: GAP_BUCKETS });

function device(alias: string): fc.Arbitrary<AliasedDeviceDay> {
  return fc
    .record({
      charging: fc.integer({ min: 0, max: MAX_DAY_MS }),
      normal: fc.integer({ min: 0, max: MAX_DAY_MS }),
      reasons: fc.uniqueArray(key, { maxLength: 4 }),
    })
    .chain(({ charging, normal, reasons }) =>
      fc.record({
        v: fc.constant(1 as const),
        alias: fc.constant(alias),
        day: fc.constant('2026-11-14'),
        maker: fc.constantFrom(...MAKERS),
        androidMajor: fc.integer({ min: 8, max: 16 }),
        mode: fc.constant({ normalMs: normal, stationMs: MAX_DAY_MS - normal }),
        chargingMs: fc.constant(charging),
        armedMs: fc.integer({ min: 0, max: charging }),
        gaps: fc.tuple(
          ...reasons.map((reason) => hist.map((h) => ({ reason, count: h.reduce((a, b) => a + b, 0), lenHistMs: h }))),
        ),
        delayJobMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 64 }),
        delayReceiverMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 64 }),
        replugToRingMs: fc.array(fc.nat({ max: 200_000 }), { maxLength: 16 }),
        prompts: fc.record({ shown: count, yes: count, no: count, timeout: count }),
        alarms: fc.record({ expected: count, rung: count }),
        writeFailures: fc.oneof(fc.constant(0), count),
        standby: fc.dictionary(key, count, { maxKeys: 4 }),
        exemption: fc.boolean(),
        stopReasons: fc.oneof(fc.dictionary(key, count, { maxKeys: 4 }), fc.constant({ FGS_START_BLOCKED: 1 })),
      }),
    ) as fc.Arbitrary<AliasedDeviceDay>;
}

const outageArb: fc.Arbitrary<OutageRecordOut> = fc.record({
  kind: fc.constant('OUTAGE_RECORD' as const),
  key: fc.stringMatching(/^[0-9a-f]{16}$/),
  scopeClass: fc.constantFrom('CELL' as const, 'GROUP' as const, 'PARENT' as const),
  startMs: fc.integer({ min: Date.parse('2026-11-14T00:00:00Z'), max: Date.parse('2026-11-14T23:59:59Z') }),
  endMs: fc.constant(null),
  level: fc.constantFrom('POSSIBLE' as const, 'CONFIRMED' as const),
  drops: fc.nat({ max: 40 }),
  armedN: fc.nat({ max: 40 }),
  labelsYes: fc.nat({ max: 5 }),
  labelsNo: fc.nat({ max: 5 }),
  labelsNone: fc.nat({ max: 5 }),
  confirmedMs: fc.constant(null),
  withdrawn: fc.boolean(),
});

export const dumpArb: fc.Arbitrary<FieldDump> = fc
  .record({
    n: fc.integer({ min: 0, max: 5 }),
    silent: fc.array(
      fc.record({
        maker: fc.constantFrom(...MAKERS),
        androidMajor: fc.integer({ min: 8, max: 16 }),
        lastDay: fc.constantFrom('2026-11-13', '2026-11-12', '2026-11-08'),
      }),
      { maxLength: 3 },
    ),
    outages: fc.array(outageArb, { maxLength: 4 }),
    misses: fc.array(
      fc.record({
        kind: fc.constant('MISS' as const),
        atMs: fc.integer({ min: Date.parse('2026-11-14T00:00:00Z'), max: Date.parse('2026-11-14T23:59:59Z') }),
        armedN: fc.nat({ max: 10 }),
      }),
      { maxLength: 3 },
    ),
  })
  .chain(({ n, silent, outages, misses }) =>
    fc.tuple(...Array.from({ length: n }, (_, i) => device(`D${i + 1}`))).map((devices) => ({
      v: 1 as const,
      day: '2026-11-14',
      devices,
      silent: silent.map((s, i) => ({ alias: `D${n + i + 1}`, ...s })),
      outages,
      misses,
    })),
  );
