#!/usr/bin/env node
// Made-up power states for every Lagos block (all 4,968 H3 resolution-8 cells), so the whole map is coloured the way
// the first nine demo places were, on the web and on the phone. Writes:
//   core/shared/fixtures/places/lagos-states.json   { label, states: { <H3 index>: state } }
// Mostly NORMAL, a few patches of CONFIRMED, POSSIBLE and RESTORED in every local government, and some NO_DATA on the
// edges of each one (under 15% overall). Same every build (seeded). The web reads it through /lagos-sim.json
// (web/ui/simulate/lagos-sim.ts); the phone copies the file into its assets.
// Usage: node tools/sim/scripts/build-lagos-states.mjs [--check]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gridDisk } from 'h3-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = join(root, 'core/shared/fixtures/places');
export const STATES_PATH = join(dir, 'lagos-states.json');
const NO_DATA_SHARE = 0.06; // of the edge blocks of each LGA

function prng(seed) {
  // mulberry32, as in build-demo-city.mjs: small, fast, deterministic.
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

// What the patches are made of: out, maybe, back, and a little "on" to break them up.
const PATCH_STATES = ['CONFIRMED', 'CONFIRMED', 'POSSIBLE', 'POSSIBLE', 'RESTORED'];

export function build() {
  const places = JSON.parse(readFileSync(join(dir, 'lagos-places.json'), 'utf8'));
  const geo = JSON.parse(readFileSync(join(dir, 'lagos-geo.json'), 'utf8'));
  const states = Object.fromEntries(Object.keys(geo.cells).sort().map((h) => [h, 'NORMAL']));
  for (const lga of places.lgas) {
    const r = prng(hash(lga.slug));
    const own = new Set(lga.cells);
    const list = [...own].sort();
    // Patches: the middle block of the LGA and its ring, then one or two more at random places in it.
    const patches = [lga.centreCell, ...Array.from({ length: 1 + Math.floor(r() * 2) }, () => list[Math.floor(r() * list.length)])];
    patches.forEach((centre, i) => {
      const state = PATCH_STATES[Math.floor(r() * PATCH_STATES.length)];
      const radius = i === 0 && r() < 0.35 ? 2 : 1;
      for (const h of gridDisk(centre, radius)) if (own.has(h)) states[h] = state;
    });
    // NO_DATA on the edges: blocks with fewer than six neighbours inside the LGA.
    const edge = list.filter((h) => gridDisk(h, 1).filter((n) => own.has(n)).length < 7);
    for (const h of edge) if (r() < NO_DATA_SHARE) states[h] = 'NO_DATA';
  }
  return { label: 'Simulated power states for every Lagos block: made up, the same every build', states };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = `${JSON.stringify(build())}\n`;
  if (process.argv.includes('--check')) {
    if (!existsSync(STATES_PATH) || readFileSync(STATES_PATH, 'utf8') !== out) {
      console.error(`stale: ${STATES_PATH}`);
      process.exit(1);
    }
  } else {
    writeFileSync(STATES_PATH, out);
    const v = Object.values(build().states);
    const n = (s) => v.filter((x) => x === s).length;
    console.log(`${v.length} blocks: ${n('NORMAL')} on, ${n('POSSIBLE')} maybe, ${n('CONFIRMED')} out, ${n('RESTORED')} back, ${n('NO_DATA')} no data`);
  }
}
