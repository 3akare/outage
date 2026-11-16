// Tests for detection-audit.mjs and kiro-story.mjs (helpers of the detection-auditor and pitch-writer agents).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditParams, auditSource, auditTests, audit, num, APPROVED } from '../detection-audit.mjs';
import { countRepo, parseLog, render, applyBlock } from '../kiro-story.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, '..');

// ---------- detection-audit ----------
const GOOD_PARAMS = `export const params = {
  windowMs: 90_000,
  possible: { minK: 2, maxP: 0.05 },
  confirmed: { minK: 3, maxP: 0.001 },
  minArmedForConfirm: 3,
  weight: { cut: 0.5, u0: 8, lookbackMs: 86_400_000 },
  baseline: { priorLambdaPerSec: 1/1800, priorExposureSec: 36_000, dailyDecay: 0.9 },
  restore: { baseMs: 90_000, priorP95Ms: 60_000, minSamples: 20, minQuorum: 2 },
  unknownEndMs: 43_200_000,
  pushMaxAgeMs: 600_000,
  staleArmedMs: 604_800_000,
  horizonMs: 648_000_000,
};`;

test('num: evaluates the numeric forms used in params.ts and nothing else', () => {
  assert.equal(num('90_000'), 90000); assert.equal(num('1/1800'), 1 / 1800); assert.equal(num('0.001'), 0.001);
  assert.equal(num('24 * 60 * 60 * 1000'), 86400000);
  assert.ok(Number.isNaN(num('process.exit(1)'))); assert.ok(Number.isNaN(num('2 ** 8')));
});

test('auditParams: the approved values pass; any changed value is an error that names ADR 0005', () => {
  assert.deepEqual(auditParams(GOOD_PARAMS), []);
  const changed = auditParams(GOOD_PARAMS.replace('windowMs: 90_000', 'windowMs: 60_000'));
  assert.equal(changed.length, 1); assert.match(changed[0].message, /windowMs is 60000 but the approved value is 90000 \(ADR 0005\)/);
  assert.match(auditParams(GOOD_PARAMS.replace('maxP: 0.001', 'maxP: 0.01'))[0].message, /maxP/);
  assert.match(auditParams(GOOD_PARAMS.replace('cut: 0.5', 'cut: 0.4'))[0].message, /cut/);
  assert.match(auditParams(GOOD_PARAMS.replace('u0: 8,', ''))[0].message, /u0 not found/);
  assert.equal(auditParams(GOOD_PARAMS.replace('1/1800', '1/3600')).length, 1);
  assert.ok(Object.keys(APPROVED).length >= 18);
});

test('auditParams: a value hidden in a comment is ignored', () => {
  assert.equal(auditParams('// windowMs: 90_000\n' + GOOD_PARAMS.replace('windowMs: 90_000,', '')).length, 1);
});

test('auditSource: flags every impure API, ignores comments and the allow marker', () => {
  const bad = ['Date.now()', 'new Date()', 'Math.random()', 'fetch("x")', 'process.env.X', 'setTimeout(f, 1)', 'require("fs")'];
  for (const b of bad) assert.equal(auditSource('core/detection/src/a.ts', `const x = ${b};`).length, 1, b);
  assert.equal(auditSource('a.ts', "import fs from 'node:fs';").length, 1);
  assert.equal(auditSource('a.ts', '// Date.now() is not used here\nconst x = 1;').length, 0);
  assert.equal(auditSource('a.ts', '/* Math.random() */ const x = 1;').length, 0);
  assert.equal(auditSource('a.ts', 'const t = nowMs; // clock is an input').length, 0);
  assert.equal(auditSource('a.ts', 'const x = Date.now(); // audit:allow reviewed').length, 0);
});

const ALL12 = Array.from({ length: 12 }, (_, i) => `it('P${i + 1}_property', () => { fc.assert(fc.property(fc.nat(), () => true), { numRuns: Number(process.env.FC_NUM_RUNS ?? 100) }); });`).join('\n');
const GENS = '// jitter generator restart late delay duplicate noisy weight baseline human\n';

test('auditTests: complete suite is clean; missing property, skipped test, no fast-check are errors', () => {
  assert.deepEqual(auditTests([{ rel: 'a.test.ts', text: GENS + ALL12 }]).out, []);
  const noP7 = ALL12.split('\n').filter((l) => !l.includes("'P7_")).join('\n');
  assert.match(auditTests([{ rel: 'a.test.ts', text: GENS + noP7 }]).out.map((f) => f.message).join(), /property P7 has no test/);
  assert.match(auditTests([{ rel: 'a.test.ts', text: GENS + ALL12 + "\nit.skip('P1 x', () => {});" }]).out.map((f) => f.message).join(), /skipped or todo/);
  assert.match(auditTests([{ rel: 'a.test.ts', text: GENS + ALL12.replace(/fc\.assert/g, 'assertIt') }]).out.map((f) => f.message).join(), /no fc\.assert/);
  assert.match(auditTests([]).out[0].message, /no test files/);
  const warn = auditTests([{ rel: 'a.test.ts', text: ALL12.replace(/process\.env\.FC_NUM_RUNS/g, '100') }]).out.filter((f) => f.severity === 'warn').map((f) => f.message).join('\n');
  assert.match(warn, /FC_NUM_RUNS/); assert.match(warn, /generator/);
});

test('auditTests: P1 does not match P10..P12 and IDs are read only from test titles', () => {
  const only10 = auditTests([{ rel: 'a.test.ts', text: "it('P10_noisy', () => { fc.assert(x); });" }]);
  assert.ok(only10.ids.has('P10')); assert.ok(!only10.ids.has('P1'));
  const notTitle = auditTests([{ rel: 'a.test.ts', text: "// P3 covered elsewhere\nconst P4 = 1;" }]);
  assert.equal(notTitle.ids.size, 0);
});

test('audit(): not scaffolded is info; a full tree is clean; a broken tree reports each problem', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-'));
  const empty = audit(root); assert.equal(empty.summary.errors, 0); assert.equal(empty.findings[0].severity, 'info');

  const base = path.join(root, 'core', 'detection');
  mkdirSync(path.join(base, 'src'), { recursive: true }); mkdirSync(path.join(base, 'fixtures'), { recursive: true });
  writeFileSync(path.join(base, 'src', 'params.ts'), GOOD_PARAMS);
  writeFileSync(path.join(base, 'src', 'engine.ts'), 'export const evaluate = (s: number, nowMs: number) => s + nowMs;');
  writeFileSync(path.join(base, 'src', 'engine.test.ts'), GENS + ALL12);
  writeFileSync(path.join(base, 'fixtures', 'lagos.json'), '{}');
  const ok = audit(root);
  assert.deepEqual(ok.findings, [], JSON.stringify(ok.findings)); assert.equal(Object.keys(ok.properties).length, 12);

  writeFileSync(path.join(base, 'src', 'engine.ts'), 'export const evaluate = () => Date.now();');
  writeFileSync(path.join(base, 'src', 'params.ts'), GOOD_PARAMS.replace('minSamples: 20', 'minSamples: 5'));
  const r = audit(root);
  assert.equal(r.summary.errors, 2);
  assert.ok(r.findings.some((f) => f.rule === 'purity' && f.file === 'core/detection/src/engine.ts'));
  assert.ok(r.findings.some((f) => f.rule === 'params' && /minSamples/.test(f.message)));
});

test('detection-audit CLI: exit codes and JSON output', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-cli-'));
  const ok = spawnSync('node', [path.join(scripts, 'detection-audit.mjs'), '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(ok.status, 0); assert.equal(JSON.parse(ok.stdout).summary.errors, 0);
  mkdirSync(path.join(root, 'core', 'detection', 'src'), { recursive: true });
  const bad = spawnSync('node', [path.join(scripts, 'detection-audit.mjs'), '--root', root], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stdout, /params\.ts is missing/);
});

// ---------- kiro-story ----------
function fakeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'story-'));
  const w = (rel, text) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
  w('.kiro/steering/a.md', '---\ninclusion: always\n---\nx'); w('.kiro/steering/b.md', '---\ninclusion: fileMatch\nfileMatchPattern: "x"\n---\nx'); w('.kiro/steering/c.md', '---\ninclusion: manual\n---\nx');
  for (const s of ['alpha', 'beta']) { w(`.kiro/specs/${s}/requirements.md`, 'r'); w(`.kiro/specs/${s}/design.md`, '| P1 | a | b | c |\n| P2 | a | b | c |'); }
  w('.kiro/specs/bugfix-20261121-x/bugfix.md', 'b');
  w('.kiro/hooks/h.json', JSON.stringify({ version: 'v1', hooks: [{ name: 'a', trigger: 'Stop', action: { type: 'command', command: 'x' } }, { name: 'b', trigger: 'SessionStart', action: { type: 'agent', prompt: 'p' } }] }));
  w('.kiro/skills/s1/SKILL.md', '---\nname: s1\n---'); w('.kiro/agents/ag.json', '{}');
  w('.kiro/settings/mcp.json', JSON.stringify({ mcpServers: { one: {}, two: {} } }));
  w('docs/adr/0001-x.md', 'a'); w('docs/adr/0002-y.md', 'b'); w('powers/grid-sensing/plugin.json', '{}');
  w('docs/kiro-log.md', '# Kiro log\n\n## 2026-11-10 First thing\n- did the first thing with `code`\n- second bullet\n\n## 2026-11-12 Second thing\n- did the second thing\n');
  w('README.md', '# Outage\n\nIntro.\n');
  return root;
}

test('countRepo counts only what exists', () => {
  const c = countRepo(fakeRepo());
  assert.deepEqual({ f: c.feature, b: c.bugfix, s: c.steering, h: c.hooks, sk: c.skills, a: c.agents, adr: c.adrs, pr: c.properties }, { f: 2, b: 1, s: 3, h: 2, sk: 1, a: 1, adr: 2, pr: 4 });
  assert.deepEqual(c.modes, { always: 1, fileMatch: 1, auto: 0, manual: 1 });
  assert.deepEqual(c.triggers, ['SessionStart', 'Stop']); assert.deepEqual(c.mcp, ['one', 'two']); assert.deepEqual(c.powers, ['grid-sensing']);
  const none = countRepo(mkdtempSync(path.join(tmpdir(), 'story-empty-')));
  assert.deepEqual({ f: none.feature, h: none.hooks, a: none.agents }, { f: 0, h: 0, a: 0 });
});

test('parseLog and render: entries come from the log, numbers from the counts, no invented text', () => {
  const root = fakeRepo();
  const entries = parseLog(readFileSync(path.join(root, 'docs', 'kiro-log.md'), 'utf8'));
  assert.deepEqual(entries.map((e) => e.date), ['2026-11-10', '2026-11-12']);
  const md = render(countRepo(root), entries);
  assert.match(md, /^<!-- BEGIN GENERATED: how-kiro-built-this/); assert.match(md, /END GENERATED: how-kiro-built-this -->$/);
  assert.match(md, /\| Specs \(requirements, design, tasks\) \| 2 \|/); assert.match(md, /\(2 entries\)/);
  assert.match(md, /\*\*2026-11-10 First thing\*\*: did the first thing with code/);
  assert.match(render(countRepo(root), entries, { max: 1 }), /The last 1:/);
});

test('applyBlock replaces in place, appends when absent, and --write/--check work on a file', () => {
  const root = fakeRepo();
  const run = (...a) => spawnSync('node', [path.join(scripts, 'kiro-story.mjs'), '--root', root, ...a], { encoding: 'utf8' });
  assert.equal(run('--check', 'README.md').status, 1);
  assert.equal(run('--write', 'README.md').status, 0);
  assert.equal(run('--check', 'README.md').status, 0);
  const once = readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(once, /^# Outage\n\nIntro\.\n\n<!-- BEGIN/);
  assert.equal(run('--write', 'README.md').status, 0);
  assert.equal(readFileSync(path.join(root, 'README.md'), 'utf8'), once, 'idempotent');
  writeFileSync(path.join(root, 'docs', 'kiro-log.md'), readFileSync(path.join(root, 'docs', 'kiro-log.md'), 'utf8') + '\n## 2026-11-14 Third\n- more\n');
  assert.equal(run('--check', 'README.md').status, 1, 'a new log entry makes the block stale');
  assert.equal(run('--write', 'missing.md').status, 1);
  assert.equal(applyBlock('a', 'B'), 'a\n\nB\n');
});

test('the real repository renders a section whose counts match the folders', () => {
  const root = path.resolve(here, '..', '..', '..');
  const c = countRepo(root);
  assert.ok(c.feature >= 13 && c.steering >= 15 && c.skills >= 3 && c.hooks >= 14, JSON.stringify(c));
  assert.match(render(c, parseLog(readFileSync(path.join(root, 'docs', 'kiro-log.md'), 'utf8'))), /## How Kiro built this/);
});
