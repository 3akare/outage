// ADR 0054: the simulation around any place (public/js/sim.js) and the Insights sums over it (public/js/data.js).
import { describe, expect, it } from 'vitest';
import { cellToBoundary, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { calendar, dailyHours, duration, heat, median, offByDay, outagesIn, summary, weekday, weekly } from '../public/js/data.js';
import { areaFor, BANDS, history, inNigeria, meanHoursFor, neighbourhood } from '../public/js/sim.js';

const TODAY = new Date(2026, 10, 16, 12); // a Monday
const IBADAN = latLngToCell(7.3775, 3.947, 8);
const ACCRA = latLngToCell(5.6037, -0.187, 8);

describe('simulation around the visitor', () => {
  it('builds a neighbourhood around any block, the same every time, with the visitor and the first ring on', () => {
    const h3 = { gridDisk, gridDistance };
    const a = neighbourhood(h3, IBADAN, 6);
    expect(a).toEqual(neighbourhood(h3, IBADAN, 6));
    expect(Object.keys(a)).toHaveLength(127);
    for (const c of gridDisk(IBADAN, 1)) expect(a[c]).toBe('NORMAL');
    expect(Object.values(a).some((s) => s === 'CONFIRMED')).toBe(true);
    expect(cellToBoundary(IBADAN)).toHaveLength(6);
  });

  it('tariff bands only in Nigeria; elsewhere no promise', () => {
    expect(inNigeria(7.3775, 3.947)).toBe(true);
    expect(inNigeria(5.6037, -0.187)).toBe(false);
    const ib = areaFor(IBADAN, 7.3775, 3.947);
    expect(ib.promise).toBe(BANDS[ib.band as keyof typeof BANDS]);
    const ac = areaFor(ACCRA, 5.6037, -0.187);
    expect(ac.band).toBeNull();
    expect(ac.promise).toBeNull();
    expect(summary(ac, TODAY, 30).daysBelow).toBe(0);
  });

  it('history: six weeks, never overlapping, about the mean hours of power a day', () => {
    const mean = meanHoursFor(IBADAN);
    expect(mean).toBeGreaterThanOrEqual(11);
    expect(mean).toBeLessThanOrEqual(22);
    const h = history(`hist:${IBADAN}`, mean);
    const spans = h.map(([d, s, m]) => [d * 1440 + s, d * 1440 + s + m]).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
    const avg = offByDay({ outages: h, promise: null }, 42).reduce((s, m) => s + (24 - m / 60), 0) / 42;
    expect(Math.abs(avg - mean)).toBeLessThan(3.5);
  });
});

describe('Insights sums', () => {
  const area = areaFor(IBADAN, 7.3775, 3.947);

  it('the last day is yesterday and keeps its weekday', () => {
    const cal = calendar(TODAY);
    expect(cal.dateOf(cal.last).getDate()).toBe(15);
    expect(cal.last % 7).toBe(weekday(cal.yesterday));
  });

  it('30 days of hours between 0 and 24, ending yesterday; a cut past midnight counts on both days', () => {
    const d = dailyHours(area, TODAY, 30);
    expect(d).toHaveLength(30);
    expect(d[29].date.getDate()).toBe(15);
    expect(d.every((x) => x.hours >= 0 && x.hours <= 24)).toBe(true);
    expect(offByDay({ outages: [[0, 1380, 120]], promise: null }, 2)).toEqual([60, 60]);
  });

  it('summary agrees with its parts; heatmap shares are 0 to 1; five weeks of trend', () => {
    const s = summary(area, TODAY, 30);
    const cuts = outagesIn(area, TODAY, 30);
    expect(s.outages).toBe(cuts.length);
    expect(s.longestMinutes).toBe(Math.max(...cuts.map((c) => c.minutes)));
    expect(s.medianMinutes).toBe(Math.round(median(cuts.map((c) => c.minutes))));
    const g = heat(area, TODAY, 28);
    expect(g).toHaveLength(7);
    expect(g.flat().every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(weekly(area, TODAY, 5)).toHaveLength(5);
  });

  it('formats durations', () => {
    expect(duration(45)).toBe('45 min');
    expect(duration(125)).toBe('2 h 05 min');
    expect(duration(120)).toBe('2 h');
  });
});
