// ADR 0053: the history sums over the simulated history (public/js/data.js).
import { describe, expect, it } from 'vitest';
import city from '@outage/shared/fixtures/demo-city.json' with { type: 'json' };
import { calendar, dailyHours, duration, median, offByDay, outagesIn, summary, weekday } from '../public/js/data.js';

const C = city as unknown as Parameters<typeof summary>[0];
const yaba = C.areas.find((a) => a.slug === 'yaba') as (typeof C.areas)[number];
const TODAY = new Date(2026, 10, 16, 12); // a Monday

describe('simulated history laid on the calendar', () => {
  it('the last day is yesterday and keeps its weekday', () => {
    const cal = calendar(C, TODAY);
    expect(cal.dateOf(cal.last).getDate()).toBe(15);
    expect(cal.last % 7).toBe(weekday(cal.yesterday));
  });

  it('30 days of hours, between 0 and 24, ending yesterday', () => {
    const d = dailyHours(C, yaba, TODAY, 30);
    expect(d).toHaveLength(30);
    expect(d[29].date.getDate()).toBe(15);
    expect(d.every((x) => x.hours >= 0 && x.hours <= 24)).toBe(true);
  });

  it('minutes off a day never pass 24 h, and a cut past midnight counts on both days', () => {
    expect(offByDay({ ...yaba, outages: [[0, 1380, 120]] }, 2)).toEqual([60, 60]);
    expect(offByDay(yaba, 42).every((m) => m <= 1440)).toBe(true);
  });

  it('summary agrees with its parts', () => {
    const s = summary(C, yaba, TODAY, 30);
    const cuts = outagesIn(C, yaba, TODAY, 30);
    expect(s.outages).toBe(cuts.length);
    expect(s.longestMinutes).toBe(Math.max(...cuts.map((c) => c.minutes)));
    expect(s.medianMinutes).toBe(Math.round(median(cuts.map((c) => c.minutes))));
  });

  it('formats durations', () => {
    expect(duration(45)).toBe('45 min');
    expect(duration(125)).toBe('2 h 05 min');
    expect(duration(120)).toBe('2 h');
  });
});
