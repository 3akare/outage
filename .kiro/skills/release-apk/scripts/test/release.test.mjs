import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { preflight } from '../preflight.mjs';
import { inspectApk, describe, toToml } from '../apk-info.mjs';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- preflight ----------
const GOOD = () => ({
  git: { branch: 'main', dirty: 0, ahead: 0, tags: ['v0.1.0'], tracked: ['.kiro/steering/product.md', 'apps/mobile/app.json', '.env.example'] },
  gitMode: 'main',
  appJson: { expo: { version: '0.2.0', android: { package: 'app.outage', permissions: ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.POST_NOTIFICATIONS'] }, plugins: [] } },
  easJson: { cli: { appVersionSource: 'remote' }, build: { production: { autoIncrement: true, android: { buildType: 'apk' } } } },
  gitignore: 'node_modules/\n*.apk\n.env\n',
  profile: 'production', verify: 'pass',
  guideStatus: { tecno: 'unverified', other: 'unverified', pixel: 'verified' },
});
const by = (r, id) => r.find((x) => x.id === id);

test('preflight: a good setup has no failures, and warns about unverified OEM entries', () => {
  const r = preflight(GOOD());
  assert.deepEqual(r.filter((x) => x.status === 'fail'), []);
  assert.equal(by(r, 'battery guide').status, 'warn');
  assert.match(by(r, 'battery guide').detail, /tecno/);
  assert.equal(by(r, 'version bump').status, 'pass');
});

test('preflight: git state', () => {
  const c = GOOD(); c.git.branch = 'feature'; assert.equal(by(preflight(c), 'branch').status, 'fail');
  c.gitMode = 'pr'; assert.equal(by(preflight(c), 'branch').status, 'warn');
  const d = GOOD(); d.git.dirty = 3; assert.equal(by(preflight(d), 'clean tree').status, 'fail');
  const e = GOOD(); e.git.ahead = 2; assert.equal(by(preflight(e), 'pushed').status, 'fail');
});

test('preflight: version rules', () => {
  const a = GOOD(); a.appJson.expo.version = '0.1.0'; assert.match(by(preflight(a), 'version bump').detail, /already exists/);
  const b = GOOD(); b.git.tags = ['v0.3.0']; assert.match(by(preflight(b), 'version bump').detail, /lower than/);
  const c = GOOD(); c.appJson.expo.version = '1.0'; assert.equal(by(preflight(c), 'version').status, 'fail');
  const d = GOOD(); d.git.tags = []; assert.match(by(preflight(d), 'version bump').detail, /first release/);
});

test('preflight: forbidden permissions are release blockers (privacy.md)', () => {
  for (const perm of ['RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'READ_CONTACTS']) {
    const c = GOOD(); c.appJson.expo.android.permissions.push('android.permission.' + perm);
    assert.equal(by(preflight(c), 'permissions').status, 'fail', perm);
  }
  const p = GOOD(); p.appJson.expo.plugins = [['expo-location', { isAndroidBackgroundLocationEnabled: true }]];
  assert.equal(by(preflight(p), 'permissions').status, 'fail'); // background location through a plugin option is also blocked
});

test('preflight: EAS profile must build an APK, auto-increment, and hold no secrets', () => {
  const a = GOOD(); a.easJson.build.production = {}; assert.equal(by(preflight(a), 'profile builds an APK').status, 'fail');
  const b = GOOD(); b.easJson.build.production = { distribution: 'internal' }; assert.equal(by(preflight(b), 'profile builds an APK').status, 'pass');
  const c = GOOD(); c.easJson.build.production.autoIncrement = false; assert.equal(by(preflight(c), 'auto increment').status, 'warn');
  const d = GOOD(); d.easJson.build.production.android.keystorePassword = 'x'; assert.equal(by(preflight(d), 'no inline secrets').status, 'fail');
  const e = GOOD(); e.profile = 'nope'; assert.equal(by(preflight(e), 'profile').status, 'fail');
  const f = GOOD(); f.easJson = null; assert.equal(by(preflight(f), 'eas.json').status, 'fail');
  const g = GOOD(); g.easJson.cli.appVersionSource = 'local'; assert.equal(by(preflight(g), 'version source').status, 'warn');
});

test('preflight: secret files, gitignore, evidence folder, tests', () => {
  const a = GOOD(); a.git.tracked.push('apps/mobile/google-services.json', 'release.keystore');
  const r = by(preflight(a), 'secret files'); assert.equal(r.status, 'fail'); assert.match(r.detail, /google-services\.json/); assert.match(r.detail, /release\.keystore/);
  assert.equal(by(preflight(GOOD()), 'secret files').status, 'pass'); // .env.example is allowed
  const b = GOOD(); b.gitignore = 'node_modules/\n'; assert.equal(by(preflight(b), 'gitignore').status, 'fail');
  const c = GOOD(); c.git.tracked = ['apps/mobile/app.json']; assert.equal(by(preflight(c), '.kiro tracked').status, 'fail');
  const d = GOOD(); d.verify = 'fail'; assert.equal(by(preflight(d), 'tests').status, 'fail');
  const e = GOOD(); e.verify = undefined; assert.equal(by(preflight(e), 'tests').status, 'warn');
});

// ---------- apk-info ----------
/** Minimal stored ZIP, optionally with an APK signing block before the central directory. */
function zip(entries, { sigBlock = false } = {}) {
  const parts = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nm = Buffer.from(name), d = Buffer.from(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, nm]));
    offset += 30 + nm.length + d.length;
  }
  if (sigBlock) { const b = Buffer.concat([Buffer.alloc(8, 1), Buffer.from('APK Sig Block 42')]); parts.push(b); offset += b.length; }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, e]);
}
const E = (n) => ({ name: n, data: 'x' });

test('inspectApk: reads the ZIP directory and detects v1 and v2+ signatures', () => {
  const v2 = inspectApk(zip([E('AndroidManifest.xml'), E('classes.dex')], { sigBlock: true }));
  assert.deepEqual({ z: v2.isZip, m: v2.hasManifest, d: v2.hasDex, v1: v2.signedV1, v2: v2.signedV2plus, n: v2.entries }, { z: true, m: true, d: true, v1: false, v2: true, n: 2 });
  const v1 = inspectApk(zip([E('AndroidManifest.xml'), E('classes2.dex'), E('META-INF/CERT.RSA')]));
  assert.equal(v1.signedV1, true); assert.equal(v1.signedV2plus, false);
  const unsigned = inspectApk(zip([E('AndroidManifest.xml'), E('classes.dex')]));
  assert.equal(unsigned.signedV1 || unsigned.signedV2plus, false);
  assert.equal(inspectApk(Buffer.from('hello world, not a zip')).isZip, false);
  assert.equal(inspectApk(Buffer.alloc(0)).isZip, false);
});

test('describe: size, sha256 and problems for a good, an unsigned and a bad file', () => {
  const good = zip([E('AndroidManifest.xml'), E('classes.dex')], { sigBlock: true });
  const d = describe({ file: '/x/outage-0.2.0.apk', buf: good, version: '0.2.0', url: 'https://example.org/a.apk' });
  assert.equal(d.sha256, crypto.createHash('sha256').update(good).digest('hex'));
  assert.equal(d.sizeBytes, good.length); assert.deepEqual(d.problems, []);
  assert.equal(d.wranglerVars.APK_SHA256, d.sha256); assert.equal(d.file, 'outage-0.2.0.apk');
  assert.match(toToml(d.wranglerVars), /APK_VERSION = "0\.2\.0"/);
  assert.match(describe({ file: 'a.apk', buf: zip([E('AndroidManifest.xml'), E('classes.dex')]) }).problems.join(), /no signature/);
  assert.match(describe({ file: 'a.apk', buf: zip([E('classes.dex')], { sigBlock: true }) }).problems.join(), /AndroidManifest/);
  assert.match(describe({ file: 'a.apk', buf: Buffer.from('nope') }).problems.join(), /not a ZIP/);
});

test('CLI apk-info: prints the Worker vars, exits 1 for a bad file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apk-'));
  const f = path.join(dir, 'ok.apk'); writeFileSync(f, zip([E('AndroidManifest.xml'), E('classes.dex')], { sigBlock: true }));
  const ok = spawnSync('node', [path.join(scripts, 'apk-info.mjs'), f, '--version', '0.2.0', '--url', 'https://example.org/ok.apk'], { encoding: 'utf8' });
  assert.equal(ok.status, 0); assert.match(ok.stdout, /APK_SHA256 = "[0-9a-f]{64}"/); assert.match(ok.stdout, /signed v2\+ true/);
  const bad = path.join(dir, 'bad.apk'); writeFileSync(bad, 'not an apk');
  const r = spawnSync('node', [path.join(scripts, 'apk-info.mjs'), bad], { encoding: 'utf8' });
  assert.equal(r.status, 1); assert.match(r.stderr, /not a ZIP/);
});

test('CLI preflight runs against a repo and reports failures with exit 1', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pre-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const r = spawnSync('node', [path.join(scripts, 'preflight.mjs'), '--repo', dir, '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.some((x) => x.id === 'app config' && x.status === 'fail'));
  assert.ok(parsed.some((x) => x.id === 'eas.json' && x.status === 'fail'));
});
