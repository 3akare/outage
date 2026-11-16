// MD2: the Outage wordmark is generated from one source and sits inside the adaptive-icon safe zone.
// Safe zone: the 66 dp circle at the centre of the 108 dp canvas (https://developer.android.com/develop/ui/views/launch/icon_design_adaptive).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { glyphs, paths, render, symbolPath, WIDTH } from '../../../tools/icon/build.mjs';

test('MD2 generated icon files are current', () => {
  const out = render();
  for (const k of Object.keys(paths)) assert.equal(readFileSync(paths[k], 'utf8'), out[k], `${paths[k]} is stale: run node tools/icon/build.mjs`);
  for (const [name, xml] of Object.entries(out.symbols)) assert.equal(readFileSync(symbolPath(name), 'utf8'), xml, `${name} is stale`);
});

test('MD2 the wordmark stays inside the 66 dp safe circle', () => {
  // Every outline point, placed as the icon places it, is inside the circle.
  for (const g of glyphs()) {
    const nums = [...g.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = g.tx + nums[i] * g.s;
      const y = g.ty - nums[i + 1] * g.s;
      assert.ok(Math.hypot(x - 54, y - 54) <= 33, `point ${x.toFixed(1)},${y.toFixed(1)} outside`);
    }
  }
  assert.ok(WIDTH <= 62);
});

test('MD2 the themed-icon layer is one colour, so the launcher can tint it', () => {
  const mono = readFileSync(paths.mono, 'utf8');
  const colours = new Set([...mono.matchAll(/android:(?:fill|stroke)Color="(#[0-9A-F]{8})"/g)].map((m) => m[1]));
  assert.deepEqual([...colours], ['#FF000000']);
});
