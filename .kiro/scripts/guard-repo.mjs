// PreToolUse guards for repo rules that the human wants to decide:
//   evidence: never gitignore or delete /.kiro (Part A.4: it is the evidence judges score)
//   tests:    never skip tests; ask before deleting tests (Part H)
//   deps:     ask before adding any dependency or external service (Part H)
// Escape hatch for a reviewed skip: `test-guard:allow <reason>` on the line.
import { readPayload, toolKind, extractWrites, deletedPaths, shellCommand, block, ask, readJson, readText } from './lib.mjs';

const payload = readPayload();
const kind = toolKind(payload);
const approved = readJson('.kiro/approved-dependencies.json', { allowed: [], allowedTools: [] });
const allowed = new Set(approved.allowed);
const allowedTools = new Set(approved.allowedTools || []);

const TEST_FILE = /(\.(test|spec)\.[a-z]+$|Test\.kt$|(^|\/)(__tests__|test|tests)\/)/;
const KIRO_IGNORE_LINE = /^\s*!?\/?\.kiro(?:\/(?:\*{0,2}|steering|specs|hooks|skills|agents|settings|scripts)\/?\*{0,2})?\s*$/;
const SKIP = /\b(it|test|describe)\.(skip|todo)\b|\b(xit|xdescribe|xtest)\(|@Ignore\b|@Disabled\b/;

const pkgName = (spec) => {
  const s = spec.replace(/^npm:/, '');
  const at = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@');
  return at > 0 ? s.slice(0, at) : s;
};

function depNames(json) {
  const names = new Set();
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const n of Object.keys(json?.[k] || {})) names.add(n);
  }
  return names;
}

function newContentFor(w, prev) {
  const i = w.input;
  if (typeof i.oldStr === 'string' && typeof i.newStr === 'string') {
    return i.replace_all ? prev.split(i.oldStr).join(i.newStr) : prev.replace(i.oldStr, i.newStr);
  }
  const name = String(payload.tool_name || '').toLowerCase();
  if (name.includes('append')) return prev + '\n' + w.content;
  return w.content;
}

// ---- write ----
if (kind === 'write') {
  for (const w of extractWrites(payload)) {
    // evidence
    if (/(^|\/)\.gitignore$|(^|\/)\.git\/info\/exclude$/.test(w.path)) {
      const bad = w.content.split('\n').filter((l) => KIRO_IGNORE_LINE.test(l));
      if (bad.length) block(['evidence-guard: blocked. Never gitignore /.kiro. It is the evidence judges score (Part A.4).', `  ${w.path}: ${bad[0].trim()}`]);
    }
    // tests
    if (TEST_FILE.test(w.path)) {
      const bad = w.content.split('\n').filter((l) => SKIP.test(l) && !/test-guard:allow/.test(l));
      if (bad.length) block(['test-guard: blocked. Never skip or disable a test (Part H.2). Fix the test or the code, or ask the human.', `  ${w.path}: ${bad[0].trim().slice(0, 80)}`]);
    }
    // dependencies in package.json
    if (/(^|\/)package\.json$/.test(w.path)) {
      let prevText = '';
      try { prevText = readText(w.path, ''); } catch { /* new file */ }
      let before = new Set(); let after = new Set();
      try { before = depNames(JSON.parse(prevText || '{}')); } catch { /* ignore */ }
      try { after = depNames(JSON.parse(newContentFor(w, prevText))); } catch { /* partial edit: fall back to text scan */ }
      const added = [...after].filter((n) => !before.has(n) && !allowed.has(n));
      if (added.length) ask(`Adding dependencies not on the approved list (.kiro/approved-dependencies.json): ${added.join(', ')}. Confirm a free tier and approve, or choose another way.`);
    }
    // gradle
    if (/\.(gradle|gradle\.kts)$/.test(w.path) || /(^|\/)libs\.versions\.toml$/.test(w.path)) {
      const prev = readText(w.path, '');
      const lines = w.content.split('\n').filter((l) => /\b(implementation|api|testImplementation|compileOnly|kapt|ksp)\s*\(?\s*['"]/.test(l) && !prev.includes(l.trim()));
      if (lines.length) ask(`Adding Gradle dependencies: ${lines.map((l) => l.trim()).slice(0, 3).join(' | ')}. Ask the human before adding a dependency.`);
    }
  }
}

// ---- delete ----
if (kind === 'delete') {
  for (const p of deletedPaths(payload)) {
    if (p === '.kiro' || p.startsWith('.kiro/')) ask(`Deleting ${p}. /.kiro is the evidence judges score; confirm with the human.`);
    if (TEST_FILE.test(p)) ask(`Deleting a test file (${p}). The rule is to ask the human before deleting tests.`);
  }
}

// ---- shell ----
if (kind === 'shell') {
  const cmd = shellCommand(payload);
  if (/(>>?|\btee\b)\s*\S*\.gitignore|\.git\/info\/exclude/.test(cmd) && /\.kiro/.test(cmd)) block('evidence-guard: blocked. Never gitignore /.kiro (Part A.4).');
  if (/\bgit\s+rm\b[^;&|]*\.kiro|\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?[^;&|]*\s\.kiro(\/?\s|\/?$)/.test(cmd)) block('evidence-guard: blocked. Do not remove /.kiro. It is the evidence judges score.');
  if (/\b(rm|git\s+rm)\b[^;&|]*\.(test|spec)\.[a-z]+/.test(cmd) || /\b(rm|git\s+rm)\b[^;&|]*(__tests__|\/tests?\/)/.test(cmd)) ask('This command deletes tests. The rule is to ask the human before deleting tests.');

  const m = cmd.match(/\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b([^;&|]*)/);
  if (m) {
    const pkgs = m[3].trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
    const unknown = pkgs.map(pkgName).filter((n) => !allowed.has(n));
    if (unknown.length) ask(`Installing packages not on the approved list: ${unknown.join(', ')}. Ask the human; confirm a free tier first.`);
  }
  const ex = cmd.match(/\bnpx\s+(?:--yes\s+|-y\s+)?expo\s+install\b([^;&|]*)/);
  if (ex) {
    const pkgs = ex[1].trim().split(/\s+/).filter((a) => a && !a.startsWith('-'));
    const unknown = pkgs.map(pkgName).filter((n) => !allowed.has(n));
    if (unknown.length) ask(`expo install of packages not on the approved list: ${unknown.join(', ')}. Ask the human.`);
  }
  const nx = cmd.match(/\bnpx\s+((?:--?[\w-]+\s+)*)([@\w./-]+)/);
  if (nx && !ex) {
    const tool = pkgName(nx[2]);
    if (!allowedTools.has(tool) && !allowed.has(tool) && !/^(--no-install)$/.test(tool)) ask(`npx would download and run "${tool}", which is not on the approved list. Ask the human.`);
  }
  if (/\bwrangler\s+(kv|d1|r2|queues|vectorize|hyperdrive|pipelines)\b[^;&|]*\bcreate\b/.test(cmd)) ask('This creates a new Cloudflare service resource. Budget is zero: confirm a free tier and ask the human first.');
}
process.exit(0);
