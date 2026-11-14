// Shared helpers for Outage hook scripts. Plain Node ESM, no dependencies.
// Hook contract: https://kiro.dev/docs/hooks/ and https://kiro.dev/docs/hooks/types/
//  - the hook receives JSON on stdin: hook_event_name, cwd, session_id, tool_name, tool_input
//  - exit 0: stdout is added to the agent's context
//  - PreToolUse: we block with exit 2 and a message on stderr (any non-zero blocks per the docs,
//    and exit 2 is the documented blocking code in the hook tool contract, so 2 satisfies both)
//  - Post hooks report failures on stdout with exit 0, so the agent always sees them
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: the folder holding .git. Works if .kiro was synced to a parent workspace folder. */
export function repoRoot() {
  const candidates = [path.resolve(here, '..', '..'), process.cwd()];
  for (const c of candidates) if (existsSync(path.join(c, '.git'))) return c;
  for (const c of candidates) {
    try {
      for (const d of readdirSync(c)) {
        const p = path.join(c, d);
        if (statSync(p).isDirectory() && existsSync(path.join(p, '.git')) && existsSync(path.join(p, '.kiro'))) return p;
      }
    } catch { /* ignore */ }
  }
  return candidates[0];
}
export const ROOT = repoRoot();

export function readPayload() {
  try {
    const s = readFileSync(0, 'utf8');
    return s.trim() ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

const normName = (n = '') => String(n).toLowerCase().replace(/[^a-z]/g, '');

/** 'write' | 'delete' | 'shell' | 'other' from a tool name (Kiro Web, IDE and CLI spellings). */
export function toolKind(payload) {
  const n = normName(payload.tool_name || payload.toolName || '');
  if (!n) return 'other';
  if (n.includes('delete') || n === 'rm') return 'delete';
  if (n.includes('bash') || n.includes('shell') || n === 'runcommand' || n === 'execute') return 'shell';
  if (n.includes('write') || n.includes('replace') || n.includes('append') || n === 'edit' || n === 'create' || n === 'insert') return 'write';
  return 'other';
}

export function toRel(p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.resolve(ROOT, p);
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

/** Files and the text being added by a write-type tool call. */
export function extractWrites(payload) {
  const i = payload.tool_input || payload.toolInput || {};
  const p = i.path || i.file_path || i.filePath || i.targetFile || '';
  const content = [i.text, i.file_text, i.content, i.newStr, i.new_str, i.new_string, i.insert_text]
    .find((v) => typeof v === 'string');
  return p ? [{ path: toRel(p), content: content ?? '', input: i }] : [];
}

export function deletedPaths(payload) {
  const i = payload.tool_input || payload.toolInput || {};
  const p = i.targetFile || i.path || i.file_path || i.filePath;
  return p ? [toRel(p)] : [];
}

export function shellCommand(payload) {
  const i = payload.tool_input || payload.toolInput || {};
  return String(i.command || i.cmd || '');
}

/** Block a PreToolUse call. */
export function block(lines) {
  process.stderr.write([].concat(lines).join('\n') + '\n');
  process.exit(2);
}

/** Ask the human before a PreToolUse call proceeds. */
export function ask(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: reason } }) + '\n');
  process.exit(0);
}

export function say(lines) {
  process.stdout.write([].concat(lines).join('\n') + '\n');
}

export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd || ROOT, encoding: 'utf8', timeout: opts.timeout || 120000, env: { ...process.env, ...(opts.env || {}) }, shell: false, input: opts.input });
  return { code: r.status ?? (r.error ? 127 : 1), out: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

export const git = (args, opts) => run('git', args, opts);

export function gitDir() {
  const r = git(['rev-parse', '--git-dir']);
  if (r.code !== 0) return null;
  const d = r.out.trim();
  return path.isAbsolute(d) ? d : path.join(ROOT, d);
}

const stateFile = (name) => {
  const g = gitDir();
  if (!g) return null;
  const d = path.join(g, 'outage-hooks');
  mkdirSync(d, { recursive: true });
  return path.join(d, name);
};
export function readState(name, fallback = {}) {
  try { return JSON.parse(readFileSync(stateFile(name), 'utf8')); } catch { return fallback; }
}
export function writeState(name, value) {
  const f = stateFile(name);
  if (f) writeFileSync(f, JSON.stringify(value));
}

/** True when the same key already ran within ms (PostToolUse and PostFileSave can both fire for one save). */
export function debounced(key, ms = 8000) {
  const s = readState('debounce.json', {});
  const now = Date.now();
  if (s[key] && now - s[key] < ms) return true;
  s[key] = now;
  for (const k of Object.keys(s)) if (now - s[k] > 60000) delete s[k];
  writeState('debounce.json', s);
  return false;
}

export function readJson(rel, fallback = null) {
  try { return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
}
export function readText(rel, fallback = '') {
  try { return readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return fallback; }
}
export const exists = (rel) => existsSync(path.join(ROOT, rel));

export function tail(text, lines = 40, maxChars = 3000) {
  const t = text.split('\n').slice(-lines).join('\n');
  return t.length > maxChars ? '...' + t.slice(-maxChars) : t;
}

export function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

/** Changed paths in the working tree (staged, unstaged, untracked), repo-relative. */
export function changedPaths() {
  const r = git(['status', '--porcelain', '-uall']);
  if (r.code !== 0) return [];
  return r.out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
}

export const isDocPath = (p) => /^(docs\/|\.kiro\/)|\.md$|^\.gitignore$|^\.commit-message\.txt$/.test(p);
export const treeFingerprint = () => {
  const head = git(['rev-parse', 'HEAD']).out.trim();
  const st = git(['status', '--porcelain', '-uall']).out;
  const diff = git(['diff', 'HEAD']).out;
  // untracked and modified files: include size and mtime so a content change always changes the fingerprint
  const stats = changedPaths().map((p) => {
    try { const s = statSync(path.join(ROOT, p)); return `${p}:${s.size}:${Math.round(s.mtimeMs)}`; } catch { return `${p}:gone`; }
  }).join('\n');
  return hash(head + '\n' + st + '\n' + diff + '\n' + stats);
};
