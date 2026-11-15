// ARCHITECTURE.md accounts for every tracked file, and names no path that does not exist.
// A backticked path in a table row's first cell is an entry. An entry ending in "/" covers every file under it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const doc = readFileSync(path.join(root, 'ARCHITECTURE.md'), 'utf8');
const entries = [...doc.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
const indexStart = doc.indexOf('## File index');
const indexed = [...doc.slice(indexStart).matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

test('every tracked file is listed in the ARCHITECTURE.md file index', () => {
  const dirs = indexed.filter((e) => e.endsWith('/'));
  const files = new Set(indexed.filter((e) => !e.endsWith('/')));
  const missing = tracked.filter((f) => !files.has(f) && !dirs.some((d) => f.startsWith(d)));
  assert.deepEqual(missing, [], 'add these files to ARCHITECTURE.md');
});

test('every path the file index names exists in git', () => {
  const set = new Set(tracked);
  const gone = indexed.filter((e) => (e.endsWith('/') ? !tracked.some((f) => f.startsWith(e)) : !set.has(e)));
  assert.deepEqual(gone, [], 'remove or fix these ARCHITECTURE.md entries');
});

test('the codemap tables name only real paths', () => {
  const codemap = entries.slice(0, entries.length - indexed.length).flatMap((e) => e.split(/,\s*/));
  const paths = [...doc.slice(0, indexStart).matchAll(/`((?:workers|packages|apps|tools|\.github|\.kiro)\/[^`\s]+)`/g)].map((m) => m[1]);
  const bad = [...codemap, ...paths].filter((p) => /^(workers|packages|apps|tools|\.github|\.kiro)\//.test(p) && !p.includes('...') && !existsSync(path.join(root, p)));
  assert.deepEqual(bad, []);
});

test('no file is listed twice', () => {
  const seen = new Set();
  const dup = indexed.filter((e) => (seen.has(e) ? true : (seen.add(e), false)));
  assert.deepEqual(dup, []);
});
