// material-redesign MD2: the Outage mark is generated from one geometry and sits inside the adaptive-icon safe zone.
// Safe zone: the 66 dp circle at the centre of the 108 dp canvas (https://developer.android.com/develop/ui/views/launch/icon_design_adaptive).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOLT, paths, render, SEGMENTS, STROKE, symbolPath } from '../../../tools/icon/build.mjs';

const nums = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

test('MD2 generated icon files are current', () => {
  const out = render();
  for (const k of Object.keys(paths)) assert.equal(readFileSync(paths[k], 'utf8'), out[k], `${paths[k]} is stale: run node tools/icon/build.mjs`);
  for (const [name, xml] of Object.entries(out.symbols)) assert.equal(readFileSync(symbolPath(name), 'utf8'), xml, `${name} is stale`);
});

test('MD2 the mark stays inside the 66 dp safe circle, stroke included', () => {
  const r = 33;
  const inside = (x, y, pad) => Math.hypot(x - 54, y - 54) + pad <= r;
  for (const s of SEGMENTS) {
    // "M x1,y1 A r,r 0 large,1 x2,y2": the arc's centre is fixed, so its far point is the arc radius from that centre.
    const [x1, y1, ar, , , , , x2, y2] = nums(s.d);
    assert.ok(inside(x1, y1, STROKE / 2) && inside(x2, y2, STROKE / 2), `arc end outside: ${s.d}`);
    assert.ok(Math.hypot(0, 61 - 54) + ar + STROKE / 2 <= r, 'ring outside the safe circle');
  }
  const pts = nums(BOLT);
  for (let i = 0; i < pts.length; i += 2) assert.ok(inside(pts[i], pts[i + 1], 0.8), `bolt point ${pts[i]},${pts[i + 1]} outside`);
});

test('MD2 the themed-icon layer is one colour, so the launcher can tint it', () => {
  const mono = readFileSync(paths.mono, 'utf8');
  const colours = new Set([...mono.matchAll(/android:(?:fill|stroke)Color="(#[0-9A-F]{8})"/g)].map((m) => m[1]).filter((c) => c !== '#00000000'));
  assert.deepEqual([...colours], ['#FF000000']);
});
