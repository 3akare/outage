#!/usr/bin/env node
// Pre-build checks for an Outage APK release. A free EAS plan has a small monthly build allowance
// (30 builds, lower-priority queue: https://expo.dev/changelog/2023-08-01-eas-free-plan-limits), so find problems before building.
// Usage: node preflight.mjs [--repo .] [--profile production] [--json]
// Exit 0: no failures (warnings allowed). Exit 1: at least one failure.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const FORBIDDEN_PERMISSIONS = /(isAndroidBackgroundLocationEnabled"?:true|RECORD_AUDIO|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_CONTACTS|READ_PHONE_STATE|READ_PHONE_NUMBERS|READ_SMS|READ_CALL_LOG|BODY_SENSORS)/;
const SECRET_FILE = /(^|\/)(\.env(\..+)?|\.dev\.vars(\..+)?|google-services\.json|GoogleService-Info\.plist|[^/]+\.(pem|p12|pfx|jks|keystore)|service-?account[^/]*\.json)$/;
const SAFE_ENV = /\.(example|sample|template)$/;
const semver = (v) => /^\d+\.\d+\.\d+$/.test(v || '');
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

/** Pure: ctx -> [{ id, status: 'pass'|'warn'|'fail', detail }] */
export function preflight(ctx) {
  const out = [];
  const add = (id, status, detail) => out.push({ id, status, detail });
  const g = ctx.git || {};

  add('branch', g.branch === 'main' ? 'pass' : (ctx.gitMode === 'pr' ? 'warn' : 'fail'), g.branch === 'main' ? 'on main' : `on "${g.branch}"; release builds come from main in git mode "${ctx.gitMode || 'main'}"`);
  add('clean tree', g.dirty ? 'fail' : 'pass', g.dirty ? `${g.dirty} uncommitted file(s): commit first so the build matches a commit` : 'clean');
  add('pushed', g.ahead ? 'fail' : 'pass', g.ahead ? `${g.ahead} commit(s) not pushed: EAS builds the uploaded project but the release must match origin/main` : 'in sync with origin');

  const app = ctx.appJson?.expo;
  if (!app) add('app config', 'fail', 'apps/mobile/app.json has no "expo" section');
  else {
    add('version', semver(app.version) ? 'pass' : 'fail', semver(app.version) ? `version ${app.version}` : `expo.version "${app.version}" must be MAJOR.MINOR.PATCH`);
    add('package', app.android?.package ? 'pass' : 'fail', app.android?.package ? app.android.package : 'expo.android.package is missing');
    const perms = (app.android?.permissions || []).join(' ') + ' ' + JSON.stringify(app.plugins || []);
    const bad = perms.replace(/\s+/g, '').match(FORBIDDEN_PERMISSIONS);
    add('permissions', bad ? 'fail' : 'pass', bad ? `forbidden permission or option ${bad[1]} (privacy.md)` : 'no forbidden permission declared');
    if (g.tags) {
      const versions = g.tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(1)).sort(cmp);
      const last = versions.at(-1);
      if (g.tags.includes('v' + app.version)) add('version bump', 'fail', `tag v${app.version} already exists: bump expo.version`);
      else if (last && semver(app.version) && cmp(app.version, last) < 0) add('version bump', 'fail', `version ${app.version} is lower than the latest tag v${last}`);
      else add('version bump', 'pass', last ? `${app.version} is above v${last}` : `first release ${app.version}`);
    }
  }

  const eas = ctx.easJson;
  const profile = ctx.profile || 'production';
  if (!eas) add('eas.json', 'fail', 'apps/mobile/eas.json is missing');
  else {
    add('version source', eas.cli?.appVersionSource === 'remote' ? 'pass' : 'warn', `cli.appVersionSource is "${eas.cli?.appVersionSource}"; "remote" lets EAS raise android.versionCode (https://docs.expo.dev/build-reference/app-versions/)`);
    const p = eas.build?.[profile];
    if (!p) add('profile', 'fail', `build profile "${profile}" is missing`);
    else {
      const apk = p.android?.buildType === 'apk' || p.distribution === 'internal' || /assemble(Release|Debug)/.test(p.android?.gradleCommand || '');
      add('profile builds an APK', apk ? 'pass' : 'fail', apk ? 'APK build' : `profile "${profile}" would build an .aab; set android.buildType to "apk" (https://docs.expo.dev/build-reference/apk/)`);
      add('auto increment', p.autoIncrement ? 'pass' : 'warn', p.autoIncrement ? 'versionCode auto-increments' : 'autoIncrement is off: Android refuses to update to the same versionCode');
      const inline = JSON.stringify(p).match(/(keystorePassword|keyPassword|password|secret|token)/i);
      add('no inline secrets', inline ? 'fail' : 'pass', inline ? `eas.json profile contains "${inline[1]}"` : 'none');
    }
  }

  const tracked = (g.tracked || []).filter((f) => SECRET_FILE.test(f) && !SAFE_ENV.test(f));
  add('secret files', tracked.length ? 'fail' : 'pass', tracked.length ? `tracked: ${tracked.join(', ')}` : 'none tracked');
  const gi = ctx.gitignore || '';
  add('gitignore', /^\*\.apk$/m.test(gi) && /^\.env$/m.test(gi) ? 'pass' : 'fail', 'needs *.apk and .env lines (an APK must never be committed)');
  add('.kiro tracked', (g.tracked || []).some((f) => f.startsWith('.kiro/')) ? 'pass' : 'fail', 'the evidence folder must be in git');

  const v = ctx.verify;
  add('tests', v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'warn', v ? `last verify result: ${v}` : 'no verify result recorded; run the tests');

  const unver = Object.entries(ctx.guideStatus || {}).filter(([id, s]) => id !== 'other' && s !== 'verified').map(([id]) => id);
  add('battery guide', unver.length ? 'warn' : 'pass', unver.length ? `unverified on a device: ${unver.join(', ')} (oem-battery-guide skill)` : 'all makers verified');
  return out;
}

function sh(cmd, args, cwd) { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '').trim() }; }
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

function collect(repo, profile) {
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
  return {
    git: { branch, dirty, ahead, tags, tracked },
    gitMode: readJson(path.join(repo, '.kiro/git-mode.json'))?.mode,
    appJson: readJson(path.join(repo, 'apps/mobile/app.json')),
    easJson: readJson(path.join(repo, 'apps/mobile/eas.json')),
    gitignore: existsSync(path.join(repo, '.gitignore')) ? readFileSync(path.join(repo, '.gitignore'), 'utf8') : '',
    profile, verify, guideStatus,
  };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const results = preflight(collect(path.resolve(get('--repo', '.')), get('--profile', 'production')));
  if (a.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else for (const r of results) console.log(`${r.status.toUpperCase().padEnd(5)} ${r.id.padEnd(22)} ${r.detail}`);
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
