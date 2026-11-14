import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { lint, parseTasks, parseDeps } from '../spec-lint.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

test('the real repository has no spec-lint errors', () => {
  const r = lint(root);
  assert.deepEqual(r.findings.filter((f) => f.severity === 'error'), []);
  assert.ok(r.specs.length >= 13);
});

test('parseTasks reads numbers, waves, done flag and dependencies', () => {
  const t = parseTasks('## Wave 1\n- [x] 1. First\n## Wave 2\n- [ ] 2. Second\n  - Depends on: 1\n');
  assert.deepEqual(t.map((x) => [x.n, x.done, x.wave, x.dep]), [[1, true, 1, ''], [2, false, 2, '1']]);
});

test('parseDeps separates local and foreign dependencies', () => {
  const d = parseDeps('1, 2, `event-ingest` 3', ['event-ingest']);
  assert.deepEqual(d.local, [1, 2]);
  assert.deepEqual(d.foreign, [{ spec: 'event-ingest', n: 3 }]);
});

test('a spec with a single empty file is reported as an error', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-'));
  try {
    mkdirSync(path.join(dir, '.kiro/specs/demo'), { recursive: true });
    writeFileSync(path.join(dir, '.kiro/specs/demo/requirements.md'), '# x\n');
    const r = lint(dir);
    assert.ok(r.errors > 0);
    assert.ok(r.findings.some((f) => f.file.includes('demo')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a design with no data model section is an error (regression)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-'));
  try {
    const d = path.join(dir, '.kiro/specs/demo');
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'requirements.md'), '# R\nThe system SHALL work.\n');
    writeFileSync(path.join(d, 'design.md'), '# D\n## 1. Overview\n');
    writeFileSync(path.join(d, 'tasks.md'), '## Wave 1\n- [ ] 1. Do\n');
    const r = lint(dir);
    assert.ok(r.findings.some((f) => /no data model/.test(f.message)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
