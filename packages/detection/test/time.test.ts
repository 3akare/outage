import { describe, expect, it } from 'vitest';
import { DAY_MS, dayStartMs, HOUR_MS, hourStartMs, localDay, localHour } from '../src/time.ts';

describe('R4.6 time helpers', () => {
  it('R4_6_hour_and_day_with_positive_offset', () => {
    const lagos = HOUR_MS; // +1 h
    expect(localHour(0, lagos)).toBe(1);
    expect(localHour(23 * HOUR_MS - 1, lagos)).toBe(23);
    expect(localHour(23 * HOUR_MS, lagos)).toBe(0);
    expect(localDay(23 * HOUR_MS - 1, lagos)).toBe(0);
    expect(localDay(23 * HOUR_MS, lagos)).toBe(1);
  });

  it('R4_6_negative_offsets_and_negative_times', () => {
    const off = -5 * HOUR_MS;
    expect(localHour(0, off)).toBe(19);
    expect(localDay(0, off)).toBe(-1);
    expect(localHour(5 * HOUR_MS, off)).toBe(0);
    expect(localDay(5 * HOUR_MS, off)).toBe(0);
    expect(localHour(-1, 0)).toBe(23);
    expect(localDay(-1, 0)).toBe(-1);
  });

  it('R4_6_day_boundaries_round_trip', () => {
    for (const off of [0, HOUR_MS, -7 * HOUR_MS, 13 * 60_000]) {
      for (const day of [-3, 0, 19_000]) {
        const s = dayStartMs(day, off);
        expect(localDay(s, off)).toBe(day);
        expect(localDay(s - 1, off)).toBe(day - 1);
        expect(localHour(s, off)).toBe(0);
        expect(localHour(s + DAY_MS - 1, off)).toBe(23);
        for (let h = 0; h < 24; h++) expect(localHour(hourStartMs(day, h, off), off)).toBe(h);
      }
    }
  });
});
