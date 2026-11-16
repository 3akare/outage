// Stop (after the human confirms, expensive): run the full fast-check property suite for the detection engine
// with many runs per property, and report failures. Part B: "run the property suite" (also run headless in CI).
import { say, run, exists, tail, writeState, ROOT } from './lib.mjs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

if (!exists('core/detection/package.json')) { say('property-suite-full: core/detection is not scaffolded yet. Skipped.'); process.exit(0); }
const runs = process.env.FC_NUM_RUNS || '2000';
const r = run('npx', ['--no-install', 'vitest', '--run', '--dir', 'core/detection'], { timeout: 1500000, env: { FC_NUM_RUNS: runs } });
const newest = (function walk(d) {
  let n = 0;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    n = Math.max(n, e.isDirectory() ? walk(p) : statSync(p).mtimeMs);
  }
  return n;
})(path.join(ROOT, 'core', 'detection')); // repo-rooted: Kiro Web runs hooks from the workspace root, one level above the repo
if (r.code === 0) {
  writeState('suite.json', { newest, at: Date.now(), runs });
  say(`property-suite-full: PASS with FC_NUM_RUNS=${runs}.`);
} else if (/not found|could not determine executable|no-install/i.test(r.out) && r.code !== 1) {
  say('property-suite-full: vitest is not installed yet. Skipped.');
} else {
  say(['HOOK FAILED: property-suite-full. A property failed with FC_NUM_RUNS=' + runs + '.', 'Keep the failing seed and shrunk case as a regression test. Do not weaken or skip the property; write the options in an ADR and ask the human if the definition is at fault.', '--- output (tail) ---', tail(r.out, 80, 3800)]);
}
process.exit(0);
