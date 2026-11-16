// The repository map names only real paths (ADR 0047). The map is the root README.md and .kiro/steering/structure.md.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TOP = '(?:android|web|core|tools|powers|docs|\\.kiro|\\.github)';

for (const file of ['README.md', '.kiro/steering/structure.md']) {
  const doc = readFileSync(path.join(root, file), 'utf8').split('\n').filter((l) => !l.startsWith('Paths before 2026-11-24')).join('\n'); // that line lists the old names on purpose
  test(`${file}: every backticked path exists`, () => {
    const paths = [...doc.matchAll(new RegExp('`(' + TOP + '/[^`\\s<*]+)`', 'g'))].map((m) => m[1]);
    assert.ok(paths.length > 0, 'the map names paths');
    assert.deepEqual(paths.filter((p) => !existsSync(path.join(root, p))), []);
  });
}

test('structure.md: every folder in the layout block exists', () => {
  const doc = readFileSync(path.join(root, '.kiro/steering/structure.md'), 'utf8');
  const block = doc.slice(doc.indexOf('```') + 3, doc.indexOf('```', doc.indexOf('```') + 3));
  const dirs = block.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  assert.ok(dirs.length > 10);
  assert.deepEqual(dirs.filter((d) => !existsSync(path.join(root, d))), []);
});

test('the old top-level folders are gone', () => {
  const left = execFileSync('git', ['ls-files', 'apps', 'workers', 'packages', 'ARCHITECTURE.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(left, '');
});
