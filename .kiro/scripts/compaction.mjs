// PreCompact / PostCompact: keep working notes across context compaction.
//   pre:  snapshot the repo state into docs/session-notes.md (auto block) and tell the summarizer what to keep
//   post: re-inject docs/session-notes.md so the agent keeps decisions and open questions
// Docs: https://kiro.dev/docs/hooks/types/ (stdout on exit 0 goes to the summarizer / the conversation, up to 3,000 characters).
// Decisions and open questions in the manual part of the notes are written by the agent as they arise (definition-of-done.md).
import { say, readText, git, readJson, ROOT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const which = process.argv[2] || 'pre';
const FILE = 'docs/session-notes.md';
const BEGIN = '<!-- BEGIN AUTO SNAPSHOT -->', END = '<!-- END AUTO SNAPSHOT -->';

const cut = (t, n) => (t.length > n ? t.slice(0, n - 20) + '\n...(truncated)' : t);

if (which === 'pre') {
  const branch = git(['branch', '--show-current']).out.trim() || '(detached)';
  const last = git(['log', '-1', '--pretty=%h %s']).out.trim();
  const dirty = git(['status', '--porcelain']).out.split('\n').filter(Boolean);
  const status = readText('docs/status.md', '');
  const milestone = (status.match(/^Current milestone:\s*(.+)$/m) || [])[1] || 'not set';
  const snap = [
    BEGIN,
    `Saved by the pre-compaction hook. Branch ${branch}. Last commit: ${last || 'none'}.`,
    `Milestone: ${milestone}. Git mode: ${readJson('.kiro/git-mode.json', { mode: 'main' }).mode}.`,
    `Uncommitted files (${dirty.length}): ${dirty.slice(0, 15).map((l) => l.slice(3)).join(', ') || 'none'}`,
    END,
  ].join('\n');
  let notes = readText(FILE, '# Session notes\n\nDecisions and open questions go here as they arise. Hooks snapshot and restore this file around context compaction.\n\n## Decisions\n\n## Open questions\n\n');
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  notes = re.test(notes) ? notes.replace(re, snap) : notes.replace(/\n*$/, '\n\n') + snap + '\n';
  writeFileSync(path.join(ROOT, FILE), notes);
  say(cut([
    'Context is being compacted. Keep these facts in the summary:',
    '- Decisions and open questions are saved in docs/session-notes.md (read it after compaction).',
    '- Current spec, task and what is half done; files changed but not committed.',
    '- Rules that must survive: ask the human before adding a dependency, service, threshold or stored data; commit after each task; main stays green.',
    snap.replace(/<!--.*?-->\n?/g, ''),
  ].join('\n'), 2900));
} else {
  const notes = readText(FILE, '');
  say(notes ? cut('Restored after compaction. docs/session-notes.md:\n' + notes.replace(/<!--.*?-->\n?/g, ''), 2900) : 'Context was compacted. docs/session-notes.md does not exist yet; re-read .kiro/specs/README.md and docs/status.md.');
}
process.exit(0);
