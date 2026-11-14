#!/usr/bin/env node
// Inspect a built APK and print what the release needs: size, SHA-256, whether it is a signed package,
// and the Worker vars for the /install page (web-and-area-pages R7).
// No dependencies and no Android SDK: it reads the ZIP directory and looks for the APK signing markers.
// It cannot prove who signed the file or that the signature is valid; for that run `apksigner verify` (Android build tools) if available.
// Usage: node apk-info.mjs <file.apk> --version 0.1.0 [--url https://...] [--json]
import { readFileSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const EOCD = 0x06054b50, CEN = 0x02014b50;

/** Pure: Buffer -> facts about the package. */
export function inspectApk(buf) {
  const facts = { isZip: false, entries: 0, hasManifest: false, hasDex: false, signedV1: false, signedV2plus: false, names: [] };
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return facts;
  facts.isZip = true;
  // end of central directory
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === EOCD) { e = i; break; }
  if (e < 0) { facts.isZip = false; return facts; }
  const count = buf.readUInt16LE(e + 10), cdOffset = buf.readUInt32LE(e + 16);
  let p = cdOffset;
  for (let i = 0; i < count && p + 46 <= buf.length && buf.readUInt32LE(p) === CEN; i++) {
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    facts.names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  facts.entries = facts.names.length;
  facts.hasManifest = facts.names.includes('AndroidManifest.xml');
  facts.hasDex = facts.names.some((n) => /^classes\d*\.dex$/.test(n));
  facts.signedV1 = facts.names.some((n) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(n));
  // v2+ signatures sit in a block just before the central directory, ending with this 16-byte magic
  const magic = Buffer.from('APK Sig Block 42');
  facts.signedV2plus = cdOffset >= 16 + 8 && buf.subarray(cdOffset - 16, cdOffset).equals(magic);
  delete facts.names;
  return facts;
}

export function describe({ file, buf, version, url }) {
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const facts = inspectApk(buf);
  const problems = [];
  if (!facts.isZip) problems.push('not a ZIP/APK file');
  else {
    if (!facts.hasManifest) problems.push('no AndroidManifest.xml');
    if (!facts.hasDex) problems.push('no classes.dex');
    if (!facts.signedV1 && !facts.signedV2plus) problems.push('no signature found: an unsigned APK cannot be installed');
  }
  const vars = {
    APK_URL: url || '',
    APK_VERSION: version || '',
    APK_SIZE_BYTES: buf.length,
    APK_SHA256: sha256,
  };
  return { file: path.basename(file), sizeBytes: buf.length, sizeMiB: Math.round((buf.length / 1048576) * 10) / 10, sha256, ...facts, problems, wranglerVars: vars };
}

export const toToml = (v) =>
  `[vars]\nAPK_URL = "${v.APK_URL}"\nAPK_VERSION = "${v.APK_VERSION}"\nAPK_SIZE_BYTES = ${v.APK_SIZE_BYTES}\nAPK_SHA256 = "${v.APK_SHA256}"\n`;

function main() {
  const a = process.argv.slice(2);
  const file = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--version' && a[a.indexOf(x) - 1] !== '--url');
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!file) { console.error('usage: apk-info.mjs <file.apk> --version X.Y.Z [--url URL] [--json]'); process.exit(2); }
  if (statSync(file).size > 300 * 1048576) { console.error('file is larger than 300 MiB; refusing'); process.exit(2); }
  const info = describe({ file, buf: readFileSync(file), version: get('--version'), url: get('--url') });
  if (a.includes('--json')) console.log(JSON.stringify(info, null, 2));
  else {
    console.log(`${info.file}: ${info.sizeMiB} MiB, sha256 ${info.sha256}`);
    console.log(`package: manifest ${info.hasManifest}, dex ${info.hasDex}, signed v1 ${info.signedV1}, signed v2+ ${info.signedV2plus}`);
    console.log('\nWorker vars for the /install page (workers/api/wrangler.toml):\n' + toToml(info.wranglerVars));
  }
  if (info.problems.length) { console.error('PROBLEMS:\n' + info.problems.map((p) => '  - ' + p).join('\n')); process.exit(1); }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
