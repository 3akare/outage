#!/usr/bin/env node
// Pre-release checks for an Outage APK built by GitHub Actions (ADR 0012). A release is cheap to cancel before the tag
// and awkward after it, so find problems before pushing the tag.
// Usage: node preflight.mjs [--repo .] [--json]
// Exit 0: no failures (warnings allowed). Exit 1: at least one failure.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const GRADLE = 'apps/android/app/build.gradle.kts';
const MANIFEST = 'apps/android/app/src/main/AndroidManifest.xml';
const WORKFLOW = '.github/workflows/release.yml';
const FORBIDDEN_PERMISSIONS = /(RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_CONTACTS|READ_PHONE_STATE|READ_PHONE_NUMBERS|READ_SMS|READ_CALL_LOG|BODY_SENSORS)/;
const SECRET_FILE = /(^|\/)(\.env(\..+)?|\.dev\.vars(\..+)?|google-services\.json|GoogleService-Info\.plist|[^/]+\.(pem|p12|pfx|jks|keystore)|service-?account[^/]*\.json)$/;
const SAFE_ENV = /\.(example|sample|template)$/;
const semver = (v) => /^\d+\.\d+\.\d+$/.test(v || '');
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const field = (text, re) => (re.exec(text || '') || [])[1];

/** Pure: ctx -> [{ id, status: 'pass'|'warn'|'fail', detail }] */
export function preflight(ctx) {
  const out = [];
  const add = (id, status, detail) => out.push({ id, status, detail });
  const g = ctx.git || {};

  add('branch', g.branch === 'main' ? 'pass' : (ctx.gitMode === 'pr' ? 'warn' : 'fail'), g.branch === 'main' ? 'on main' : `on "${g.branch}"; releases are tagged on main in git mode "${ctx.gitMode || 'main'}"`);
  add('clean tree', g.dirty ? 'fail' : 'pass', g.dirty ? `${g.dirty} uncommitted file(s): commit first so the tag matches a commit` : 'clean');
  add('pushed', g.ahead ? 'fail' : 'pass', g.ahead ? `${g.ahead} commit(s) not pushed: the workflow builds what is on origin, the release must match it` : 'in sync with origin');

  const gradle = ctx.build?.gradle;
  if (!gradle) add('app build file', 'fail', `${GRADLE} is missing`);
  else {
    const version = field(gradle, /versionName\s*=\s*"([^"]+)"/);
    const code = Number(field(gradle, /versionCode\s*=\s*(\d+)/));
    const pkg = field(gradle, /applicationId\s*=\s*"([^"]+)"/);
    const target = Number(field(gradle, /targetSdk\s*=\s*(\d+)/));
    add('version', semver(version) ? 'pass' : 'fail', semver(version) ? `versionName ${version}` : `versionName "${version}" must be MAJOR.MINOR.PATCH`);
    add('package', pkg ? 'pass' : 'fail', pkg || 'applicationId is missing');
    add('target SDK', target >= 36 ? 'pass' : 'warn', target ? `targetSdk ${target}` : 'targetSdk is not set explicitly (https://developer.android.com/google/play/requirements/target-sdk)');
    if (g.tags && semver(version)) {
      const versions = g.tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(1)).sort(cmp);
      const last = versions.at(-1);
      if (g.tags.includes('v' + version)) add('version bump', 'fail', `tag v${version} already exists: bump versionName`);
      else if (last && cmp(version, last) < 0) add('version bump', 'fail', `versionName ${version} is lower than the latest tag v${last}`);
      else add('version bump', 'pass', last ? `${version} is above v${last}` : `first release ${version}`);
    }
    if (ctx.build.prevVersionCode != null) add('version code', code > ctx.build.prevVersionCode ? 'pass' : 'fail', code > ctx.build.prevVersionCode ? `versionCode ${code} is above ${ctx.build.prevVersionCode}` : `versionCode ${code} must be higher than the last release (${ctx.build.prevVersionCode}); Android refuses to update to the same or a lower code`);
    else add('version code', code > 0 ? 'pass' : 'fail', code > 0 ? `versionCode ${code} (no earlier release to compare)` : 'versionCode is missing');
    const inline = /(storePassword|keyPassword)\s*=\s*"[^"]+"/.exec(gradle);
    add('no inline secrets', inline ? 'fail' : 'pass', inline ? `${GRADLE} holds a literal ${inline[1]}; read it from System.getenv` : 'signing values come from the environment');
    const releaseBlock = /release\s*\{([^}]*)\}/s.exec(gradle.slice(Math.max(0, gradle.indexOf('buildTypes'))));
    add('release is signed', releaseBlock && /signingConfig\s*=/.test(releaseBlock[1]) ? 'pass' : 'fail', releaseBlock && /signingConfig\s*=/.test(releaseBlock[1]) ? 'release build type has a signingConfig' : 'the release build type has no signingConfig, so the APK would be unsigned and not installable');
  }

  const manifest = ctx.build?.manifest;
  if (!manifest) add('permissions', 'fail', `${MANIFEST} is missing`);
  else {
    const bad = manifest.match(FORBIDDEN_PERMISSIONS);
    add('permissions', bad ? 'fail' : 'pass', bad ? `forbidden permission ${bad[1]} (privacy.md)` : 'no forbidden permission declared');
  }

  const wf = ctx.build?.workflow;
  if (!wf) add('release workflow', 'fail', `${WORKFLOW} is missing: tags have nothing to build them`);
  else {
    const assemble = /assembleRelease/.test(wf);
    add('workflow builds an APK', assemble ? 'pass' : 'fail', assemble ? 'runs assembleRelease' : 'no assembleRelease step; bundleRelease would produce an .aab, which cannot be sideloaded');
    const secrets = ['RELEASE_KEYSTORE_BASE64', 'RELEASE_KEYSTORE_PASSWORD', 'RELEASE_KEY_ALIAS', 'RELEASE_KEY_PASSWORD'].filter((n) => !wf.includes(`secrets.${n}`));
    add('workflow signing secrets', secrets.length ? 'fail' : 'pass', secrets.length ? `does not read: ${secrets.join(', ')}` : 'reads the four release signing secrets (set by the human in GitHub, never in git)');
    const literal = /(KEYSTORE_PASSWORD|KEY_PASSWORD)\s*:\s*(?!\$\{\{)\S+/.exec(wf);
    add('workflow no inline secrets', literal ? 'fail' : 'pass', literal ? `a signing value is written in the workflow: ${literal[1]}` : 'none');
  }

  const tracked = (g.tracked || []).filter((f) => SECRET_FILE.test(f) && !SAFE_ENV.test(f));
  add('secret files', tracked.length ? 'fail' : 'pass', tracked.length ? `tracked: ${tracked.join(', ')}` : 'none tracked');
  const gi = ctx.gitignore || '';
  add('gitignore', /^\*\.apk$/m.test(gi) && /^\.env$/m.test(gi) && /^\*\.(jks|keystore)$/m.test(gi) ? 'pass' : 'fail', 'needs *.apk, .env and *.jks or *.keystore lines (an APK or a key must never be committed)');
  add('.kiro tracked', (g.tracked || []).some((f) => f.startsWith('.kiro/')) ? 'pass' : 'fail', 'the evidence folder must be in git');

  const v = ctx.verify;
  add('tests', v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'warn', v ? `last verify result: ${v}` : 'no verify result recorded; run the tests');

  const unver = Object.entries(ctx.guideStatus || {}).filter(([id, s]) => id !== 'other' && s !== 'verified').map(([id]) => id);
  add('battery guide', unver.length ? 'warn' : 'pass', unver.length ? `unverified on a device: ${unver.join(', ')} (oem-battery-guide skill)` : 'all makers verified');
  return out;
}

function sh(cmd, args, cwd) { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '').trim() }; }
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

function collect(repo) {
  const branch = sh('git', ['branch', '--show-current'], repo).out;
  const dirty = sh('git', ['status', '--porcelain'], repo).out.split('\n').filter(Boolean).length;
  const ahead = Number(sh('git', ['rev-list', '--count', '@{u}..HEAD'], repo).out) || 0;
  const tags = sh('git', ['tag', '--list'], repo).out.split('\n').filter(Boolean);
  const tracked = sh('git', ['ls-files'], repo).out.split('\n').filter(Boolean);
  const gitDir = sh('git', ['rev-parse', '--git-dir'], repo).out;
  const verifyFile = path.resolve(repo, gitDir || '.git', 'outage-hooks', 'verify.json');
  const verify = readJson(verifyFile)?.result;
  const guide = path.join(repo, '.kiro/skills/oem-battery-guide/scripts/validate-guide.mjs');
  let guideStatus = {};
  if (existsSync(guide)) { const r = spawnSync('node', [guide, '--json'], { cwd: repo, encoding: 'utf8' }); try { guideStatus = JSON.parse(r.stdout).status; } catch { /* ignore */ } }
  const text = (f) => (existsSync(path.join(repo, f)) ? readFileSync(path.join(repo, f), 'utf8') : null);
  const last = tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).sort((x, y) => cmp(x.slice(1), y.slice(1))).at(-1);
  const prev = last ? sh('git', ['show', `${last}:${GRADLE}`], repo) : null;
  const prevVersionCode = prev && prev.code === 0 ? Number(field(prev.out, /versionCode\s*=\s*(\d+)/)) || null : null;
  return {
    git: { branch, dirty, ahead, tags, tracked },
    gitMode: readJson(path.join(repo, '.kiro/git-mode.json'))?.mode,
    build: { gradle: text(GRADLE), manifest: text(MANIFEST), workflow: text(WORKFLOW), prevVersionCode },
    gitignore: text('.gitignore') || '',
    verify, guideStatus,
  };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const results = preflight(collect(path.resolve(get('--repo', '.'))));
  if (a.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) console.log(`${r.status.toUpperCase().padEnd(5)} ${r.id.padEnd(22)} ${r.detail}`);
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
