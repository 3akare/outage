// detection-engine task 16 (R14, R17). Contract: a 30-phone outage is confirmed within 10 s of its last UNPLUG.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OUTAGE_30_PHONES, outage30Fixture } from '../src/fixture.ts';
import { buildReplay } from '../src/replay.ts';
import { NUM_RUNS } from './runs.ts';

const CONFIRM_WITHIN_MS = 10_000;

describe('30-phone outage generator', () => {
  it('R17_outage30_shape: 30 armed phones, 30 unplugs, 30 replugs, every event and phone simulated', () => {
    const fx = outage30Fixture();
    expect(fx.phones).toHaveLength(OUTAGE_30_PHONES);
    const count = (t: string) => fx.events.filter((e) => e.type === t).length;
    expect([count('ARMED'), count('UNPLUG'), count('REPLUG')]).toEqual([30, 30, 30]);
    expect(fx.events.every((e) => e.simulated === true)).toBe(true);
    expect(fx.source).toBe('SYNTHETIC');
  });

  it('R17_outage30_confirmed_within_10s: the replay shows CONFIRMED no later than 10 s after the last UNPLUG', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 1, maxLength: 30 }), (jitter) => {
        const fx = outage30Fixture(jitter);
        const lastUnplug = Math.max(...fx.events.filter((e) => e.type === 'UNPLUG').map((e) => e.tMs));
        const confirmed = buildReplay(fx).frames.find((f) => f.cells[0]?.state === 'CONFIRMED');
        expect(confirmed).toBeDefined();
        expect((confirmed?.tMs ?? Number.POSITIVE_INFINITY) - lastUnplug).toBeLessThanOrEqual(CONFIRM_WITHIN_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
