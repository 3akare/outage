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

test('ADR 0053 simulated history: six weeks per area, inside the days, never overlapping, same on the phone', () => {
  const kt = readFileSync(paths.kt, 'utf8');
  const days = city.historyWeeks * 7;
  for (const a of city.areas) {
    assert.ok(a.outages.length > 0, a.slug);
    assert.ok(city.bands[a.band] > 0, a.slug);
    const ends = a.outages.map(([d, s, m]) => {
      assert.ok(d >= 0 && d < days && s >= 0 && s < 1440 && m >= 15, `${a.slug} ${d},${s},${m}`);
      return [d * 1440 + s, d * 1440 + s + m];
    });
    ends.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < ends.length; i++) assert.ok(ends[i][0] >= ends[i - 1][1], `${a.slug} overlaps at ${i}`);
    assert.ok(kt.includes(`"${a.band}", intArrayOf(${a.outages.flat().join(', ')}))`), `${a.slug} on the phone`);
  }
});
