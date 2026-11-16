// ADR 0052: the committed simulated city (web JSON and the phone's Kotlin) is exactly what the generator builds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build, paths } from '../../../tools/sim/scripts/build-demo-city.mjs';

const city = build();

test('demo city: the committed JSON is current', () => {
  assert.equal(readFileSync(paths.json, 'utf8'), `${JSON.stringify(city)}\n`, 'run node tools/sim/scripts/build-demo-city.mjs');
});

test('demo city: the phone has the same blocks and spot as the web', () => {
  const kt = readFileSync(paths.kt, 'utf8');
  for (const c of city.cells) assert.ok(kt.includes(`DemoCityCell("${c.id}", "${c.area}", CellState.${c.state},`), c.id);
  assert.ok(kt.includes(`const val SPOT = "${city.spot}"`));
});

test('demo city: every block id is marked simulated', () => {
  assert.ok(city.cells.every((c) => c.id.startsWith('sim-')));
});
