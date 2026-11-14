// PostToolUse (write): after a write under packages/detection, run the fast-check suite and return failures.
// Output goes to stdout with exit 0 so the agent always sees it (docs: stdout of exit 0 is added to context).
// Never installs anything: uses `npx --no-install`.
import { readPayload, toolKind, extractWrites, say, run, exists, debounced, tail, ROOT } from './lib.mjs';
import path from 'node:path';

const payload = readPayload();
if (toolKind(payload) !== 'write') process.exit(0);
const touched = extractWrites(payload).map((w) => w.path).filter((p) => p.startsWith('packages/detection/') && /\.(ts|json)$/.test(p));
if (!touched.length) process.exit(0);
if (debounced('detection-tests:' + touched.join(','), 8000)) process.exit(0);

if (!exists('packages/detection/package.json')) {
  say('detection-tests: packages/detection is not scaffolded yet (no package.json). Skipped.');
  process.exit(0);
}
const r = run('npx', ['--no-install', 'vitest', '--run', '--dir', 'packages/detection'], {
  timeout: 170000,
  env: { FC_NUM_RUNS: process.env.FC_NUM_RUNS || '100' },
  cwd: path.join(ROOT),
});
if (r.code === 0) {
  say(`detection-tests: PASS (${touched.join(', ')} changed; fast-check suite green).`);
} else if (/not found|could not determine executable|ENOENT|npm error code E404|no-install/i.test(r.out) && r.code !== 1) {
  say('detection-tests: vitest is not installed yet (dependencies missing). Skipped. Run the install after the human approves it.');
} else {
  say([
    'HOOK FAILED: detection-tests. The fast-check suite fails after your change to ' + touched.join(', ') + '.',
    'Fix the code or the property definition. Never skip a test and never weaken a property (Part G, Part H).',
    '--- output (tail) ---',
    tail(r.out, 60, 3500),
  ]);
}
process.exit(0);
