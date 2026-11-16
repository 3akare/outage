// A place's power history, worked into what Insights shows (ADR 0053, ADR 0054). Pure functions, no DOM: Vitest checks
// them (web/test/web-insights.test.ts) and the Android app does the same sums in Kotlin. An area is
// { outages: [day, start minute, minutes][], promise: hours a day or null }: six weeks, day 0 a Monday (sim.js). The
// history is laid onto the calendar so that its last day falls on yesterday's weekday: a Monday stays a Monday.
import { HISTORY_WEEKS } from './sim.js';

export const DAY_MIN = 1440;

/** Monday is 0. */
export const weekday = (date) => (date.getDay() + 6) % 7;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** The history's day index that stands for yesterday, and the date of any index. */
export function calendar(today) {
  const yesterday = addDays(startOfDay(today), -1);
  const last = (HISTORY_WEEKS - 1) * 7 + weekday(yesterday);
  return { last, yesterday, dateOf: (i) => addDays(yesterday, i - last) };
}

/** Minutes without power on each history day, splitting a cut that runs past midnight. */
export function offByDay(area, days) {
  const off = new Array(days).fill(0);
  for (const [d, s, m] of area.outages) {
    let day = d;
    let t = s;
    let left = m;
    while (left > 0 && day < days) {
      const end = Math.min(DAY_MIN, t + left);
      off[day] += end - t;
      left -= end - t;
      day += 1;
      t = 0;
    }
  }
  return off;
}

const DAYS = HISTORY_WEEKS * 7;

/** Hours of power for each of the last n days, oldest first, ending yesterday. */
export function dailyHours(area, today, n = 30) {
  const { last, dateOf } = calendar(today);
  const off = offByDay(area, DAYS);
  const out = [];
  for (let i = last - n + 1; i <= last; i++) out.push({ date: dateOf(i), hours: Math.round((24 - off[i] / 60) * 10) / 10 });
  return out;
}

/** Outages that started in the last n days, newest first, with their start as a date. */
export function outagesIn(area, today, n = 30) {
  const { last, dateOf } = calendar(today);
  return area.outages
    .filter(([d]) => d > last - n && d <= last)
    .map(([d, s, m]) => {
      const day = dateOf(d);
      return { start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s), minutes: m };
    })
    .sort((a, b) => b.start - a.start);
}

export function median(values) {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** The numbers at the top of Insights for one area over the last n days. */
export function summary(area, today, n = 30) {
  const days = dailyHours(area, today, n);
  const cuts = outagesIn(area, today, n);
  const promise = area.promise ?? null;
  const avg = days.reduce((s, d) => s + d.hours, 0) / days.length;
  return {
    band: area.band ?? null,
    promise,
    avgHours: Math.round(avg * 10) / 10,
    daysBelow: promise === null ? 0 : days.filter((d) => d.hours < promise).length,
    days: days.length,
    outages: cuts.length,
    medianMinutes: Math.round(median(cuts.map((c) => c.minutes))),
    longestMinutes: cuts.reduce((m, c) => Math.max(m, c.minutes), 0),
    offHours: Math.round(days.reduce((s, d) => s + (24 - d.hours), 0) * 10) / 10,
  };
}

/**
 * When outages happen: for each weekday (Monday first) and hour, the share of those days in the last n days on which
 * the power was off at some point in that hour. 0 to 1.
 */
export function heat(area, today, n = 28) {
  const { last } = calendar(today);
  const first = last - n + 1;
  const offHours = new Map(); // day index -> Set of hours off
  const mark = (day, hour) => {
    if (day < first || day > last) return;
    if (!offHours.has(day)) offHours.set(day, new Set());
    offHours.get(day).add(hour);
  };
  for (const [d, s, m] of area.outages) {
    for (let t = s; t < s + m; t += 1) {
      if (t % 60 === 0 || t === s) mark(d + Math.floor(t / DAY_MIN), Math.floor((t % DAY_MIN) / 60));
    }
  }
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const count = new Array(7).fill(0);
  for (let i = first; i <= last; i++) {
    const wd = i % 7; // day 0 of the history is a Monday
    count[wd] += 1;
    for (const h of offHours.get(i) ?? []) grid[wd][h] += 1;
  }
  return grid.map((row, wd) => row.map((x) => (count[wd] ? x / count[wd] : 0)));
}

/** The hours of the day when power is most often off, as [from, to) hours, across all days. */
export function worstHours(grid, width = 3) {
  const byHour = new Array(24).fill(0).map((_, h) => grid.reduce((s, row) => s + row[h], 0) / grid.length);
  let best = 0;
  let at = 0;
  for (let h = 0; h < 24; h++) {
    let sum = 0;
    for (let k = 0; k < width; k++) sum += byHour[(h + k) % 24];
    if (sum > best) {
      best = sum;
      at = h;
    }
  }
  return { from: at, to: (at + width) % 24, share: best / width };
}

/** Hours without power in each of the last `weeks` 7-day spans, oldest first, ending yesterday. */
export function weekly(area, today, weeks = 5) {
  const { last, dateOf } = calendar(today);
  const off = offByDay(area, DAYS);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = last - w * 7;
    let sum = 0;
    for (let i = end - 6; i <= end; i++) sum += off[i] ?? 0;
    out.push({ from: dateOf(end - 6), to: dateOf(end), offHours: Math.round((sum / 60) * 10) / 10 });
  }
  return out;
}

/** "2 h 05 min", "45 min". */
export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

/** "7 pm", "12 am". */
export function hourLabel(h) {
  const x = ((h % 24) + 24) % 24;
  const n = x % 12 === 0 ? 12 : x % 12;
  return `${n} ${x < 12 ? 'am' : 'pm'}`;
}
