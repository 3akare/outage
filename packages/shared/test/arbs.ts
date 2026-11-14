import { latLngToCell } from 'h3-js';
import fc from 'fast-check';
import type { WireEvent } from '../src/index.ts';

export const INSTALL = 'kg4yq7mxwb2ndpr3tfhj5vcsaz';

/** Real res-8 cells anywhere on earth. */
export const cellArb = fc
  .tuple(fc.double({ min: -85, max: 85, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }))
  .map(([lat, lng]) => latLngToCell(lat, lng, 8));

const shortId = fc.stringMatching(/^[A-Za-z0-9_.:-]{1,40}$/);

/** A valid wire event of any type for `installId`. */
export function validEventArb(installId = INSTALL): fc.Arbitrary<WireEvent> {
  const base = {
    installId: fc.constant(installId),
    seq: fc.nat({ max: 1_000_000 }),
    elapsedMs: fc.integer({ min: 0, max: 604_800_000 }),
    cell: cellArb,
    timeQuality: fc.constant('OK' as const),
  };
  const plain = fc.record(
    {
      ...base,
      type: fc.constantFrom('ARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG', 'DISARMED' as const),
      confidence: fc.constantFrom('HIGH', 'LOW' as const),
      stopReason: shortId,
      reason: shortId,
      schedulingDelayMs: fc.option(fc.nat({ max: 100_000 }), { nil: null }),
      batteryPct: fc.integer({ min: 0, max: 100 }),
      plugType: shortId,
    },
    { requiredKeys: ['installId', 'seq', 'type', 'elapsedMs', 'cell', 'confidence', 'timeQuality'] },
  ) as fc.Arbitrary<WireEvent>;
  const label = fc.record({
    ...base,
    type: fc.constant('LABEL' as const),
    confidence: fc.constant('HIGH' as const),
    refSeq: fc.nat({ max: 1_000_000 }),
    answer: fc.constantFrom('YES', 'NO' as const),
  }) as fc.Arbitrary<WireEvent>;
  return fc.oneof(plain, label);
}
