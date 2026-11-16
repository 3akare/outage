// Stop: typecheck, lint and test the monorepo, and report failures.
// Runs root scripts `typecheck`, `lint`, `test` when they exist, plus the traceability check and, when
// Kotlin files changed, the Kotlin unit tests. Saves the result for push-to-main.
// Usage: node verify.mjs [--quiet] [--force]
import { say, run, readJson, exists, changedPaths, isDocPath, treeFingerprint, writeState, readState, tail } from './lib.mjs';

const quiet = process.argv.includes('--quiet');
const force = process.argv.includes('--force');

const changed = changedPaths();
const code = changed.filter((p) => !isDocPath(p));
const fp = treeFingerprint();
const last = readState('verify.json', {});
if (!force && last.fingerprint === fp && last.result) {
  if (!quiet) say(`verify: unchanged since last run (${last.result}).`);
  process.exit(0);
}
if (!code.length && !force) {
  writeState('verify.json', { fingerprint: fp, result: 'docs-only', at: Date.now(), steps: [] });
  if (!quiet) say('verify: only docs and .kiro files changed. Nothing to typecheck or test.');
  process.exit(0);
}

const pkg = readJson('package.json', null);
const scripts = pkg?.scripts || {};
const steps = [];
for (const name of ['typecheck', 'lint', 'test']) {
  if (!scripts[name]) { steps.push({ name, status: 'none' }); continue; }
  const env = name === 'test' ? { FC_NUM_RUNS: process.env.FC_NUM_RUNS || '100' } : {};
  const r = run('npm', ['run', '--silent', name], { timeout: 600000, env });
  steps.push({ name, status: r.code === 0 ? 'pass' : 'fail', out: r.code === 0 ? '' : tail(r.out, 60, 3000) });
}
if (changed.some((p) => /^(android\/outage|android\/probe)\/.*\.kts?$/.test(p))) {
  const r = run('node', ['.kiro/scripts/kotlin-check.mjs', '--run'], { timeout: 600000 });
  const failed = /KOTLIN BUILD OR TESTS FAILED/.test(r.out);
  steps.push({ name: 'kotlin', status: failed ? 'fail' : /skipped/i.test(r.out) ? 'none' : 'pass', out: failed ? tail(r.out, 60, 3000) : '' });
}
if (exists('.kiro/scripts/traceability.mjs')) {
  const r = run('node', ['.kiro/scripts/traceability.mjs', '--check']);
  steps.push({ name: 'traceability', status: /MISSING/.test(r.out) ? 'fail' : 'pass', out: /MISSING/.test(r.out) ? r.out : '' });
}

const failed = steps.filter((s) => s.status === 'fail');
// only real checks count as verification; the traceability check alone must not make unverified code look verified
const anyRan = steps.some((s) => s.status === 'pass' && s.name !== 'traceability');
const result = failed.length ? 'fail' : anyRan ? 'pass' : code.length ? 'unverified' : 'docs-only';
writeState('verify.json', { fingerprint: fp, result, at: Date.now(), steps: steps.map(({ name, status }) => ({ name, status })) });

if (failed.length) {
  say(['HOOK FAILED: verify-on-stop. main must stay green (Part A.3, Part H). Fix these before finishing:', ...failed.map((s) => `--- ${s.name} ---\n${s.out}`)]);
} else if (result === 'unverified') {
  say(`verify: code files changed (${code.slice(0, 5).join(', ')}) but the repo has no typecheck, lint or test scripts yet, so nothing was verified. Add them in the scaffolding task.`);
} else if (!quiet) {
  say('verify: PASS (' + steps.filter((s) => s.status === 'pass').map((s) => s.name).join(', ') + ').');
}
process.exit(0);
