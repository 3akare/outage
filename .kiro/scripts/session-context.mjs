// SessionStart: print the current milestone, open tasks and the latest field report summary.
// Keeps the output short (under about 2,500 characters) because it is added to the agent's context.
import { say, readText, readJson, git, ROOT } from './lib.mjs';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const out = [];
const status = readText('docs/status.md', '');
const pick = (re) => (status.match(re) || [])[1]?.trim();
out.push('== Outage session context ==');
out.push('Milestone: ' + (pick(/^Current milestone:\s*(.+)$/m) || 'not set (docs/status.md)'));
out.push('Gate: ' + (pick(/^Gate:\s*(.+)$/m) || 'unknown'));
out.push('Next: ' + (pick(/^Next:\s*(.+)$/m) || 'see .kiro/specs/README.md'));
const active = (pick(/^Active specs:\s*(.+)$/m) || '').split(',').map((s) => s.trim()).filter(Boolean);

// open tasks
const specsDir = path.join(ROOT, '.kiro', 'specs');
const lines = [];
if (existsSync(specsDir)) {
  const names = readdirSync(specsDir).filter((d) => existsSync(path.join(specsDir, d, 'tasks.md')));
  let totalOpen = 0;
  for (const name of names) {
    const text = readText(`.kiro/specs/${name}/tasks.md`, '');
    const open = [...text.matchAll(/^- \[ \] (\d+)\. (.+)$/gm)];
    const done = [...text.matchAll(/^- \[x\] /gim)].length;
    totalOpen += open.length;
    if (active.includes(name)) {
      lines.push(`  ${name}: ${done} done, ${open.length} open`);
      open.slice(0, 3).forEach((m) => lines.push(`    - task ${m[1]}: ${m[2].replace(/\*\*/g, '').slice(0, 90)}`));
    }
  }
  out.push(`Open tasks across ${names.length} specs: ${totalOpen}`);
  if (lines.length) out.push('Active specs:', ...lines);
}

// latest field report
const fieldDir = path.join(ROOT, 'docs', 'field');
if (existsSync(fieldDir)) {
  const files = readdirSync(fieldDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  const latest = files.at(-1)?.replace(/\.md$/, '');
  if (latest) {
    const body = readText(`docs/field/${latest}.md`, '').split('\n').filter((l) => l.trim()).slice(0, 8);
    out.push(`Latest field report (${latest}):`, ...body.map((l) => '  ' + l.slice(0, 110)));
  } else out.push('Field report: none yet.');
} else out.push('Field report: none yet.');

// git
const branch = git(['branch', '--show-current']).out.trim() || '(detached)';
const dirty = git(['status', '--porcelain']).out.split('\n').filter(Boolean).length;
const mode = readJson('.kiro/git-mode.json', { mode: 'main' }).mode;
out.push(`Git: branch ${branch}, ${dirty} changed files, mode "${mode}" (${mode === 'main' ? 'commit and push to main' : 'one branch and PR per task wave'}).`);
out.push('Rules: steering in .kiro/steering, definition of done in .kiro/steering/definition-of-done.md. Ask the human before adding a dependency, service, threshold or stored data.');

let text = out.join('\n');
if (text.length > 2600) text = text.slice(0, 2570) + '\n...(truncated)';
say(text);
