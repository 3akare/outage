// Stop (after the human confirms): if checks pass and the tree is dirty, commit and push to main.
// Part A: initially commit and push directly to main; stop when .kiro/git-mode.json says "pr".
// Safety: never force-pushes, never uses `git add -A`, scans the staged diff for secrets and privacy problems first,
// refuses to commit secret-bearing files, refuses when checks fail.
import { say, git, run, readJson, readState, changedPaths, isDocPath, ROOT } from './lib.mjs';
import { findSecrets, findPrivacy, sensitivePath, formatFindings } from './scan.mjs';
import { unlinkSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const mode = readJson('.kiro/git-mode.json', { mode: 'main' }).mode;
if (mode !== 'main') { say(`push-to-main: git mode is "${mode}". Not pushing to main. Use a branch and a PR for this wave.`); process.exit(0); }

const branch = git(['branch', '--show-current']).out.trim();
if (branch !== 'main') { say(`push-to-main: current branch is "${branch}", not main. Skipped.`); process.exit(0); }

const files = changedPaths();
if (!files.length) { say('push-to-main: tree is clean. Nothing to push.'); process.exit(0); }

// 1. choose files to stage: never secret-bearing ones
const stage = [], refused = [];
for (const f of files) {
  const s = sensitivePath(f);
  if (s) refused.push(`${f} (${s})`); else stage.push(f);
}
if (refused.length) { say(['push-to-main: NOT pushed. Secret-bearing files are in the tree:', ...refused.map((r) => '  ' + r), 'Add them to .gitignore (not /.kiro) or remove them, then try again.']); process.exit(0); }

// 2. scan the content that would be committed
const problems = [];
for (const f of stage) {
  const abs = path.join(ROOT, f);
  if (!existsSync(abs)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  if (text.length > 400000) continue;
  const s = findSecrets(text); if (s.length) problems.push(formatFindings(f, s));
  const p = findPrivacy(f, text); if (p.length) problems.push(formatFindings(f, p));
}
if (problems.length) { say(['push-to-main: NOT pushed. The scan found problems:', ...problems]); process.exit(0); }

// 3. checks (after the cheap secret and privacy scans)
const v = run('node', ['.kiro/scripts/verify.mjs', '--quiet'], { timeout: 900000 });
const result = readState('verify.json', {}).result || 'unknown';
const hasCode = files.some((f) => !isDocPath(f));
if (result === 'fail' || /HOOK FAILED/.test(v.out)) { say(['push-to-main: NOT pushed. Checks are failing. main must stay green (Part A.3).', v.out.slice(0, 2500)]); process.exit(0); }
if (hasCode && result === 'unverified') { say('push-to-main: NOT pushed. Code changed but there are no typecheck, lint or test scripts to verify it. Add them first.'); process.exit(0); }

// 4. commit
const msgFile = path.join(ROOT, '.commit-message.txt');
let msg = existsSync(msgFile) ? readFileSync(msgFile, 'utf8').trim() : '';
if (!/^(feat|fix|test|docs|chore|refactor|perf|build|ci)(\([^)]+\))?!?: .+/.test(msg)) {
  msg = `chore: save work in progress [spec:none task:none]`;
}
// A path that is gone from disk and from the index (already `git rm`-ed) matches nothing and would fail `git add`.
// `-A` also stages deletions that are still unstaged.
const addable = stage.filter((f) => existsSync(path.join(ROOT, f)) || git(['ls-files', '--', f]).out.trim());
const add = addable.length ? git(['add', '-A', '--', ...addable]) : { code: 0, out: '' };
if (add.code !== 0) { say('push-to-main: git add failed:\n' + add.out.slice(0, 800)); process.exit(0); }
const staged = git(['diff', '--cached', '--name-only']).out.trim();
if (!staged) { say('push-to-main: nothing staged.'); process.exit(0); }
const commit = git(['commit', '-q', '-m', msg]);
if (commit.code !== 0) { say('push-to-main: commit failed:\n' + commit.out.slice(0, 800)); process.exit(0); }
try { unlinkSync(msgFile); } catch { /* ignore */ }

// 5. push (never forced)
const push = git(['push', 'origin', 'HEAD:main'], { timeout: 120000 });
if (push.code !== 0) { say(['push-to-main: committed locally but the push failed (no force push is ever used):', push.out.slice(0, 800)]); process.exit(0); }
say(`push-to-main: committed and pushed to main: ${msg.split('\n')[0]}`);
process.exit(0);
