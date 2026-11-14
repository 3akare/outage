import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkReport, SECTIONS } from '../check-report.mjs';
import { planBugfix, parseSignature, slugify, CHECKS } from '../new-bugfix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, '..');

const GOOD = `# Field report 2026-11-21
Gate status (milestone 1): not met (armed ratio 0.62 on D1)
Kill criterion: not triggered
## Devices
| Alias | Maker | Android | Mode | Charging h | Armed ratio |
|---|---|---|---|---|---|
| D1 | tecno | 13 | normal | 9.5 | 0.62 |
| D2 | pixel | 14 | normal | 8.0 | 0.97 |
## Gates
| Check | Value | Threshold | Status |
|---|---|---|---|
| armed ratio | 0.97 | 0.9 | pass |
## Metrics by class
n/a
## Outages
none
## False alarms and misses
none
## New failures
- ARMED_LOW:tecno:13:normal
## Fixture candidates
none
## Parameters in use
W = 90 s
`;

test('checkReport: accepts a clean report', () => assert.deepEqual(checkReport(GOOD), []));

test('checkReport: required sections, order, and header lines', () => {
  assert.match(checkReport(GOOD.replace('## Outages\nnone\n', '')).join('\n'), /missing section "## Outages"/);
  assert.match(checkReport(GOOD.replace(/Gate status.*\n/, '')).join('\n'), /Gate status/);
  assert.match(checkReport(GOOD.replace(/Kill criterion.*\n/, '')).join('\n'), /Kill criterion/);
  assert.match(checkReport(GOOD.replace('# Field report 2026-11-21', '# Report')).join('\n'), /first line/);
  const swapped = GOOD.replace('## Devices', '## TMP').replace('## Gates', '## Devices').replace('## TMP', '## Gates');
  assert.match(checkReport(swapped).join('\n'), /out of order/);
  assert.equal(SECTIONS.length, 8);
});

test('checkReport: blocks identifiers, cells, coordinates, tokens and phone numbers', () => {
  const id = 'abcdefghijklmnopqrstuvwxyz'; // 26 chars
  assert.match(checkReport(GOOD + `\ninstall ${id}\n`).join('\n'), /install ID/);
  assert.match(checkReport(GOOD + '\ncell 88a5ea0b8dfffff\n').join('\n'), /H3 cell/);
  assert.match(checkReport(GOOD + '\nat 6.5095, 3.3711\n').join('\n'), /coordinate pair/);
  assert.match(checkReport(GOOD + '\nExponentPushToken[abcdef]\n').join('\n'), /push token/);
  assert.match(checkReport(GOOD + '\ncall +234 801 234 5678\n').join('\n'), /phone number/);
  assert.match(checkReport(GOOD + '\ninstall_id: x\n').join('\n'), /install id field/);
});

test('checkReport: devices must be aliases', () => {
  assert.match(checkReport(GOOD.replace('| D1 |', '| Tecno-Spark |')).join('\n'), /not an alias/);
});

test('parseSignature: accepts the documented format and rejects the rest', () => {
  assert.deepEqual(parseSignature('ARMED_LOW:tecno:13:normal'), { check: 'ARMED_LOW', maker: 'tecno', android: '13', mode: 'normal' });
  assert.ok(parseSignature('ARMED_LOW:tecno:13').error);
  assert.ok(parseSignature('NOPE:tecno:13:normal').error);
  assert.ok(parseSignature('ARMED_LOW:nokia:13:normal').error);
  assert.ok(parseSignature('ARMED_LOW:tecno:13:wrong').error);
  assert.equal(slugify('ARMED_LOW:tecno:13:normal'), 'armed-low-tecno-13-normal');
  assert.ok(Object.keys(CHECKS).length === 9);
});

test('planBugfix: a new signature creates three documents in the Kiro Bugfix Spec form', () => {
  const p = planBugfix({ signature: 'ARMED_LOW:tecno:13:normal', date: '2026-11-21', evidence: 'armed ratio 0.62 over 3 device-days' });
  assert.equal(p.action, 'created');
  assert.equal(p.spec, '.kiro/specs/bugfix-20261121-armed-low-tecno-13-normal');
  assert.deepEqual(Object.keys(p.files).sort(), ['bugfix.md', 'design.md', 'tasks.md']);
  const b = p.files['bugfix.md'];
  assert.match(b, /## Current Behavior \(Defect\)\n\n1\. WHEN a tecno phone on Android 13 charges in normal mode for at least one hour THEN the system arms the sensor for less than 90%/);
  assert.match(b, /## Expected Behavior \(Correct\)\n\n1\. WHEN .* THEN the system SHALL keep the sensor armed/);
  assert.match(b, /## Unchanged Behavior \(Regression Prevention\)[\s\S]*SHALL CONTINUE TO/);
  assert.match(b, /armed ratio 0\.62 over 3 device-days/);
  assert.match(b, /No code has been changed/);
  assert.equal(p.failures.failures['ARMED_LOW:tecno:13:normal'].count, 1);
});

test('planBugfix: a known signature never creates a second spec (F6)', () => {
  const first = planBugfix({ signature: 'DELAY_SLOW:xiaomi:12:normal', date: '2026-11-21' });
  const again = planBugfix({ signature: 'DELAY_SLOW:xiaomi:12:normal', date: '2026-11-22', failures: first.failures });
  assert.equal(again.action, 'updated'); assert.deepEqual(again.files, {});
  assert.equal(again.failures.failures['DELAY_SLOW:xiaomi:12:normal'].count, 2);
  assert.equal(again.failures.failures['DELAY_SLOW:xiaomi:12:normal'].lastSeen, '2026-11-22');
  const same = planBugfix({ signature: 'DELAY_SLOW:xiaomi:12:normal', date: '2026-11-22', failures: again.failures });
  assert.equal(same.failures.failures['DELAY_SLOW:xiaomi:12:normal'].count, 2); // same day is idempotent
});

test('planBugfix: refuses bad input and folder collisions; every check produces a full bugfix.md', () => {
  assert.ok(planBugfix({ signature: 'bad', date: '2026-11-21' }).error);
  assert.ok(planBugfix({ signature: 'MISS:pixel:14:normal', date: '21-11-2026' }).error);
  assert.match(planBugfix({ signature: 'MISS:pixel:14:normal', date: '2026-11-21', existingDirs: ['bugfix-20261121-miss-pixel-14-normal'] }).error, /already exists/);
  for (const check of Object.keys(CHECKS)) {
    const p = planBugfix({ signature: `${check}:other:14:station`, date: '2026-11-21' });
    assert.equal(p.action, 'created', check);
    const b = p.files['bugfix.md'];
    for (const h of ['Current Behavior (Defect)', 'Expected Behavior (Correct)', 'Unchanged Behavior (Regression Prevention)']) assert.ok(b.includes(h), `${check} ${h}`);
    assert.match(b, /THEN the system SHALL CONTINUE TO|SHALL CONTINUE TO/);
  }
  assert.match(planBugfix({ signature: 'ARMED_CRITICAL:tecno:13:normal', date: '2026-11-21' }).files['bugfix.md'], /Kill criterion/);
});

test('CLI: writes the spec and failures.json, is idempotent, and --dry-run writes nothing', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'bugfix-'));
  const run = (...a) => spawnSync('node', [path.join(scripts, 'new-bugfix.mjs'), '--repo', repo, ...a], { encoding: 'utf8' });
  const dry = run('--signature', 'WRITE_FAIL:samsung:14:normal', '--date', '2026-11-21', '--dry-run');
  assert.equal(dry.status, 0); assert.equal(existsSync(path.join(repo, 'docs', 'field', 'failures.json')), false);
  const a = run('--signature', 'WRITE_FAIL:samsung:14:normal', '--date', '2026-11-21');
  assert.equal(JSON.parse(a.stdout).action, 'created');
  assert.ok(existsSync(path.join(repo, '.kiro/specs/bugfix-20261121-write-fail-samsung-14-normal/bugfix.md')));
  const b = run('--signature', 'WRITE_FAIL:samsung:14:normal', '--date', '2026-11-22');
  assert.equal(JSON.parse(b.stdout).action, 'updated');
  const idx = JSON.parse(readFileSync(path.join(repo, 'docs/field/failures.json'), 'utf8'));
  assert.equal(idx.failures['WRITE_FAIL:samsung:14:normal'].count, 2);
  assert.equal(run('--signature', 'oops', '--date', '2026-11-21').status, 1);
});

test('CLI check-report: exit codes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rep-'));
  const f = path.join(dir, 'r.md'); writeFileSync(f, GOOD);
  assert.equal(spawnSync('node', [path.join(scripts, 'check-report.mjs'), f], { encoding: 'utf8' }).status, 0);
  writeFileSync(f, GOOD + '\n88a5ea0b8dfffff\n');
  assert.equal(spawnSync('node', [path.join(scripts, 'check-report.mjs'), f], { encoding: 'utf8' }).status, 1);
});
