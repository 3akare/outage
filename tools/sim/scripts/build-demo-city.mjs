#!/usr/bin/env node
// The simulated city the app shows without real data (ADR 0052): real Lagos areas at their real places, as real H3
// resolution-8 blocks, with made-up power states. Areas are listed below (OpenStreetMap coordinates, each with its
// source) plus Lekki. Writes:
//   core/shared/fixtures/demo-city.json                        read by the web's app in the browser
//   android/outage/app/src/main/kotlin/app/outage/map/DemoCity.kt  the same data for the phone (generated, do not edit)
// Cell ids are "sim-" + the H3 index, so a simulated block can never be saved or sent as a real spot.
// Usage: node tools/sim/scripts/build-demo-city.mjs [--check]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellToBoundary, gridDisk, latLngToCell } from 'h3-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const paths = {
  json: join(root, 'core/shared/fixtures/demo-city.json'),
  kt: join(root, 'android/outage/app/src/main/kotlin/app/outage/map/DemoCity.kt'),
};

// The simulated city's own places (OpenStreetMap coordinates). The web catalog no longer holds them: it lists the 20 Lagos LGAs and 376 wards (ADR 0056).
const catalog = [
  { slug: 'yaba', name: 'Yaba', lat: 6.5068212, lng: 3.3754881, source: 'https://nominatim.openstreetmap.org/search?q=Yaba,+Lagos,+Nigeria&format=json&limit=3' },
  { slug: 'surulere', name: 'Surulere', lat: 6.5008027, lng: 3.3571159, source: 'https://nominatim.openstreetmap.org/search?q=Surulere,+Lagos,+Nigeria&format=json&limit=2' },
  { slug: 'ikeja', name: 'Ikeja', lat: 6.601627, lng: 3.3515981, source: 'https://nominatim.openstreetmap.org/search?q=Ikeja,+Lagos,+Nigeria&format=json&limit=2' },
  { slug: 'maryland', name: 'Maryland', lat: 6.5771463, lng: 3.3661931, source: 'https://nominatim.openstreetmap.org/search?q=Maryland,+Lagos,+Nigeria&format=json&limit=3' },
  { slug: 'victoria-island', name: 'Victoria Island', lat: 6.4300279, lng: 3.4259904, source: 'https://nominatim.openstreetmap.org/search?q=Victoria+Island,+Lagos,+Nigeria&format=json&limit=3' },
  { slug: 'ikoyi', name: 'Ikoyi', lat: 6.4523431, lng: 3.4280523, source: 'https://nominatim.openstreetmap.org/search?q=Ikoyi,+Lagos,+Nigeria&format=json&limit=2' },
  { slug: 'ajah', name: 'Ajah', lat: 6.4694716, lng: 3.5623861, source: 'https://nominatim.openstreetmap.org/search?q=Ajah,+Lagos,+Nigeria&format=json&limit=2' },
  { slug: 'ikorodu', name: 'Ikorodu', lat: 6.6191233, lng: 3.5041271, source: 'https://nominatim.openstreetmap.org/search?q=Ikorodu,+Lagos,+Nigeria&format=json&limit=2' },
  { slug: 'festac', name: 'Festac', lat: 6.4682727, lng: 3.2839374, source: 'https://nominatim.openstreetmap.org/search?q=Festac+Town,+Lagos,+Nigeria&format=json&limit=2' },
];
const EXTRA = [
  {
    slug: 'lekki',
    name: 'Lekki',
    lat: 6.4475959,
    lng: 3.4590768,
    source: 'https://nominatim.openstreetmap.org/search?q=Lekki+Phase+1,+Lagos,+Nigeria&format=json&limit=1',
  },
];
export const SPOT_AREA = 'yaba';

// Made-up states, the same every build: Yaba starts on so the replay can cut it.
// [area, state of the centre and its ring of six, state of the outer ring, how many outer blocks have no data]
const PLAN = {
  yaba: ['NORMAL', 'NORMAL', 0],
  surulere: ['NORMAL', 'NORMAL', 3],
  ikeja: ['POSSIBLE', 'NORMAL', 2],
  maryland: ['NORMAL', 'NORMAL', 4],
  'victoria-island': ['NORMAL', 'NORMAL', 0],
  ikoyi: ['RESTORED', 'NORMAL', 1],
  ajah: ['CONFIRMED', 'NORMAL', 5],
  ikorodu: ['NORMAL', 'NO_DATA', 12],
  festac: ['NORMAL', 'NORMAL', 6],
  lekki: ['CONFIRMED', 'POSSIBLE', 2],
};

// Simulated power history (ADR 0053), for Insights: six weeks of outages per area, Monday first. The same every build.
// Tariff bands are NERC's minimum hours of supply a day (A 20, B 16, C 12, D 8); which band each area is on is made up.
export const BANDS = { A: 20, B: 16, C: 12, D: 8 };
const AREA_BAND = { yaba: 'A', surulere: 'B', ikeja: 'A', maryland: 'B', 'victoria-island': 'A', ikoyi: 'A', ajah: 'C', ikorodu: 'D', festac: 'C', lekki: 'A' };
// Hours of power a day each area gets on average: near its band for some, short of it for others.
const MEAN_HOURS = { yaba: 18.4, surulere: 15.1, ikeja: 19.2, maryland: 16.4, 'victoria-island': 21.3, ikoyi: 21.8, ajah: 11.2, ikorodu: 8.6, festac: 12.9, lekki: 19.6 };
export const HISTORY_WEEKS = 6;
// When cuts start, by hour of day: most in the evening peak (6 p.m. to 11 p.m.), a second bump in the morning.
const HOUR_WEIGHT = [2, 2, 1, 1, 1, 2, 4, 6, 6, 4, 3, 3, 3, 3, 3, 4, 5, 7, 10, 11, 10, 8, 5, 3];
// Weekdays (Monday first) see more cuts than the weekend.
const DAY_WEIGHT = [1.15, 1.1, 1.1, 1.15, 1.2, 0.75, 0.6];

function prng(seed) {
  // mulberry32: small, fast, deterministic. https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function pick(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** [day, start minute, minutes]: day 0 is a Monday, six weeks before the last day. Outages never overlap. */
export function history(slug) {
  const r = prng(hash(slug));
  const out = [];
  const days = HISTORY_WEEKS * 7;
  for (let d = 0; d < days; d++) {
    // Minutes without power today: the area's mean, scaled by weekday and a day-to-day swing, between 0 and 20 h.
    const swing = 0.45 + r() * 1.1;
    const target = Math.min(1140, Math.max(0, (24 - MEAN_HOURS[slug]) * 60 * DAY_WEIGHT[d % 7] * swing));
    if (target < 20 || r() < 0.06) continue; // some days have no cut at all
    const n = Math.max(1, Math.min(6, Math.round(target / (120 + r() * 140))));
    const parts = Array.from({ length: n }, () => 0.4 + r());
    const sum = parts.reduce((a, b) => a + b, 0);
    const taken = [];
    for (const p of parts) {
      const minutes = Math.max(15, Math.round(((target * p) / sum) / 5) * 5);
      const free = (start) => start + minutes <= 1440 + 120 && !taken.some(([s, e]) => start < e + 30 && start + minutes + 30 > s);
      // Try the usual hours first; on a heavy day, take the first gap after a random hour.
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
  // A cut late on one day can run past midnight into the next: drop any next-day cut it would overlap.
  return out.filter(([d, s], i) => !out.some(([d2, s2, m2], j) => j < i && d2 === d - 1 && s2 + m2 > 1440 + s - 30));
}

export function build() {
  const areas = [...catalog, ...EXTRA].map((a) => ({ slug: a.slug, name: a.name, lat: a.lat, lng: a.lng, source: a.source }));
  const taken = new Set();
  const cells = [];
  const outAreas = [];
  for (const a of areas) {
    const centre = latLngToCell(a.lat, a.lng, 8);
    const inner = new Set(gridDisk(centre, 1));
    const [innerState, outerState, noData] = PLAN[a.slug] ?? ['NORMAL', 'NORMAL', 0];
    let outerSeen = 0;
    const ids = [];
    for (const h of gridDisk(centre, 2)) {
      if (taken.has(h)) continue; // where two areas meet, the first one listed keeps the block
      taken.add(h);
      let state = inner.has(h) ? innerState : outerState;
      if (!inner.has(h) && outerSeen++ < noData) state = 'NO_DATA';
      const ring = cellToBoundary(h).map(([la, ln]) => [+la.toFixed(5), +ln.toFixed(5)]);
      cells.push({ id: `sim-${h}`, area: a.slug, state, ring });
      ids.push(`sim-${h}`);
    }
    outAreas.push({ ...a, centre: `sim-${centre}`, cells: ids, band: AREA_BAND[a.slug] ?? 'B', outages: history(a.slug) });
  }
  const spotArea = outAreas.find((a) => a.slug === SPOT_AREA);
  const spot = spotArea.centre;
  const neighbours = gridDisk(spot.slice(4), 1).filter((h) => `sim-${h}` !== spot).map((h) => `sim-${h}`);
  return {
    simulated: true,
    label: 'Simulated city: real Lagos areas at their real places, made-up power states',
    resolution: 8,
    bands: BANDS,
    historyWeeks: HISTORY_WEEKS,
    spot,
    spotNeighbours: neighbours,
    areas: outAreas,
    cells,
  };
}

const kq = (s) => JSON.stringify(s);
function kotlin(city) {
  const areas = city.areas
    .map(
      (a) =>
        `        DemoCityArea(${kq(a.slug)}, ${kq(a.name)}, ${kq(a.centre)}, ${a.lat}, ${a.lng}, ${kq(a.band)}, intArrayOf(${a.outages.flat().join(', ')})),`,
    )
    .join('\n');
  const cells = city.cells
    .map((c) => `        DemoCityCell(${kq(c.id)}, ${kq(c.area)}, CellState.${c.state}, doubleArrayOf(${c.ring.flat().join(', ')})),`)
    .join('\n');
  return `package app.outage.map

// Generated by tools/sim/scripts/build-demo-city.mjs from the catalog (ADR 0052, ADR 0053). Do not edit.
// Real Lagos areas at their real places as H3 resolution-8 blocks; the power states are made up.

/**
 * [outages] is day, start minute, minutes, flattened: day 0 is a Monday, ${city.historyWeeks} weeks back (simulated history,
 * ADR 0053). [band] is the area's made-up tariff band; [lat] and [lng] are its real place (OpenStreetMap).
 */
class DemoCityArea(
    val slug: String,
    val name: String,
    val centre: String,
    val lat: Double,
    val lng: Double,
    val band: String,
    val outages: IntArray,
)

/** [ring] is latitude, longitude pairs, flattened. */
class DemoCityCell(val id: String, val area: String, val state: CellState, val ring: DoubleArray)

object DemoCity {
    const val SPOT = ${kq(city.spot)}
    const val HISTORY_WEEKS = ${city.historyWeeks}
    val bands = mapOf(${Object.entries(city.bands).map(([k, v]) => `${kq(k)} to ${v}`).join(', ')})
    val spotNeighbours = listOf(${city.spotNeighbours.map(kq).join(', ')})
    val areas = listOf(
${areas}
    )
    val cells = listOf(
${cells}
    )
}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const city = build();
  const out = { json: `${JSON.stringify(city)}\n`, kt: kotlin(city) };
  let stale = false;
  for (const k of ['json', 'kt']) {
    if (process.argv.includes('--check')) {
      if (!existsSync(paths[k]) || readFileSync(paths[k], 'utf8') !== out[k]) {
        console.error(`stale: ${paths[k]}`);
        stale = true;
      }
    } else writeFileSync(paths[k], out[k]);
  }
  if (!process.argv.includes('--check')) console.log(`${city.areas.length} areas, ${city.cells.length} blocks, spot ${city.spot}`);
  process.exit(stale ? 1 : 0);
}
