// sensor-android task 2: shared sensor types. The Kotlin SensorContractTest reads the same fixture.
import { describe, expect, it } from 'vitest';
import events from '../fixtures/sensor/sensor-events.json';
import { isSensorEvent } from '../src/sensor.ts';

const fixture = events as unknown[];

describe('sensor types', () => {
  it('accepts every fixture event', () => {
    for (const e of fixture) expect(isSensorEvent(e)).toBe(true);
  });

  it('rejects an extra field (no location can ride along, R12)', () => {
    expect(isSensorEvent({ ...(fixture[0] as object), lat: 6.5 })).toBe(false);
  });

  it('rejects a missing field and a bad enum', () => {
    const { source: _s, ...rest } = fixture[0] as Record<string, unknown>;
    expect(isSensorEvent(rest)).toBe(false);
    expect(isSensorEvent({ ...(fixture[0] as object), plugType: 'SOLAR' })).toBe(false);
  });
});
