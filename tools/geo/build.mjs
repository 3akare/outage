#!/usr/bin/env node
// Rebuilds the globe's geography (ADR 0051) from Natural Earth (public domain) via world-atlas:
//   core/shared/geo/land-dots.json    land sampled every 1.2 degrees of latitude on an equal-area grid, packed as int16 pairs
//   core/shared/geo/lagos-coast.json  the coast around Lagos from the 1:10m data, as polylines
// The two packages are not dependencies of the repository. Install them only to rebuild:
//   npm i --no-save world-atlas@2.0.2 topojson-client@3.1.0 && node tools/geo/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { feature } = require('topojson-client');
const atlas = (file, key) => {
  const t = JSON.parse(readFileSync(require.resolve(`world-atlas/${file}`), 'utf8'));
  return feature(t, t.objects[key]);
};
const polygons = (fc) => fc.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));

const STEP = 1.2;
const land = polygons(atlas('land-50m.json', 'land'));
const boxes = land.map((p) => {
  let [a, b, c, d] = [180, 90, -180, -90];
  for (const [x, y] of p[0]) [a, b, c, d] = [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)];
  return [a, b, c, d];
});
const inRing = (x, y, r) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const onLand = (x, y) =>
  land.some((p, k) => {
    const [a, b, c, d] = boxes[k];
    return x >= a && x <= c && y >= b && y <= d && inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h));
  });

const dots = [];
for (let lat = -84 + STEP / 2; lat < 84; lat += STEP) {
  const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / STEP));
  for (let i = 0; i < n; i++) {
    const lng = -180 + (i + 0.5) * (360 / n);
    if (onLand(lng, lat)) dots.push([lat, lng]);
  }
}
const buf = Buffer.alloc(dots.length * 4);
dots.forEach(([la, ln], i) => {
  buf.writeInt16LE(Math.round(la * 100), i * 4);
  buf.writeInt16LE(Math.round(ln * 100), i * 4 + 2);
});
writeFileSync(
  join(root, 'core/shared/geo/land-dots.json'),
  JSON.stringify({
    source: `Natural Earth 1:50m land (public domain) via world-atlas 2.0.2, sampled every ${STEP} degrees of latitude on an equal-area grid by tools/geo/build.mjs`,
    encoding: 'base64 of little-endian int16 pairs: latitude x 100, longitude x 100',
    step: STEP,
    count: dots.length,
    data: buf.toString('base64'),
  }),
);

const [W, S, E, N] = [1.5, 5.6, 5.5, 7.6];
const lines = [];
for (const p of polygons(atlas('land-10m.json', 'land'))) {
  for (const ring of p) {
    let cur = [];
    for (const [x, y] of ring) {
      if (x >= W && x <= E && y >= S && y <= N) cur.push([+y.toFixed(4), +x.toFixed(4)]);
      else if (cur.length) {
        if (cur.length > 1) lines.push(cur);
        cur = [];
      }
    }
    if (cur.length > 1) lines.push(cur);
  }
}
writeFileSync(
  join(root, 'core/shared/geo/lagos-coast.json'),
  JSON.stringify({
    source: 'Natural Earth 1:10m land coastline (public domain) via world-atlas 2.0.2, clipped to Lagos and its coast by tools/geo/build.mjs',
    encoding: 'polylines of [latitude, longitude]',
    lines,
  }),
);
console.log(`${dots.length} land dots, ${lines.length} coast lines`);
