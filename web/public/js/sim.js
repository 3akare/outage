// Simulated power around any place on Earth (ADR 0054). The app in the browser has no real phones, so it makes up a
// plausible neighbourhood around the visitor's own block: H3 resolution-8 blocks within a few rings, their power states,
// and six weeks of outages for the block and its area. Everything is seeded from the block id, so the same place always
// shows the same story, and nothing is sent anywhere. Pure functions: Vitest checks them (web/test/web-sim.test.ts).

/** mulberry32: small, fast, deterministic. https://gist.github.com/tommyettinger/46a874533244883189143505d203312c */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

export const HISTORY_WEEKS = 6;
// When cuts start, by hour of day: an evening peak (6 p.m. to 11 p.m.) and a smaller morning one.
const HOUR_WEIGHT = [2, 2, 1, 1, 1, 2, 4, 6, 6, 4, 3, 3, 3, 3, 3, 4, 5, 7, 10, 11, 10, 8, 5, 3];
// Monday first: weekdays see more cuts than the weekend.
const DAY_WEIGHT = [1.15, 1.1, 1.1, 1.15, 1.2, 0.75, 0.6];

function pick(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Six weeks of outages for a place, as [day, start minute, minutes]; day 0 is a Monday. `meanHours` is the average
 * hours of power a day. Outages never overlap, and a cut never starts within 30 minutes of the last one ending.
 */
export function history(seed, meanHours) {
  const r = prng(hash(seed));
  const out = [];
  const days = HISTORY_WEEKS * 7;
  for (let d = 0; d < days; d++) {
    const swing = 0.45 + r() * 1.1;
    const target = Math.min(1140, Math.max(0, (24 - meanHours) * 60 * DAY_WEIGHT[d % 7] * swing));
    if (target < 20 || r() < 0.06) continue;
    const n = Math.max(1, Math.min(6, Math.round(target / (120 + r() * 140))));
    const parts = Array.from({ length: n }, () => 0.4 + r());
    const sum = parts.reduce((a, b) => a + b, 0);
    const taken = [];
    for (const p of parts) {
      const minutes = Math.max(15, Math.round((target * p) / sum / 5) * 5);
      const free = (start) => start + minutes <= 1440 + 120 && !taken.some(([s, e]) => start < e + 30 && start + minutes + 30 > s);
      let start = -1;
      for (let tries = 0; tries < 12 && start < 0; tries++) {
        const t = pick(HOUR_WEIGHT, r()) * 60 + Math.floor(r() * 12) * 5;
        if (free(t)) start = t;
      }
      for (let t = Math.floor(r() * 288) * 5, k = 0; start < 0 && k < 288; k++, t = (t + 5) % 1440) if (free(t)) start = t;
      if (start >= 0) taken.push([start, start + minutes]);
    }
    for (const [s, e] of taken.sort((a, b) => a[0] - b[0])) out.push([d, s, e - s]);
  }
  return out.filter(([d, s], i) => !out.some(([d2, s2, m2], j) => j < i && d2 === d - 1 && s2 + m2 > 1440 + s - 30));
}

// NERC's minimum hours of supply a day by tariff band (Nigeria). Elsewhere there is no band, so no promise line.
export const BANDS = { A: 20, B: 16, C: 12, D: 8, E: 4 };
/** Roughly Nigeria (its bounding box): the only place where tariff bands apply. */
export const inNigeria = (lat, lng) => lat > 4 && lat < 14 && lng > 2.6 && lng < 14.7;

/** A plausible mean of hours of power a day for a place, between about 11 and 22 h, fixed by its block. */
export function meanHoursFor(cell) {
  const r = prng(hash(`mean:${cell}`));
  return Math.round((11 + r() * 11) * 10) / 10;
}

/**
 * The simulated neighbourhood around `centre` (an H3 index): every block within `radius` rings with a state, using
 * h3 (h3-js's gridDisk and gridDistance). The visitor's own block and its first ring start with power on, so a
 * simulated blackout can cut them; elsewhere one or two clusters are out or maybe out, one is back, and the outer edge
 * has blocks with too few phones.
 */
export function neighbourhood(h3, centre, radius = 6) {
  const r = prng(hash(`hood:${centre}`));
  const cells = h3.gridDisk(centre, radius);
  const far = cells.filter((c) => h3.gridDistance(centre, c) >= 3);
  const seeds = [];
  const kinds = ['CONFIRMED', 'POSSIBLE', 'RESTORED', r() < 0.5 ? 'CONFIRMED' : 'POSSIBLE'];
  for (const kind of kinds) seeds.push({ cell: far[Math.floor(r() * far.length)], kind, size: kind === 'CONFIRMED' ? 1 : r() < 0.5 ? 1 : 0 });
  const states = {};
  for (const c of cells) {
    const d = h3.gridDistance(centre, c);
    let s = 'NORMAL';
    for (const seed of seeds) if (h3.gridDistance(seed.cell, c) <= seed.size) s = seed.kind;
    if (d >= radius - 1 && r() < (d === radius ? 0.45 : 0.15)) s = 'NO_DATA';
    if (d <= 1) s = 'NORMAL';
    states[c] = s;
  }
  return states;
}

/** The history and band for the visitor's area (their block and its first ring). */
export function areaFor(cell, lat, lng) {
  const mean = meanHoursFor(cell);
  const nigeria = inNigeria(lat, lng);
  const band = nigeria ? (mean >= 18 ? 'A' : mean >= 15 ? 'B' : mean >= 11 ? 'C' : 'D') : null;
  return { cell, band, promise: band ? BANDS[band] : null, meanHours: mean, outages: history(`hist:${cell}`, mean) };
}
