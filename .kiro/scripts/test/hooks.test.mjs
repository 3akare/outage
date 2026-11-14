// Tests for the hook scripts. Run: node --test .kiro/scripts/test/
// No dependencies (node:test). Integration tests use a temporary git repo and a local bare remote, never the real repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets, findPrivacy, sensitivePath } from '../scan.mjs';
import { findUnlabeled } from '../demo-label-check.mjs';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kiro = path.resolve(scripts, '..');

/** Temporary repo that contains a copy of the hook scripts, so ROOT resolves to the temp repo. */
function sandbox({ withRemote = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'outage-hooks-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'test@example.com'); g('config', 'user.name', 'Test');
  mkdirSync(path.join(dir, '.kiro'), { recursive: true });
  cpSync(scripts, path.join(dir, '.kiro', 'scripts'), { recursive: true });
  for (const f of ['approved-dependencies.json', 'git-mode.json']) cpSync(path.join(kiro, f), path.join(dir, '.kiro', f));
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  writeFileSync(path.join(dir, 'README.md'), '# t\n');
  g('add', '-A'); g('commit', '-q', '-m', 'chore: init');
  let remote = null;
  if (withRemote) {
    remote = mkdtempSync(path.join(tmpdir(), 'outage-remote-'));
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main'], { cwd: remote });
    g('remote', 'add', 'origin', remote);
    g('push', '-q', 'origin', 'main');
  }
  return { dir, remote, g, script: (n) => path.join(dir, '.kiro', 'scripts', n) };
}

const runScript = (file, payload, env = {}, args = [], cwd) =>
  spawnSync('node', [file, ...args], { input: JSON.stringify(payload ?? {}), encoding: 'utf8', env: { ...process.env, ...env }, cwd });

const W = (p, text) => ({ hook_event_name: 'PreToolUse', tool_name: 'fs_write', tool_input: { path: p, text } });
const SR = (p, oldStr, newStr) => ({ hook_event_name: 'PreToolUse', tool_name: 'str_replace', tool_input: { path: p, oldStr, newStr } });
const SH = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'execute_bash', tool_input: { command } });
const DEL = (p) => ({ hook_event_name: 'PreToolUse', tool_name: 'delete_file', tool_input: { targetFile: p } });

const S = scripts;

// Fake secrets are assembled at run time so this file holds no literal secret (the secrets guard scans it too).
const FAKE_AWS = 'AKIA' + 'ABCDEFGHIJKLMNOP';
const FAKE_PEM = '-----BEGIN ' + 'PRIVATE KEY-----';
const FAKE_KEY = 'abcdefghijklmnop' + 'qrstuvwxyz123456';

// ---------- scanners ----------
test('findSecrets: detects real-looking secrets and ignores placeholders', () => {
  assert.equal(findSecrets(`const k = "${FAKE_AWS}";`).length, 1);
  assert.equal(findSecrets(FAKE_PEM).length, 1);
  assert.equal(findSecrets('token: "ghp_' + 'a'.repeat(36) + '"').length, 1);
  assert.equal(findSecrets(`const apiKey = "${FAKE_KEY}";`).length, 1);
  assert.equal(findSecrets('const apiKey = process.env.API_KEY;').length, 0);
  assert.equal(findSecrets('const apiKey = "your-api-key-goes-here-123456";').length, 0);
  assert.equal(findSecrets('Authorization: `Bearer ${accessToken}`').length, 0);
  assert.equal(findSecrets(`const k = "${FAKE_AWS}"; // secrets-guard:allow test fixture`).length, 0);
});

test('sensitivePath: env, keys, service accounts; examples allowed', () => {
  assert.ok(sensitivePath('.env'));
  assert.ok(sensitivePath('workers/api/.dev.vars'));
  assert.ok(sensitivePath('keys/release.keystore'));
  assert.ok(sensitivePath('google-services.json'));
  assert.equal(sensitivePath('.env.example'), null);
  assert.equal(sensitivePath('src/index.ts'), null);
});

test('findPrivacy: blocks coordinates near storage, PII fields and forbidden permissions in code', () => {
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/Spot.kt', 'prefs.edit().putString("p", JSONObject().put("lat", lat).put("lng", lng).toString()).apply()').length, 1);
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/Spot.kt', 'Log.d("pos", "$latitude")').length, 1);
  assert.equal(findPrivacy('workers/api/src/a.ts', 'const phoneNumber = req.phone;').length, 1);
  assert.equal(findPrivacy('apps/android/app/src/main/AndroidManifest.xml', '<uses-permission android:name="android.permission.RECORD_AUDIO"/>').length, 1);
  assert.equal(findPrivacy('apps/android/app/src/main/AndroidManifest.xml', '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>').length, 1);
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/A.kt', 'val s = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)').length, 1);
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/X.kt', 'val c = doubleArrayOf(6.5095, 3.3711)').length, 1);
});

test('findPrivacy: allows the cell-only flow, coarse location, tests, docs, catalog and the allow marker', () => {
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/Spot.kt', 'val cell = cellOf(lat, lng)\nsave(cell)').length, 0);
  assert.equal(findPrivacy('apps/android/app/src/main/AndroidManifest.xml', '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>').length, 0);
  assert.equal(findPrivacy('apps/android/app/src/test/kotlin/SpotTest.kt', 'println(latitude)').length, 0);
  assert.equal(findPrivacy('docs/privacy.md', 'phoneNumber lat lng').length, 0);
  assert.equal(findPrivacy('packages/shared/src/catalog/lagos.json', '"centre": [6.5095, 3.3711]').length, 0);
  assert.equal(findPrivacy('apps/android/app/src/main/kotlin/X.kt', 'Log.d("x", "$lat") // privacy-guard:allow debug removed before commit').length, 0);
});

test('findUnlabeled: simulated events must carry simulated: true', () => {
  assert.equal(findUnlabeled("const e = { type: 'UNPLUG', installId: 'a', simulated: true };").length, 0);
  assert.equal(findUnlabeled("const e = { type: 'UNPLUG', installId: 'a' };").length, 1);
  assert.equal(findUnlabeled("const e = { installId: 'a', nested: { x: 1 }, type: 'REPLUG', simulated: true };").length, 0);
  assert.equal(findUnlabeled("const a = { type: 'ARMED', simulated: true };\nconst b = { type: 'DISARMED' };").length, 1);
  assert.equal(findUnlabeled("const t = { type: 'OTHER' };").length, 0);
});

// ---------- guard-privacy ----------
test('guard-privacy: exit 2 with a message for a violating write, 0 otherwise', () => {
  const bad = runScript(path.join(S, 'guard-privacy.mjs'), W('apps/android/app/src/main/kotlin/A.kt', 'prefs.edit().putString("pos", "$latitude,$longitude").apply()'));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /privacy-guard: blocked/);
  const good = runScript(path.join(S, 'guard-privacy.mjs'), W('apps/android/app/src/main/kotlin/A.kt', 'const cell = cellOf(a, b);'));
  assert.equal(good.status, 0);
  const notWrite = runScript(path.join(S, 'guard-privacy.mjs'), SH('echo RECORD_AUDIO'));
  assert.equal(notWrite.status, 0);
});

test('guard-privacy: works for str_replace and ignores docs', () => {
  assert.equal(runScript(path.join(S, 'guard-privacy.mjs'), SR('workers/api/src/a.ts', 'x', 'const email = body.email;')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-privacy.mjs'), W('docs/adr/0001.md', 'we never store phoneNumber')).status, 0);
});

// ---------- guard-secrets ----------
test('guard-secrets: blocks secrets and secret files in writes', () => {
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), W('workers/api/src/a.ts', 'const t = "ghp_' + 'b'.repeat(36) + '";')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), W('.env', 'FOO=bar')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), W('.env.example', 'FOO=')).status, 0);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), W('workers/api/src/a.ts', 'const t = env.INSTALL_TOKEN_SECRET;')).status, 0);
});

test('guard-secrets: blocks shell commands that stage or print secret files, allows normal ones', () => {
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('git add .env')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('cat .dev.vars')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('printenv')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('git add .env.example')).status, 0);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('git status && npm run test')).status, 0);
  assert.equal(runScript(path.join(S, 'guard-secrets.mjs'), SH('curl -H "Authorization: Bearer ' + 'z'.repeat(30) + '" https://x')).status, 2);
});

// ---------- guard-repo ----------
const decision = (r) => { try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; } catch { return null; } };

test('guard-repo evidence: blocks gitignoring or removing /.kiro', () => {
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('.gitignore', 'node_modules\n.kiro/\n')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('.gitignore', '/.kiro\n')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('.gitignore', '.kiro/steering\n')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('.gitignore', 'node_modules\n.commit-message.txt\n')).status, 0);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), SH('echo ".kiro" >> .gitignore')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), SH('rm -rf .kiro')).status, 2);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), DEL('.kiro/specs/a/tasks.md'))), 'ask');
});

test('guard-repo tests: blocks skipped tests, asks before deleting tests', () => {
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('packages/detection/a.test.ts', "it.skip('P1', () => {})")).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('apps/android/app/src/test/kotlin/ATest.kt', '@Ignore\nfun t() {}')).status, 2);
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), W('packages/detection/a.test.ts', "it('P1 single unplug', () => {})")).status, 0);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), DEL('packages/detection/a.test.ts'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('rm packages/detection/a.test.ts'))), 'ask');
  assert.equal(runScript(path.join(S, 'guard-repo.mjs'), DEL('docs/old.md')).status, 0);
});

test('guard-repo deps: asks before installing packages that are not approved', () => {
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install lodash'))), 'ask');
  // regression: a redirect after a bare install is not a package
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install ' + '2>' + '&1 | tail -3'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install > log.txt'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install lodash ' + '2>' + '/dev/null'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('pnpm add -D eslint'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install vitest@2.1.0 fast-check'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npm install'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npx --no-install vitest --run'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npx some-random-tool'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), SH('npx wrangler kv namespace create CACHE'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), W('apps/android/app/build.gradle.kts', 'dependencies {\n  implementation("com.squareup.okhttp3:okhttp:4.12.0")\n}'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), W('apps/android/app/build.gradle.kts', 'dependencies {\n  testImplementation("junit:junit:4.13.2")\n}'))), null);
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), W('apps/android/app/build.gradle.kts', 'plugins {\n  id("com.android.application")\n  id("org.jetbrains.kotlin.android")\n}'))), 'ask');
  assert.equal(decision(runScript(path.join(S, 'guard-repo.mjs'), W('apps/android/app/build.gradle.kts', 'dependencies {\n  implementation(libs.okhttp)\n}'))), 'ask');
});

test('guard-repo deps: package.json writes ask only for new unapproved dependencies', () => {
  const sb = sandbox();
  writeFileSync(path.join(sb.dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '^2' } }));
  const ok = runScript(sb.script('guard-repo.mjs'), W('package.json', JSON.stringify({ name: 'x', devDependencies: { vitest: '^2', 'fast-check': '^3' } })), {}, [], sb.dir);
  assert.equal(decision(ok), null);
  const bad = runScript(sb.script('guard-repo.mjs'), W('package.json', JSON.stringify({ name: 'x', devDependencies: { vitest: '^2', 'left-pad': '1' } })), {}, [], sb.dir);
  assert.equal(decision(bad), 'ask');
  assert.match(bad.stdout, /left-pad/);
});

// ---------- paid-service-check ----------
test('paid-service-check: injects the budget reminder for new services and stays silent otherwise', () => {
  const run = (prompt) => runScript(path.join(S, 'paid-service-check.mjs'), {}, { USER_PROMPT: prompt });
  assert.match(run('let us add Sentry for crash reports').stdout, /Budget is zero: confirm a free tier first/);
  assert.match(run('use Firebase for push').stdout, /firebase/);
  assert.match(run('integrate the Mapbox sdk').stdout, /Budget is zero/);
  assert.equal(run('write the detection tests for D1 and P3').stdout, '');
  assert.equal(run('split the timeline into segments').stdout, '');
  assert.equal(run('').stdout, '');
});

// ---------- spec-sync ----------
test('spec-sync-notice: speaks only for spec documents', () => {
  const r = runScript(path.join(S, 'spec-sync-notice.mjs'), { tool_name: 'fs_write', tool_input: { path: '.kiro/specs/area-cells/requirements.md', text: 'x' } });
  assert.match(r.stdout, /Update area-cells\/design\.md/);
  assert.equal(runScript(path.join(S, 'spec-sync-notice.mjs'), { tool_name: 'fs_write', tool_input: { path: 'src/a.ts', text: 'x' } }).stdout, '');
});

// ---------- traceability ----------
test('traceability: no tests yet passes; missing property fails; all present passes and regenerates the block', () => {
  const sb = sandbox();
  writeFileSync(path.join(sb.dir, 'docs', 'traceability.md'), '# Traceability\n');
  let r = spawnSync('node', [sb.script('traceability.mjs'), '--check'], { encoding: 'utf8', cwd: sb.dir });
  assert.equal(r.status, 0); assert.match(r.stdout, /no detection tests yet/);

  mkdirSync(path.join(sb.dir, 'packages', 'detection', 'src'), { recursive: true });
  writeFileSync(path.join(sb.dir, 'packages', 'detection', 'src', 'a.test.ts'), "it('P1_single_unplug_never_alerts', () => {});\nit('P12_no_stale_push', () => {});\n");
  r = spawnSync('node', [sb.script('traceability.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.equal(r.status, 1); assert.match(r.stdout, /MISSING tests naming P2/);
  const t = readFileSync(path.join(sb.dir, 'docs', 'traceability.md'), 'utf8');
  assert.match(t, /BEGIN GENERATED: detection properties/);
  assert.match(t, /\| P1 \| `packages\/detection\/src\/a\.test\.ts`/);
  assert.match(t, /\| P2 \| - \| - \| MISSING \|/);

  const all = Array.from({ length: 12 }, (_, i) => `it('P${i + 1}_x', () => {});`).join('\n');
  writeFileSync(path.join(sb.dir, 'packages', 'detection', 'src', 'a.test.ts'), all);
  r = spawnSync('node', [sb.script('traceability.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.equal(r.status, 0);
  assert.equal((readFileSync(path.join(sb.dir, 'docs', 'traceability.md'), 'utf8').match(/BEGIN GENERATED/g) || []).length, 1);
});

// ---------- compaction ----------
test('compaction: pre writes the snapshot and prints guidance; post restores the notes', () => {
  const sb = sandbox();
  writeFileSync(path.join(sb.dir, 'docs', 'status.md'), 'Current milestone: 1 Feasibility probe\n');
  let r = spawnSync('node', [sb.script('compaction.mjs'), 'pre'], { encoding: 'utf8', cwd: sb.dir });
  assert.equal(r.status, 0); assert.match(r.stdout, /Keep these facts/); assert.match(r.stdout, /1 Feasibility probe/);
  const notes = readFileSync(path.join(sb.dir, 'docs', 'session-notes.md'), 'utf8');
  assert.match(notes, /BEGIN AUTO SNAPSHOT/);
  writeFileSync(path.join(sb.dir, 'docs', 'session-notes.md'), notes.replace('## Decisions\n', '## Decisions\n- Use res-7 parents for actors.\n'));
  r = spawnSync('node', [sb.script('compaction.mjs'), 'pre'], { encoding: 'utf8', cwd: sb.dir });
  assert.match(readFileSync(path.join(sb.dir, 'docs', 'session-notes.md'), 'utf8'), /Use res-7 parents/); // manual notes survive a second snapshot
  r = spawnSync('node', [sb.script('compaction.mjs'), 'post'], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /Restored after compaction/); assert.match(r.stdout, /Use res-7 parents/);
  assert.ok(r.stdout.length < 3100);
});

// ---------- session-context ----------
test('session-context: prints milestone, open tasks of active specs, git mode, and stays short', () => {
  const sb = sandbox();
  writeFileSync(path.join(sb.dir, 'docs', 'status.md'), 'Current milestone: 1 Feasibility probe\nGate: armed >= 90%\nNext: scaffold tools/probe\nActive specs: feasibility-probe\n');
  mkdirSync(path.join(sb.dir, '.kiro', 'specs', 'feasibility-probe'), { recursive: true });
  writeFileSync(path.join(sb.dir, '.kiro', 'specs', 'feasibility-probe', 'tasks.md'), '- [ ] 1. Scaffold the probe\n- [x] 2. Checklist\n- [ ] 3. Analysis library\n');
  mkdirSync(path.join(sb.dir, 'docs', 'field'), { recursive: true });
  writeFileSync(path.join(sb.dir, 'docs', 'field', '2026-11-20.md'), '# Field report 2026-11-20\nGate: not measurable yet\n');
  const r = spawnSync('node', [sb.script('session-context.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Milestone: 1 Feasibility probe/);
  assert.match(r.stdout, /feasibility-probe: 1 done, 2 open/);
  assert.match(r.stdout, /task 1: Scaffold the probe/);
  assert.match(r.stdout, /Latest field report \(2026-11-20\)/);
  assert.match(r.stdout, /mode "main"/);
  assert.ok(r.stdout.length < 2700);
});

// ---------- push-to-main (integration, temp repo with a local bare remote) ----------
test('push-to-main: commits and pushes a docs change to main with the prepared message', () => {
  const sb = sandbox({ withRemote: true });
  writeFileSync(path.join(sb.dir, 'docs', 'a.md'), 'hello\n');
  writeFileSync(path.join(sb.dir, '.commit-message.txt'), 'docs: add a note [spec:none task:none]\n');
  const r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /committed and pushed to main: docs: add a note/);
  assert.equal(execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: sb.remote, encoding: 'utf8' }).trim(), 'docs: add a note [spec:none task:none]');
  assert.equal(existsSync(path.join(sb.dir, '.commit-message.txt')), false);
});

test('push-to-main: pushes deletions, both unstaged and already staged with git rm', () => {
  const sb = sandbox({ withRemote: true });
  writeFileSync(path.join(sb.dir, 'docs', 'keep.md'), 'keep\n');
  writeFileSync(path.join(sb.dir, 'docs', 'gone1.md'), 'one\n');
  writeFileSync(path.join(sb.dir, 'docs', 'gone2.md'), 'two\n');
  writeFileSync(path.join(sb.dir, '.commit-message.txt'), 'docs: add notes [spec:none task:none]\n');
  spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  unlinkSync(path.join(sb.dir, 'docs', 'gone1.md'));                                  // unstaged deletion
  execFileSync('git', ['rm', '-q', 'docs/gone2.md'], { cwd: sb.dir });                // already staged
  writeFileSync(path.join(sb.dir, '.commit-message.txt'), 'docs: remove notes [spec:none task:none]\n');
  const r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /committed and pushed to main: docs: remove notes/);
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: sb.remote, encoding: 'utf8' });
  assert.match(files, /docs\/keep\.md/);
  assert.doesNotMatch(files, /gone1\.md|gone2\.md/);
});

test('push-to-main: refuses secret files, secrets in content, and pr mode; pushes nothing', () => {
  const sb = sandbox({ withRemote: true });
  const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sb.remote, encoding: 'utf8' }).trim();
  const before = head();

  writeFileSync(path.join(sb.dir, '.env'), 'A=1\n');
  let r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /NOT pushed.*Secret-bearing files/s);
  execFileSync('rm', [path.join(sb.dir, '.env')]);

  writeFileSync(path.join(sb.dir, 'docs', 'k.md'), `key ${FAKE_AWS}\n`);
  r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /NOT pushed.*scan found problems/s);
  execFileSync('rm', [path.join(sb.dir, 'docs', 'k.md')]);

  writeFileSync(path.join(sb.dir, 'docs', 'ok.md'), 'fine\n');
  writeFileSync(path.join(sb.dir, '.kiro', 'git-mode.json'), JSON.stringify({ mode: 'pr' }));
  r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /git mode is "pr"/);
  assert.equal(head(), before);
});

test('push-to-main: refuses code changes that no script can verify, and failing checks', () => {
  const sb = sandbox({ withRemote: true });
  const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sb.remote, encoding: 'utf8' }).trim();
  const before = head();
  mkdirSync(path.join(sb.dir, 'packages', 'x'), { recursive: true });
  writeFileSync(path.join(sb.dir, 'packages', 'x', 'a.ts'), 'export const a = 1;\n');
  let r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /no typecheck, lint or test scripts/);
  assert.equal(head(), before);

  writeFileSync(path.join(sb.dir, 'package.json'), JSON.stringify({ name: 't', scripts: { test: 'node -e "process.exit(1)"' } }));
  r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /NOT pushed.*Checks are failing/s);
  assert.equal(head(), before);

  writeFileSync(path.join(sb.dir, 'package.json'), JSON.stringify({ name: 't', scripts: { test: 'node -e "process.exit(0)"' } }));
  r = spawnSync('node', [sb.script('push-to-main.mjs')], { encoding: 'utf8', cwd: sb.dir });
  assert.match(r.stdout, /committed and pushed to main: chore: save work in progress/);
  assert.notEqual(head(), before);
});

// ---------- push-confirm ----------
test('push-confirm: skips on a clean tree and in pr mode, asks when dirty on main', () => {
  const sb = sandbox();
  const out = (args) => JSON.parse(spawnSync('node', [sb.script('push-confirm.mjs'), ...args], { encoding: 'utf8', cwd: sb.dir }).stdout);
  assert.deepEqual(out(['push']), { skip: true });
  writeFileSync(path.join(sb.dir, 'docs', 'a.md'), 'x\n');
  const q = out(['push']);
  assert.match(q.question, /Commit 1 changed file/);
  assert.equal(q.options.length, 2);
  writeFileSync(path.join(sb.dir, '.kiro', 'git-mode.json'), JSON.stringify({ mode: 'pr' }));
  assert.deepEqual(out(['push']), { skip: true });
  assert.deepEqual(out(['suite']), { skip: true });
});

// ---------- hook files ----------
test('hook JSON files follow the v1 schema and point at real scripts', () => {
  const dir = path.join(kiro, 'hooks');
  const triggers = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit', 'PreTaskExec', 'PostTaskExec', 'PreCompact', 'PostCompact', 'PostFileCreate', 'PostFileSave', 'PostFileDelete']);
  const files = execFileSync('ls', [dir], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(j.version, 'v1', f);
    assert.ok(Array.isArray(j.hooks) && j.hooks.length, f);
    for (const h of j.hooks) {
      assert.ok(h.name && triggers.has(h.trigger), `${f}: ${h.name} trigger ${h.trigger}`);
      assert.ok(['command', 'agent'].includes(h.action?.type), f);
      if (h.action.type === 'command') {
        const m = h.action.command.match(/\.kiro\/scripts\/[\w.-]+\.mjs/);
        assert.ok(m && existsSync(path.join(kiro, '..', m[0])), `${f}: script ${m?.[0]}`);
      } else assert.ok(h.action.prompt?.length > 40, f);
      if (h.confirm) {
        assert.equal(h.trigger, 'Stop', `${f}: confirm is only valid on Stop command hooks`);
        assert.equal(h.action.type, 'command');
        assert.ok(h.confirm.question && h.confirm.options.some((o) => o.run) && h.confirm.options.some((o) => !o.run));
      }
    }
  }
});
