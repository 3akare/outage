import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseRegister, markersIn, checkClaims } from '../claims-check.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'claims-check.mjs');
const REG = `# Claims
| ID | Claim | Where | Source | Status |
|---|---|---|---|---|
| C1 | Ten phones agreed within about a second in 19 of 20 trials | README | .kiro/steering/gridwatch-lessons.md | UNCHECKED |
| C2 | The Worker runs on the free plan | devpost | https://developers.cloudflare.com/workers/platform/limits/ | CHECKED |
`;

test('parseRegister reads rows and ignores the header and separator', () => {
  const rows = parseRegister(REG);
  assert.deepEqual(rows.map((r) => [r.id, r.status]), [['C1', 'UNCHECKED'], ['C2', 'CHECKED']]);
  assert.equal(rows[1].source, 'https://developers.cloudflare.com/workers/platform/limits/');
});

test('markersIn finds [C#] markers and skips code blocks', () => {
  assert.deepEqual(markersIn('a [C1] b [C22] and [not]'), ['C1', 'C22']);
  assert.deepEqual(markersIn('text\n```\nwrite [C9] like this\n```\nmore [C3]'), ['C3']);
});

test('checkClaims: a clean register passes; unchecked used claims are listed', () => {
  const r = checkClaims({ register: REG, texts: { 'README.md': 'x [C1] y [C2]' } });
  assert.deepEqual(r.problems, []); assert.deepEqual(r.unchecked, ['C1']); assert.equal(r.claims, 2);
});

test('checkClaims: a marker without a row, a bad status, a missing source and a duplicate are problems', () => {
  assert.match(checkClaims({ register: REG, texts: { 'README.md': '[C5]' } }).problems.join(), /C5 is used in README.md but has no row/);
  assert.match(checkClaims({ register: REG.replace('UNCHECKED', 'DONE'), texts: {} }).problems.join(), /status "DONE"/);
  assert.match(checkClaims({ register: REG.replace('.kiro/steering/gridwatch-lessons.md', 'none'), texts: {} }).problems.join(), /needs a source/);
  assert.match(checkClaims({ register: REG + '| C1 | again | README | a.md | CHECKED |\n', texts: {} }).problems.join(), /appears twice/);
});

test('checkClaims: unused rows warn, and a REMOVED claim must not stay in the text', () => {
  assert.match(checkClaims({ register: REG, texts: { 'README.md': '[C1]' } }).warnings.join(), /C2 is in the register but no public text uses it/);
  const removed = REG.replace('| CHECKED |', '| REMOVED |');
  assert.match(checkClaims({ register: removed, texts: { 'README.md': '[C2]' } }).problems.join(), /C2 is marked REMOVED but is still used/);
});

test('CLI: nothing to check yet is fine; --require-checked fails while a used claim is UNCHECKED; the script never edits files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claims-'));
  const run = (...a) => spawnSync('node', [script, '--root', root, ...a], { encoding: 'utf8' });
  assert.equal(run().status, 0); assert.match(run().stdout, /no public text yet/);
  mkdirSync(path.join(root, 'docs', 'pitch'), { recursive: true });
  writeFileSync(path.join(root, 'docs', 'pitch', 'claims.md'), REG);
  writeFileSync(path.join(root, 'README.md'), 'Claim [C1] and claim [C2].');
  assert.equal(run().status, 0);
  assert.equal(run('--require-checked').status, 1);
  assert.match(run('--require-checked').stdout, /UNCHECKED: C1/);
  writeFileSync(path.join(root, 'docs', 'pitch', 'claims.md'), REG.replace('UNCHECKED', 'CHECKED'));
  assert.equal(run('--require-checked').status, 0);
  assert.equal(readFileSyncSafe(path.join(root, 'docs', 'pitch', 'claims.md')).includes('CHECKED'), true);
});
import { readFileSync } from 'node:fs';
function readFileSyncSafe(f) { return readFileSync(f, 'utf8'); }
