// confirmCommand for the Stop hooks that do something expensive or consequential.
// Prints JSON on stdout: { "skip": true } to suppress the prompt, or { question, options } to replace it.
// Docs: https://kiro.dev/docs/hooks/ (Confirmation prompts)
// Usage: node push-confirm.mjs push | suite
import { readJson, git, changedPaths, isDocPath, readState, exists, ROOT } from './lib.mjs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'push';
const skip = () => { process.stdout.write(JSON.stringify({ skip: true }) + '\n'); process.exit(0); };
const options = (yes, no) => [{ id: 'yes', label: yes, run: true }, { id: 'no', label: no, run: false }];

if (mode === 'push') {
  const gitMode = readJson('.kiro/git-mode.json', { mode: 'main' }).mode;
  if (gitMode !== 'main') skip();
  const branch = git(['branch', '--show-current']).out.trim();
  if (branch !== 'main') skip();
  const files = changedPaths();
  if (!files.length) skip();
  const v = readState('verify.json', {});
  const checks = v.result === 'pass' ? 'checks passed' : v.result === 'docs-only' ? 'docs and .kiro only' : v.result === 'fail' ? 'CHECKS FAILING, will not push' : 'checks will run first';
  const code = files.filter((f) => !isDocPath(f)).length;
  process.stdout.write(JSON.stringify({
    question: `Commit ${files.length} changed file(s) (${code} code, ${files.length - code} docs or config) and push to main? (${checks})`,
    options: options('Yes, commit and push', 'Not this time'),
  }) + '\n');
  process.exit(0);
}

if (mode === 'suite') {
  if (!exists('core/detection/package.json')) skip();
  const walk = (d) => {
    let n = 0, newest = 0;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { const r = walk(p); n += r.n; newest = Math.max(newest, r.newest); }
      else if (/\.test\.ts$/.test(e.name)) { n += 1; newest = Math.max(newest, statSync(p).mtimeMs); }
      else if (/\.ts$/.test(e.name)) newest = Math.max(newest, statSync(p).mtimeMs);
    }
    return { n, newest };
  };
  let info;
  try { info = walk(path.join(ROOT, 'core/detection')); } catch { skip(); }
  if (!info.n) skip();
  const last = readState('suite.json', {});
  if (last.newest && info.newest <= last.newest) skip();
  process.stdout.write(JSON.stringify({
    question: `Run the full property suite for core/detection (FC_NUM_RUNS=2000, can take several minutes)? ${info.n} test file(s).`,
    options: options('Yes, run it', 'Skip this time'),
  }) + '\n');
  process.exit(0);
}
skip();
