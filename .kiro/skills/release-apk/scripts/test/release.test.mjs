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
const GRADLE_OK = `plugins { id("com.android.application") }
android {
    defaultConfig { applicationId = "app.outage"; minSdk = 26; targetSdk = 36; versionCode = 3; versionName = "0.2.0" }
    signingConfigs { create("release") { storePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD"); keyPassword = System.getenv("RELEASE_KEY_PASSWORD") } }
    buildTypes { release { isMinifyEnabled = false
        signingConfig = signingConfigs.getByName("release") } }
}`;
const MANIFEST_OK = '<manifest><uses-permission android:name="android.permission.POST_NOTIFICATIONS"/><uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/></manifest>';
const WORKFLOW_OK = `jobs:
  release:
    steps:
      - run: ./gradlew :app:assembleRelease
        env:
          RELEASE_KEYSTORE_PASSWORD: \${{ secrets.RELEASE_KEYSTORE_PASSWORD }}
          RELEASE_KEY_PASSWORD: \${{ secrets.RELEASE_KEY_PASSWORD }}
          RELEASE_KEY_ALIAS: \${{ secrets.RELEASE_KEY_ALIAS }}
          KEYSTORE_B64: \${{ secrets.RELEASE_KEYSTORE_BASE64 }}`;
const GOOD = () => ({
  git: { branch: 'main', dirty: 0, ahead: 0, tags: ['v0.1.0'], tracked: ['.kiro/steering/product.md', 'apps/android/app/build.gradle.kts', '.env.example'] },
  gitMode: 'main',
  build: { gradle: GRADLE_OK, manifest: MANIFEST_OK, workflow: WORKFLOW_OK, prevVersionCode: 2 },
  gitignore: 'node_modules/\n*.apk\n.env\n*.jks\n',
  verify: 'pass',
  guideStatus: { tecno: 'unverified', other: 'unverified', pixel: 'verified' },
});
const by = (r, id) => r.find((x) => x.id === id);

test('preflight: a good setup has no failures, and warns about unverified OEM entries', () => {
  const r = preflight(GOOD());
  assert.deepEqual(r.filter((x) => x.status === 'fail'), []);
  assert.equal(by(r, 'battery guide').status, 'warn');
  assert.match(by(r, 'battery guide').detail, /tecno/);
  assert.equal(by(r, 'version bump').status, 'pass');
  assert.equal(by(r, 'version code').status, 'pass');
});

test('preflight: git state', () => {
  const c = GOOD(); c.git.branch = 'feature'; assert.equal(by(preflight(c), 'branch').status, 'fail');
  c.gitMode = 'pr'; assert.equal(by(preflight(c), 'branch').status, 'warn');
  const d = GOOD(); d.git.dirty = 3; assert.equal(by(preflight(d), 'clean tree').status, 'fail');
  const e = GOOD(); e.git.ahead = 2; assert.equal(by(preflight(e), 'pushed').status, 'fail');
});

test('preflight: version rules', () => {
  const a = GOOD(); a.build.gradle = GRADLE_OK.replace('0.2.0', '0.1.0'); assert.match(by(preflight(a), 'version bump').detail, /already exists/);
  const b = GOOD(); b.git.tags = ['v0.3.0']; assert.match(by(preflight(b), 'version bump').detail, /lower than/);
  const c = GOOD(); c.build.gradle = GRADLE_OK.replace('0.2.0', '1.0'); assert.equal(by(preflight(c), 'version').status, 'fail');
  const d = GOOD(); d.git.tags = []; assert.match(by(preflight(d), 'version bump').detail, /first release/);
  const e = GOOD(); e.build.prevVersionCode = 3; assert.equal(by(preflight(e), 'version code').status, 'fail');
  const f = GOOD(); f.build.prevVersionCode = null; assert.equal(by(preflight(f), 'version code').status, 'pass');
  const g = GOOD(); g.build.gradle = GRADLE_OK.replace('targetSdk = 36', 'targetSdk = 33'); assert.equal(by(preflight(g), 'target SDK').status, 'warn');
});

test('preflight: forbidden permissions are release blockers (privacy.md)', () => {
  for (const perm of ['RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'READ_CONTACTS']) {
    const c = GOOD(); c.build.manifest = MANIFEST_OK.replace('</manifest>', `<uses-permission android:name="android.permission.${perm}"/></manifest>`);
    assert.equal(by(preflight(c), 'permissions').status, 'fail', perm);
  }
  const none = GOOD(); none.build.manifest = null; assert.equal(by(preflight(none), 'permissions').status, 'fail');
});

test('preflight: the release build is signed from the environment and never inline', () => {
  const a = GOOD(); a.build.gradle = GRADLE_OK.replace('signingConfig = signingConfigs.getByName("release")', ''); assert.equal(by(preflight(a), 'release is signed').status, 'fail');
  const b = GOOD(); b.build.gradle = GRADLE_OK.replace('System.getenv("RELEASE_KEY_PASSWORD")', '"hunter2hunter2"'); assert.equal(by(preflight(b), 'no inline secrets').status, 'fail');
  assert.equal(by(preflight(GOOD()), 'no inline secrets').status, 'pass');
  const c = GOOD(); c.build.gradle = null; assert.equal(by(preflight(c), 'app build file').status, 'fail');
});

test('preflight: the release workflow builds an APK with the four signing secrets and no inline values', () => {
  const a = GOOD(); a.build.workflow = WORKFLOW_OK.replace('assembleRelease', 'bundleRelease'); assert.equal(by(preflight(a), 'workflow builds an APK').status, 'fail');
  const b = GOOD(); b.build.workflow = WORKFLOW_OK.replace('secrets.RELEASE_KEY_ALIAS', 'secrets.OTHER'); const r = by(preflight(b), 'workflow signing secrets'); assert.equal(r.status, 'fail'); assert.match(r.detail, /RELEASE_KEY_ALIAS/);
  const c = GOOD(); c.build.workflow = WORKFLOW_OK.replace('${{ secrets.RELEASE_KEY_PASSWORD }}', 'plaintextvalue'); assert.equal(by(preflight(c), 'workflow no inline secrets').status, 'fail');
  const d = GOOD(); d.build.workflow = null; assert.equal(by(preflight(d), 'release workflow').status, 'fail');
});

test('preflight: secret files, gitignore, evidence folder, tests', () => {
  const a = GOOD(); a.git.tracked.push('apps/android/app/google-services.json', 'release.keystore');
  const r = by(preflight(a), 'secret files'); assert.equal(r.status, 'fail'); assert.match(r.detail, /google-services\.json/); assert.match(r.detail, /release\.keystore/);
  assert.equal(by(preflight(GOOD()), 'secret files').status, 'pass'); // .env.example is allowed
  const b = GOOD(); b.gitignore = 'node_modules/\n'; assert.equal(by(preflight(b), 'gitignore').status, 'fail');
  const b2 = GOOD(); b2.gitignore = 'node_modules/\n*.apk\n.env\n'; assert.equal(by(preflight(b2), 'gitignore').status, 'fail'); // no keystore line
  const c = GOOD(); c.git.tracked = ['apps/android/app/build.gradle.kts']; assert.equal(by(preflight(c), '.kiro tracked').status, 'fail');
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
  assert.ok(parsed.some((x) => x.id === 'app build file' && x.status === 'fail'));
  assert.ok(parsed.some((x) => x.id === 'release workflow' && x.status === 'fail'));
});
