import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tail, minK, minKTable } from '../poisson.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'poisson.mjs');
const close = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} vs ${b}`);

// Reference values computed independently (Python, upward summation and 1 - sum) on 2026-11-14.
test('tail matches independent reference values', () => {
  close(tail(3, 0.15), 0.000502862);
  close(tail(2, 0.15), 0.010185827);
  close(tail(7, 1.5), 0.000925992);
  close(tail(14, 5), 0.00069799);
  close(tail(5, 2), 0.052653017);
});

test('tail agrees with the textbook formula 1 - sum(0..k-1) where that formula is accurate', () => {
  for (const [k, mu] of [[1, 0.5], [2, 1], [4, 3], [6, 2.5], [10, 12]]) {
    let s = 0, term = Math.exp(-mu);
    for (let i = 0; i < k; i++) { s += term; term *= mu / (i + 1); }
    close(tail(k, mu), 1 - s, 1e-9);
  }
});

test('tail edge cases and invariants', () => {
  assert.equal(tail(0, 3), 1); assert.equal(tail(5, 0), 0);
  assert.throws(() => tail(-1, 1), RangeError); assert.throws(() => tail(1.5, 1), RangeError); assert.throws(() => tail(1, -2), RangeError); assert.throws(() => tail(1, NaN), RangeError);
  for (const mu of [0.01, 0.3, 2, 9, 40]) {
    let prev = 1;
    for (let k = 0; k <= 80; k++) { const t = tail(k, mu); assert.ok(t >= 0 && t <= 1); assert.ok(t <= prev + 1e-15, `decreasing in k (mu ${mu}, k ${k})`); prev = t; }
  }
  for (let k = 1; k < 20; k++) assert.ok(tail(k, 2.0) < tail(k, 2.5), 'increasing in mu');
});

test('tail keeps full precision where 1 - sum would lose it (very small probabilities) and does not overflow for large k', () => {
  const t = tail(30, 0.5);
  assert.ok(t > 0 && t < 1e-30, String(t));
  const naive = (() => { let s = 0, term = Math.exp(-0.5); for (let i = 0; i < 30; i++) { s += term; term *= 0.5 / (i + 1); } return 1 - s; })();
  assert.ok(naive === 0 || Math.abs(naive) < 1e-15, 'the textbook form has lost every digit here');
  assert.ok(Number.isFinite(tail(1000, 900)) && tail(1000, 900) > 0);
});

// The table in docs/adr/0005-detection-parameters.md (prior: 2 unplugs per armed phone per hour, W = 90 s).
test('minKTable reproduces the ADR 0005 table', () => {
  const rows = minKTable({ lambdaPerSec: 2 / 3600, windowSec: 90, ns: [3, 5, 10, 20, 30, 50, 100] });
  assert.deepEqual(rows.map((r) => [r.n, r.possible, r.confirmed]), [[3, 2, 3], [5, 2, 4], [10, 3, 5], [20, 4, 6], [30, 5, 7], [50, 6, 10], [100, 10, 14]]);
  assert.deepEqual(rows.map((r) => Number(r.mu.toFixed(2))), [0.15, 0.25, 0.5, 1, 1.5, 2.5, 5]);
});

test('with a heavier prior, three phones can never confirm (a 4 per hour prior)', () => {
  const r = minKTable({ lambdaPerSec: 4 / 3600, windowSec: 90, ns: [3] })[0];
  assert.equal(r.confirmed, null); assert.equal(r.possible, 2);
  assert.equal(minK(3, 0.3, 0.001, 3), null);
});

test('CLI: tail and table', () => {
  const t = spawnSync('node', [script, 'tail', '--k', '3', '--mu', '0.15'], { encoding: 'utf8' });
  assert.equal(t.status, 0); close(Number(t.stdout), 0.000502862);
  const tb = spawnSync('node', [script, 'table', '--lambda-per-hour', '2', '--n', '3,30'], { encoding: 'utf8' });
  assert.equal(tb.status, 0); assert.match(tb.stdout, /\| 3 \| 0\.150 \| 2 \| 3 \|/); assert.match(tb.stdout, /\| 30 \| 1\.500 \| 5 \| 7 \|/);
  assert.equal(spawnSync('node', [script, 'bogus'], { encoding: 'utf8' }).status, 2);
});
