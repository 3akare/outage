#!/usr/bin/env node
// Static audit of packages/detection against the brief (Part G), ADR 0005 and the detection-engine spec.
// It checks what a script can check; the detection-auditor agent does the judgment work on top of this output.
//   purity     no clock, randomness, network, storage or Node built-ins in the engine (spec R1.2)
//   params     every threshold still has the approved value (ADR 0005, Part G); a changed value is an ERROR until the human approves it
//   tests      each property P1..P12 has a test whose title names it; no skipped tests; fast-check runs read FC_NUM_RUNS
//   generators the generator kinds Part G requires appear in the tests
//   fixtures   golden fixtures exist (WARN until the field test records one)
// Usage: node .kiro/scripts/detection-audit.mjs [--root .] [--json]      Exit 1 when there is at least one ERROR.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Approved values. Source: brief Part G, ADR 0005. Changing one needs the human. */
export const APPROVED = {
  windowMs: 90000,
  minK: [2, 3],
  maxP: [0.05, 0.001],
  cut: 0.5,
  u0: 8,
  lookbackMs: 86400000,
  priorLambdaPerSec: 1 / 1800,
  priorExposureSec: 36000,
  dailyDecay: 0.9,
  baseMs: 90000,
  priorP95Ms: 60000,
  minSamples: 20,
  minQuorum: 2,
  unknownEndMs: 43200000,
  pushMaxAgeMs: 600000,
  staleArmedMs: 604800000,
  horizonMs: 648000000,
  minArmedForConfirm: 3,
};

const FORBIDDEN = [
  [/\bDate\.now\s*\(/, 'Date.now()'], [/\bnew Date\s*\(/, 'new Date()'], [/\bperformance\.now\s*\(/, 'performance.now()'],
  [/\bMath\.random\s*\(/, 'Math.random()'], [/\bcrypto\.(randomUUID|getRandomValues)\b/, 'crypto randomness'],
  [/\bfetch\s*\(/, 'fetch()'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bWebSocket\b/, 'WebSocket'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'browser storage'], [/\bprocess\.(env|argv|hrtime|cwd)\b/, 'process.*'],
  [/\bsetTimeout\s*\(|\bsetInterval\s*\(/, 'timers'], [/\brequire\s*\(/, 'require()'],
  [/from\s+['"]node:/, 'node: import'], [/from\s+['"](fs|path|os|http|https|net|child_process|crypto)['"]/, 'Node built-in import'],
];

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, acc) : acc.push(p);
  }
  return acc;
};
const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Evaluate a numeric literal expression such as 90_000, 1/1800, 604_800_000, 0.001. No eval. */
export function num(expr) {
  const e = expr.replace(/_/g, '').replace(/\s+/g, '');
  let m;
  if ((m = /^(-?\d+(?:\.\d+)?(?:e\d+)?)$/i.exec(e))) return Number(m[1]);
  if ((m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(e))) return Number(m[1]) / Number(m[2]);
  if ((m = /^(\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)(?:\*(\d+(?:\.\d+)?))?(?:\*(\d+(?:\.\d+)?))?$/.exec(e))) return m.slice(1).filter(Boolean).reduce((a, b) => a * Number(b), 1);
  return NaN;
}

export function auditParams(text) {
  const out = [];
  const t = stripComments(text);
  const find = (key) => [...t.matchAll(new RegExp(`\\b${key}\\s*:\\s*([0-9_./* eE-]+?)\\s*[,;}\\n]`, 'g'))].map((m) => num(m[1]));
  for (const [key, want] of Object.entries(APPROVED)) {
    const found = find(key);
    if (!found.length) { out.push({ severity: 'error', rule: 'params', message: `parameter ${key} not found in params.ts` }); continue; }
    const wants = Array.isArray(want) ? want : [want];
    const ok = wants.every((w) => found.some((f) => Math.abs(f - w) <= Math.abs(w) * 1e-9)) && found.every((f) => wants.some((w) => Math.abs(f - w) <= Math.abs(w) * 1e-9));
    if (!ok) out.push({ severity: 'error', rule: 'params', message: `${key} is ${found.join(' and ')} but the approved value is ${wants.join(' and ')} (ADR 0005). A threshold change needs the human.` });
  }
  return out;
}

export function auditSource(rel, text) {
  const out = [];
  const lines = stripComments(text).split('\n');
  lines.forEach((l, i) => {
    for (const [re, name] of FORBIDDEN) if (re.test(l) && !/audit:allow/.test(text.split('\n')[i] || '')) out.push({ severity: 'error', rule: 'purity', file: rel, line: i + 1, message: `engine code must be pure: ${name}` });
  });
  return out;
}

const TITLE = /\b(?:it|test|describe)(?:\.\w+)*\s*\(\s*(['"`])([^'"`]*)\1/g;
export function auditTests(files) {
  const out = []; const ids = new Map(); let all = '';
  for (const { rel, text } of files) {
    all += '\n' + text;
    for (const m of text.matchAll(TITLE)) for (const id of m[2].matchAll(/(?<![A-Za-z0-9])P(1[0-2]|[1-9])(?![0-9])/g)) if (!ids.has('P' + id[1])) ids.set('P' + id[1], rel);
    text.split('\n').forEach((l, i) => { if (/\b(it|test|describe)\.(skip|todo)\b|\b(xit|xdescribe|xtest)\(/.test(l)) out.push({ severity: 'error', rule: 'tests', file: rel, line: i + 1, message: 'skipped or todo test (Part H: never mark a task done with skipped tests)' }); });
  }
  if (!files.length) { out.push({ severity: 'error', rule: 'tests', message: 'no test files under packages/detection' }); return { out, ids }; }
  for (let i = 1; i <= 12; i++) if (!ids.has('P' + i)) out.push({ severity: 'error', rule: 'tests', message: `property P${i} has no test whose title names it` });
  if (!/fc\.assert\s*\(/.test(all)) out.push({ severity: 'error', rule: 'tests', message: 'no fc.assert call: properties must be tested with fast-check' });
  if (!/FC_NUM_RUNS/.test(all)) out.push({ severity: 'warn', rule: 'tests', message: 'tests do not read FC_NUM_RUNS; the hooks and CI use it to scale runs' });
  const gens = [[/jitter/i, 'true outages with up to 2 s jitter'], [/generator|restart/i, 'generator restarts spread over minutes'], [/late|delay/i, 'phones delivering hours late'], [/duplicate/i, 'duplicate events'], [/noisy|weight/i, 'noisy devices'], [/baseline|human/i, 'baseline-rate human unplugs']];
  for (const [re, name] of gens) if (!re.test(all)) out.push({ severity: 'warn', rule: 'generators', message: `no test mentions the required generator: ${name} (Part G)` });
  return { out, ids };
}

export function audit(root) {
  const base = path.join(root, 'packages', 'detection');
  const findings = [];
  if (!existsSync(path.join(base, 'src'))) return { findings: [{ severity: 'info', rule: 'scope', message: 'packages/detection/src does not exist yet (not scaffolded). Nothing to audit.' }], summary: { errors: 0, warnings: 0, infos: 1 }, properties: {} };
  const files = walk(base).filter((f) => /\.[cm]?[jt]sx?$/.test(f));
  for (const f of files.filter((x) => !isTest(x) && /[\\/]src[\\/]/.test(x))) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    findings.push(...auditSource(rel, readFileSync(f, 'utf8')));
  }
  const params = files.find((f) => /[\\/]params\.[cm]?[jt]s$/.test(f));
  if (!params) findings.push({ severity: 'error', rule: 'params', message: 'packages/detection/src/params.ts is missing (R1.4: every threshold lives in one file)' });
  else findings.push(...auditParams(readFileSync(params, 'utf8')));
  const tests = files.filter(isTest).map((f) => ({ rel: path.relative(root, f).split(path.sep).join('/'), text: readFileSync(f, 'utf8') }));
  const t = auditTests(tests); findings.push(...t.out);
  const fx = walk(path.join(base, 'fixtures')).filter((f) => f.endsWith('.json'));
  if (!fx.length) findings.push({ severity: 'warn', rule: 'fixtures', message: 'no golden fixture yet; the field test must record at least one real outage (milestone 4 gate)' });
  const summary = { errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warn').length, infos: findings.filter((f) => f.severity === 'info').length };
  return { findings, summary, properties: Object.fromEntries([...t.ids]) };
}

function main() {
  const a = process.argv.slice(2);
  const root = path.resolve(a[a.indexOf('--root') + 1] && a.includes('--root') ? a[a.indexOf('--root') + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const r = audit(root);
  if (a.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    for (const f of r.findings) console.log(`${f.severity.toUpperCase().padEnd(5)} ${f.rule.padEnd(10)} ${f.file ? f.file + (f.line ? ':' + f.line : '') + '  ' : ''}${f.message}`);
    console.log(`\n${r.summary.errors} error(s), ${r.summary.warnings} warning(s)`);
  }
  process.exit(r.summary.errors ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
