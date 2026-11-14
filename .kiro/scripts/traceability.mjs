// property-traceability: fail if any detection property P1..P12 has no test naming it, and regenerate the
// generated block in docs/traceability.md. Runs after a spec task (IDE and CLI) and inside verify-on-stop (Web).
// Usage: node traceability.mjs [--check]   (--check does not write the file)
import { say, readText, ROOT } from './lib.mjs';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const check = process.argv.includes('--check');
const base = path.join(ROOT, 'packages', 'detection');

function tests(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tests(p, acc);
    else if (/\.(test|spec)\.(ts|mjs|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = tests(base);
const TITLE = /\b(?:it|test|describe)(?:\.\w+)*\s*\(\s*(['"`])([^'"`]*)\1|\b(?:test|it)\.prop\s*\(\s*\[[^\]]*\]\s*,\s*\{[^}]*\}\s*\)\s*\(\s*(['"`])([^'"`]*)\3/g;
const found = new Map(); // id -> { file, title }
for (const f of files) {
  const text = readText(path.relative(ROOT, f), '');
  for (const m of text.matchAll(TITLE)) {
    const title = m[2] ?? m[4] ?? '';
    for (const id of title.matchAll(/(?<![A-Za-z0-9])P(1[0-2]|[1-9])(?![0-9])/g)) {
      const key = 'P' + id[1];
      if (!found.has(key)) found.set(key, { file: path.relative(ROOT, f), title: title.slice(0, 70) });
    }
  }
}

const rows = [];
const missing = [];
for (let i = 1; i <= 12; i++) {
  const k = 'P' + i, hit = found.get(k);
  rows.push(`| ${k} | ${hit ? '`' + hit.file + '`' : '-'} | ${hit ? hit.title.replace(/\|/g, '/') : '-'} | ${hit ? 'test written' : files.length ? 'MISSING' : 'no tests yet'} |`);
  if (!hit && files.length) missing.push(k);
}

const block = [
  '<!-- BEGIN GENERATED: detection properties (.kiro/scripts/traceability.mjs) -->',
  '## Detection properties P1 to P12 (generated)',
  '',
  `Scanned ${files.length} test file(s) under packages/detection. A property counts when a test title names its ID.`,
  '',
  '| ID | Test file | Test title | Status |',
  '|---|---|---|---|',
  ...rows,
  '<!-- END GENERATED -->',
].join('\n');

if (!check) {
  const p = path.join(ROOT, 'docs', 'traceability.md');
  let t = readText('docs/traceability.md', '# Traceability\n');
  const re = /<!-- BEGIN GENERATED: detection properties[\s\S]*?<!-- END GENERATED -->/;
  t = re.test(t) ? t.replace(re, block) : t.replace(/\n*$/, '\n\n') + block + '\n';
  writeFileSync(p, t);
}

if (missing.length) {
  say(`property-traceability: MISSING tests naming ${missing.join(', ')}. Every property P1 to P12 needs a fast-check test whose title names its ID (Part G, testing.md).`);
  process.exit(1);
}
say(files.length ? `property-traceability: all P1 to P12 have a named test (${files.length} test files).` : 'property-traceability: no detection tests yet, nothing to check.');
process.exit(0);
