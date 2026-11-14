import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateGuide, REQUIRED } from '../validate-guide.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const guideFile = path.resolve(here, '../../references/oem-guide.json');
const real = () => JSON.parse(readFileSync(guideFile, 'utf8'));
const errorsOf = (g, o) => validateGuide(g, o).errors;
const maker = (g, id) => g.makers.find((m) => m.id === id);

test('the real guide file is valid and all six makers plus "other" are present', () => {
  const g = real();
  assert.deepEqual(errorsOf(g), []);
  assert.deepEqual(g.makers.map((m) => m.id).sort(), [...REQUIRED].sort());
});

test('every entry is honestly unverified until a device check is recorded (O5)', () => {
  const { status } = validateGuide(real());
  for (const id of REQUIRED) assert.equal(status[id], 'unverified', id);
  assert.ok(errorsOf(real(), { requireVerified: true }).length >= 6);
});

test('a passing device check marks the maker verified and satisfies --require-verified', () => {
  const g = real();
  for (const m of g.makers) m.verified = [{ device: 'Test phone', android: '14', date: '2026-11-20', result: 'pass' }];
  const { errors, status } = validateGuide(g, { requireVerified: true });
  assert.deepEqual(errors, []);
  assert.equal(status.tecno, 'verified');
});

test('a failed device check is "tried", not verified', () => {
  const g = real();
  maker(g, 'itel').verified = [{ device: 'itel A70', android: '13', date: '2026-11-20', result: 'fail' }];
  assert.equal(validateGuide(g).status.itel, 'tried');
});

test('missing or unknown makers are rejected', () => {
  const g = real(); g.makers = g.makers.filter((m) => m.id !== 'pixel');
  assert.match(errorsOf(g).join('\n'), /missing maker: pixel/);
  const h = real(); maker(h, 'other').id = 'oppo';
  assert.match(errorsOf(h).join('\n'), /unknown maker id: oppo/);
});

test('matching is table-driven and exclusive: lower-case, no overlap between makers (O4)', () => {
  const g = real(); maker(g, 'itel').match.brand = ['Itel'];
  assert.match(errorsOf(g).join('\n'), /lower-case/);
  const h = real(); maker(h, 'infinix').match.brand = ['tecno'];
  assert.match(errorsOf(h).join('\n'), /overlaps/);
  const i = real(); maker(i, 'other').match.brand = ['oppo'];
  assert.match(errorsOf(i).join('\n'), /"other" is the default/);
});

test('steps: not empty, at most 160 characters, no leading numbers, must name Outage', () => {
  const g = real(); maker(g, 'samsung').steps[0].steps.push('');
  assert.match(errorsOf(g).join('\n'), /is empty/);
  const h = real(); maker(h, 'samsung').steps[0].steps[0] = 'x'.repeat(161);
  assert.match(errorsOf(h).join('\n'), /longer than 160/);
  const i = real(); maker(i, 'samsung').steps[0].steps[0] = '1. Open Settings';
  assert.match(errorsOf(i).join('\n'), /must not start with a number/);
  const j = real(); maker(j, 'xiaomi').steps = [{ title: 'x', steps: ['Open Settings.'] }];
  assert.match(errorsOf(j).join('\n'), /must name the app "Outage"/);
});

test('checklist must include battery_exemption and use snake_case ids', () => {
  const g = real(); maker(g, 'tecno').checklist = maker(g, 'tecno').checklist.filter((c) => c.id !== 'battery_exemption');
  assert.match(errorsOf(g).join('\n'), /battery_exemption/);
  const h = real(); maker(h, 'tecno').checklist[0].id = 'Battery-Exemption';
  assert.match(errorsOf(h).join('\n'), /snake_case/);
});

test('sources must be https URLs and verified entries well formed', () => {
  const g = real(); maker(g, 'pixel').source = 'http://example.com';
  assert.match(errorsOf(g).join('\n'), /source must be an https URL/);
  const h = real(); maker(h, 'pixel').verified = [{ device: 'Pixel 7', android: 'fourteen', date: 'today', result: 'ok' }];
  const e = errorsOf(h).join('\n');
  assert.match(e, /android must be a version/); assert.match(e, /date must be YYYY-MM-DD/); assert.match(e, /result must be pass, partial or fail/);
});

test('CLI exits 0 for the real file and 1 for a broken one', () => {
  const ok = spawnSync('node', [path.join(here, '../validate-guide.mjs')], { encoding: 'utf8' });
  assert.equal(ok.status, 0); assert.match(ok.stdout, /guide is valid/);
  const bad = spawnSync('node', [path.join(here, '../validate-guide.mjs'), path.join(here, 'does-not-exist.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
