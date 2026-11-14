#!/usr/bin/env node
// Cross-document consistency check for the whole repository: specs, tasks, ADRs, steering, traceability.
// It checks what can be checked mechanically. It does not judge whether a requirement is good.
//   specs      three files each; requirements has SHALL statements and an analysis; design has a sequence diagram, a data model,
//              error handling and a testing strategy; tasks have unique numbers and a dependency graph
//   tasks      "Depends on" names tasks that exist (in this spec or another); no task depends on itself or a later wave in its own spec
//   properties every property ID in a design test table has a row in docs/traceability.md under the same spec
//   traceab.   every task number in docs/traceability.md exists in that spec
//   ADRs       numbered 0001..N without gaps, each with Status, Context, Decision, Alternatives, Consequences; every "ADR 0007" mention resolves
//   steering   front matter is valid for its inclusion mode; #[[file:...]] targets exist
//   index      .kiro/specs/README.md lists every spec
// Usage: node .kiro/scripts/spec-lint.mjs [--root .] [--json]      Exit 1 on any ERROR.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
const ls = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []);

export function parseTasks(text) {
  const tasks = [];
  const lines = text.split('\n');
  let wave = 0;
  for (let i = 0; i < lines.length; i++) {
    const w = /^## Wave (\d+)/.exec(lines[i]); if (w) wave = Number(w[1]);
    const m = /^- \[( |x)\] (\d+)\. (.+)$/.exec(lines[i]);
    if (!m) continue;
    let dep = '';
    for (let j = i + 1; j < lines.length && !/^- \[/.test(lines[j]) && !/^## /.test(lines[j]); j++) { const d = /^\s+- Depends on:\s*(.+)$/.exec(lines[j]); if (d) dep = d[1]; }
    tasks.push({ n: Number(m[2]), done: m[1] === 'x', title: m[3], wave, dep });
  }
  return tasks;
}

/** "1, 2, `event-ingest` 3, `sensor-android` task 9" -> { local: [1,2], foreign: [{spec, n}] } */
export function parseDeps(dep, specNames) {
  const local = [], foreign = [];
  for (const part of dep.split(/,(?=(?:[^`]*`[^`]*`)*[^`]*$)/).map((p) => p.trim()).filter(Boolean)) {
    const f = new RegExp('^`?(' + specNames.join('|') + ')`?\\s+(?:tasks?\\s+)?(\\d+)').exec(part);
    if (f) foreign.push({ spec: f[1], n: Number(f[2]) });
    else { const l = /^(\d+)$/.exec(part); if (l) local.push(Number(l[1])); }
  }
  return { local, foreign };
}

export function lint(root) {
  const out = [];
  const err = (rule, file, message) => out.push({ severity: 'error', rule, file, message });
  const warn = (rule, file, message) => out.push({ severity: 'warn', rule, file, message });
  const specsDir = path.join(root, '.kiro', 'specs');
  const specs = ls(specsDir).filter((e) => e.isDirectory() && !e.name.startsWith('bugfix-')).map((e) => e.name);
  const info = {};

  for (const s of specs) {
    const d = path.join(specsDir, s), rel = (f) => `.kiro/specs/${s}/${f}`;
    for (const f of ['requirements.md', 'design.md', 'tasks.md']) if (!existsSync(path.join(d, f))) err('specs', rel(f), 'missing');
    const req = read(path.join(d, 'requirements.md')), des = read(path.join(d, 'design.md')), tsk = read(path.join(d, 'tasks.md'));

    if (!/\bSHALL\b/.test(req)) err('specs', rel('requirements.md'), 'no EARS "SHALL" statements');
    if ((req.match(/^### R\d+/gm) || []).length < 3 && s !== 'feasibility-probe') err('specs', rel('requirements.md'), 'fewer than 3 requirements');
    if (!/Analysis of requirements|Gate \(from the brief/.test(req)) err('specs', rel('requirements.md'), 'no gap analysis section');
    if (!/^Status:/m.test(req)) warn('specs', rel('requirements.md'), 'no Status line');

    if (!/sequenceDiagram/.test(des)) err('specs', rel('design.md'), 'no Mermaid sequence diagram');
    if (!/erDiagram|## \d+\. Data model|## \d+\. Log schema|## \d+\. Components|## \d+\. Parameters/i.test(des)) err('specs', rel('design.md'), 'no data model section');
    if (!/Error handling/i.test(des)) err('specs', rel('design.md'), 'no error handling section');
    if (!/Testing strategy/i.test(des)) err('specs', rel('design.md'), 'no testing strategy section');

    const tasks = parseTasks(tsk);
    if (!tasks.length) err('tasks', rel('tasks.md'), 'no tasks found');
    const nums = tasks.map((t) => t.n);
    if (new Set(nums).size !== nums.length) err('tasks', rel('tasks.md'), 'duplicate task numbers');
    if (!/```mermaid[\s\S]*graph/.test(tsk)) warn('tasks', rel('tasks.md'), 'no dependency graph');
    info[s] = { tasks, max: Math.max(0, ...nums), waveOf: new Map(tasks.map((t) => [t.n, t.wave])) };

    // property IDs in the design test table
    // only tables whose header is "| ID | Property | ..." define properties (measurement tables such as M1..M14 do not)
    const ids = []; let inProps = false;
    for (const line of des.split('\n')) {
      if (/^\| ID \| Property\b/.test(line)) { inProps = true; continue; }
      if (inProps && /^\|/.test(line)) { const m = /^\| ([A-Z]{1,2}\d{1,2}) \|/.exec(line); if (m) ids.push(m[1]); }
      else if (inProps && !/^\|/.test(line)) inProps = false;
    }
    info[s].ids = [...new Set(ids)];
  }

  // dependencies
  for (const s of specs) {
    for (const t of info[s].tasks) {
      if (!t.dep) { if (t.wave > 1 && !/^Update|^Delete|^Scenario|^Device|^Field/i.test(t.title)) warn('tasks', `.kiro/specs/${s}/tasks.md`, `task ${t.n} is in wave ${t.wave} but lists no dependency`); continue; }
      const { local, foreign } = parseDeps(t.dep, specs);
      for (const n of local) {
        if (n === t.n) err('tasks', `.kiro/specs/${s}/tasks.md`, `task ${t.n} depends on itself`);
        else if (!info[s].waveOf.has(n)) err('tasks', `.kiro/specs/${s}/tasks.md`, `task ${t.n} depends on task ${n}, which does not exist`);
        else if (info[s].waveOf.get(n) > t.wave) err('tasks', `.kiro/specs/${s}/tasks.md`, `task ${t.n} (wave ${t.wave}) depends on task ${n} in a later wave ${info[s].waveOf.get(n)}`);
      }
      for (const f of foreign) {
        if (f.spec === s) continue;
        if (!info[f.spec].waveOf.has(f.n)) err('tasks', `.kiro/specs/${s}/tasks.md`, `task ${t.n} depends on ${f.spec} task ${f.n}, which does not exist`);
      }
    }
  }

  // traceability
  const trace = read(path.join(root, 'docs', 'traceability.md'));
  const sections = {};
  let cur = null;
  for (const line of trace.split('\n')) { const h = /^## (.+)$/.exec(line); if (h) { cur = h[1].trim(); sections[cur] = []; } else if (cur) sections[cur].push(line); }
  for (const s of specs) {
    const sec = (sections[s] || []).join('\n');
    if (!sec) { err('traceability', 'docs/traceability.md', `no section for spec ${s}`); continue; }
    for (const id of info[s].ids) if (!new RegExp(`\\|[^|\\n]*\\b${id}\\b`).test(sec)) err('traceability', 'docs/traceability.md', `${s}: property ${id} is in the design table but has no row`);
    for (const row of sec.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l))) {
      const cells = row.split('|').map((c) => c.trim());
      const taskCell = cells[cells.length - 3] ?? ''; // ... | Task | Status |
      for (const m of taskCell.matchAll(/\b(\d+)\b/g)) if (/^\d+(,\s*\d+)*$/.test(taskCell) && Number(m[1]) > info[s].max) err('traceability', 'docs/traceability.md', `${s}: row "${cells[1]}" cites task ${m[1]} but the spec has ${info[s].max} tasks`);
    }
  }

  // ADRs
  const adrFiles = ls(path.join(root, 'docs', 'adr')).filter((e) => /^\d{4}-.+\.md$/.test(e.name)).map((e) => e.name).sort();
  const adrNums = adrFiles.map((f) => Number(f.slice(0, 4)));
  adrNums.forEach((n, i) => { if (n !== i + 1) err('adr', 'docs/adr', `ADR numbers are not contiguous: expected ${String(i + 1).padStart(4, '0')}, found ${String(n).padStart(4, '0')}`); });
  for (const f of adrFiles) {
    const t = read(path.join(root, 'docs', 'adr', f));
    for (const h of ['Status', 'Context', 'Decision', 'Alternatives', 'Consequences']) if (!new RegExp(`^(## ${h}|${h}:)`, 'm').test(t) && !new RegExp(`## ${h}`).test(t)) err('adr', `docs/adr/${f}`, `missing ${h}`);
  }
  const mdFiles = [];
  const walk = (d) => { for (const e of ls(d)) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.git'].includes(e.name)) walk(p); } else if (e.name.endsWith('.md')) mdFiles.push(p); } };
  walk(path.join(root, '.kiro')); walk(path.join(root, 'docs'));
  const lastAdr = Math.max(0, ...adrNums);
  for (const f of mdFiles) for (const m of read(f).matchAll(/\bADR (\d{4})\b/g)) {
    const n = Number(m[1]);
    if (adrNums.includes(n)) continue;
    // a number above the last ADR is a planned ADR (for example the feasibility gate); a missing lower number is a broken link
    if (n > lastAdr) warn('adr', path.relative(root, f), `mentions ADR ${m[1]}, which is planned and does not exist yet`);
    else err('adr', path.relative(root, f), `mentions ADR ${m[1]}, which does not exist`);
  }

  // steering
  for (const e of ls(path.join(root, '.kiro', 'steering')).filter((x) => x.name.endsWith('.md'))) {
    const t = read(path.join(root, '.kiro', 'steering', e.name)); const rel = `.kiro/steering/${e.name}`;
    const fm = /^---\n([\s\S]*?)\n---/.exec(t); if (!fm) { err('steering', rel, 'no front matter'); continue; }
    const mode = (/^inclusion:\s*(\w+)/m.exec(fm[1]) || [])[1];
    if (!['always', 'fileMatch', 'auto', 'manual'].includes(mode)) err('steering', rel, `inclusion "${mode}" is not one of always, fileMatch, auto, manual`);
    if (mode === 'fileMatch' && !/^fileMatchPattern:/m.test(fm[1])) err('steering', rel, 'fileMatch needs fileMatchPattern');
    if (mode === 'auto' && !(/^name:/m.test(fm[1]) && /^description:/m.test(fm[1]))) err('steering', rel, 'auto needs name and description');
    for (const m of t.matchAll(/#\[\[file:([^\]]+)\]\]/g)) if (!existsSync(path.join(root, m[1]))) err('steering', rel, `#[[file:${m[1]}]] does not exist`);
  }

  // index
  const idx = read(path.join(specsDir, 'README.md'));
  for (const s of specs) if (!idx.includes('`' + s + '`')) err('index', '.kiro/specs/README.md', `does not list spec ${s}`);
  return { findings: out, specs, errors: out.filter((o) => o.severity === 'error').length, warnings: out.filter((o) => o.severity === 'warn').length };
}

function main() {
  const a = process.argv.slice(2);
  const root = path.resolve(a.includes('--root') ? a[a.indexOf('--root') + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const r = lint(root);
  if (a.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else { for (const f of r.findings) console.log(`${f.severity.toUpperCase().padEnd(5)} ${f.rule.padEnd(12)} ${f.file}: ${f.message}`); console.log(`\n${r.specs.length} specs, ${r.errors} error(s), ${r.warnings} warning(s)`); }
  process.exit(r.errors ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
