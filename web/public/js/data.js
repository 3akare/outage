// The simulated city's history, worked into the numbers the area sheet shows (ADR 0053). Pure functions, no DOM: Vitest checks them
// (web/test/web-history.test.ts). The history is six weeks of made-up
// outages per area, day 0 a Monday (tools/sim/scripts/build-demo-city.mjs). It is laid onto the calendar so that its last
// day falls on yesterday's weekday: a Monday in the data is always shown as a Monday.

export const DAY_MIN = 1440;

/** Monday is 0. */
export const weekday = (date) => (date.getDay() + 6) % 7;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** The history's day index that stands for yesterday, and the date of any index. */
export function calendar(city, today) {
  const yesterday = addDays(startOfDay(today), -1);
  const last = (city.historyWeeks - 1) * 7 + weekday(yesterday);
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

const daysOf = (city) => city.historyWeeks * 7;

/** Hours of power for each of the last n days, oldest first, ending yesterday. */
export function dailyHours(city, area, today, n = 30) {
  const { last, dateOf } = calendar(city, today);
  const off = offByDay(area, daysOf(city));
  const out = [];
  for (let i = last - n + 1; i <= last; i++) out.push({ date: dateOf(i), hours: Math.round((24 - off[i] / 60) * 10) / 10 });
  return out;
}

/** Outages that started in the last n days, newest first, with their start as a date. */
export function outagesIn(city, area, today, n = 30) {
  const { last, dateOf } = calendar(city, today);
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

/** The numbers for one area over the last n days. */
export function summary(city, area, today, n = 30) {
  const days = dailyHours(city, area, today, n);
  const cuts = outagesIn(city, area, today, n);
  const avg = days.reduce((s, d) => s + d.hours, 0) / days.length;
  return {
    avgHours: Math.round(avg * 10) / 10,
    days: days.length,
    outages: cuts.length,
    medianMinutes: Math.round(median(cuts.map((c) => c.minutes))),
    longestMinutes: cuts.reduce((m, c) => Math.max(m, c.minutes), 0),
    offHours: Math.round(days.reduce((s, d) => s + (24 - d.hours), 0) * 10) / 10,
  };
}

/** "2 h 05 min", "45 min". */
export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}
