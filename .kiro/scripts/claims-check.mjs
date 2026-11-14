#!/usr/bin/env node
// Claims register check for public text (brief Part J: "Every factual claim in the Devpost text checked by the human").
// Public text marks each factual claim with [C12]; docs/pitch/claims.md holds one row per claim:
//   | C12 | the claim | where it is used | source (path or URL) | UNCHECKED |
// Only the human changes UNCHECKED to CHECKED. This script never does.
// Usage: node .kiro/scripts/claims-check.mjs [--root .] [--require-checked] [--json]
//   default            exit 1 for structural problems (marker without a row, empty source, bad status)
//   --require-checked  also exit 1 while any claim that is used is not CHECKED (run before submission)
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUSES = ['UNCHECKED', 'CHECKED', 'REMOVED'];
const TEXT_FILES = ['README.md', 'docs/pitch/devpost.md', 'docs/pitch/video-script.md'];

export function parseRegister(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7 || !/^C\d+$/.test(cells[1])) continue;
    rows.push({ id: cells[1], claim: cells[2], where: cells[3], source: cells[4], status: cells[5] });
  }
  return rows;
}

export function markersIn(text) {
  const stripped = text.replace(/```[\s\S]*?```/g, ''); // code blocks may show the syntax
  return [...stripped.matchAll(/\[(C\d+)\]/g)].map((m) => m[1]);
}

export function checkClaims({ register, texts }) {
  const problems = []; const warnings = [];
  const rows = parseRegister(register || '');
  const byId = new Map();
  for (const r of rows) { if (byId.has(r.id)) problems.push(`${r.id} appears twice in the register`); byId.set(r.id, r); }
  const used = new Map();
  for (const [file, text] of Object.entries(texts)) for (const id of markersIn(text)) { if (!used.has(id)) used.set(id, []); used.get(id).push(file); }
  for (const [id, files] of used) if (!byId.has(id)) problems.push(`${id} is used in ${[...new Set(files)].join(', ')} but has no row in docs/pitch/claims.md`);
  for (const r of rows) {
    if (!STATUSES.includes(r.status)) problems.push(`${r.id}: status "${r.status}" must be one of ${STATUSES.join(', ')}`);
    if (!r.source || /^(-|n\/a|none|tbd|\?)$/i.test(r.source)) problems.push(`${r.id}: a claim needs a source (a repository path or a URL)`);
    else if (!/(https?:\/\/|^[\w.\-/]+\.[a-z]+|^`?[\w.\-/]+\/)/.test(r.source.replace(/`/g, ''))) warnings.push(`${r.id}: source "${r.source}" does not look like a path or a URL`);
    if (r.status !== 'REMOVED' && !used.has(r.id)) warnings.push(`${r.id} is in the register but no public text uses it`);
    if (r.status === 'REMOVED' && used.has(r.id)) problems.push(`${r.id} is marked REMOVED but is still used in ${[...new Set(used.get(r.id))].join(', ')}`);
  }
  const unchecked = rows.filter((r) => r.status === 'UNCHECKED' && used.has(r.id)).map((r) => r.id);
  return { problems, warnings, claims: rows.length, used: used.size, unchecked };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const root = path.resolve(get('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), 'utf8') : null);
  const texts = Object.fromEntries(TEXT_FILES.map((f) => [f, read(f)]).filter(([, t]) => t !== null));
  const register = read('docs/pitch/claims.md');
  if (!Object.keys(texts).length && register === null) { console.log('claims-check: no public text yet (README.md, docs/pitch/*). Nothing to check.'); return; }
  const r = checkClaims({ register: register || '', texts });
  if (a.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`claims: ${r.claims} in the register, ${r.used} used in text, ${r.unchecked.length} used and still UNCHECKED`);
    for (const p of r.problems) console.log('PROBLEM  ' + p);
    for (const w of r.warnings) console.log('warning  ' + w);
    if (r.unchecked.length) console.log('UNCHECKED: ' + r.unchecked.join(', ') + '  (the human checks each against its source)');
  }
  if (r.problems.length || (a.includes('--require-checked') && r.unchecked.length)) process.exit(1);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
