// MD2: the Outage mark is generated from one source and sits inside the adaptive-icon safe zone.
// Safe zone: the 66 dp circle at the centre of the 108 dp canvas (https://developer.android.com/develop/ui/views/launch/icon_design_adaptive).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { paths, RADIUS, RING, render, symbolPath } from '../../../tools/icon/build.mjs';

test('MD2 generated icon files are current', () => {
  const out = render();
  for (const k of Object.keys(paths)) assert.equal(readFileSync(paths[k], 'utf8'), out[k], `${paths[k]} is stale: run node tools/icon/build.mjs`);
  for (const [name, xml] of Object.entries(out.symbols)) assert.equal(readFileSync(symbolPath(name), 'utf8'), xml, `${name} is stale`);
});

test('MD2 the mark stays inside the 66 dp safe circle', () => {
  // The disc is centred on the canvas, so its radius is its furthest point.
  assert.ok(RADIUS <= 33, `radius ${RADIUS} outside`);
  assert.ok(RING > 0 && RING < RADIUS / 2);
  assert.match(readFileSync(paths.fg, 'utf8'), /A24 24 0 1 1 54 78/);
});

test('MD2 the themed-icon layer is one colour, so the launcher can tint it', () => {
  const mono = readFileSync(paths.mono, 'utf8');
  const colours = new Set([...mono.matchAll(/android:(?:fill|stroke)Color="(#[0-9A-F]{8})"/g)].map((m) => m[1]));
  assert.deepEqual([...colours], ['#FF000000']);
});
