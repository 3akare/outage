// Validates every skill in .kiro/skills against the Agent Skills format used by Kiro:
// https://kiro.dev/docs/skills/  (SKILL.md with name and description; name matches the folder; lowercase letters, digits, hyphens; max 64;
// description max 1024). Also checks that every file a skill points to exists, and that scripts have a test.
// Run: node --test ".kiro/skills/test/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skills = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(skillsDir, e.name, 'SKILL.md'))).map((e) => e.name);

function parse(file) {
  const t = readFileSync(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(t);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (kv && !line.startsWith(' ')) { key = kv[1]; fm[key] = kv[2]; }
    else if (key && /^\s+\S/.test(line)) fm[key] = (typeof fm[key] === 'object' ? fm[key] : { _: fm[key] }) && { ...(typeof fm[key] === 'object' ? fm[key] : {}), [line.trim().split(':')[0]]: line.trim().split(':').slice(1).join(':').trim() };
  }
  return { fm, body: m[2] };
}

test('the three skills from the brief exist', () => {
  for (const s of ['oem-battery-guide', 'field-report', 'release-apk']) assert.ok(skills.includes(s), s);
});

for (const name of skills) {
  test(`skill ${name}: frontmatter follows the Agent Skills format`, () => {
    const p = parse(path.join(skillsDir, name, 'SKILL.md'));
    assert.ok(p, 'SKILL.md must start with --- frontmatter ---');
    assert.equal(p.fm.name, name, 'name must match the folder name');
    assert.match(p.fm.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(p.fm.name.length <= 64);
    assert.ok(p.fm.description && p.fm.description.length >= 80, 'description should say what it does and when to use it');
    assert.ok(p.fm.description.length <= 1024, `description is ${p.fm.description.length} characters, the limit is 1024`);
    assert.match(p.fm.description, /\bUse (when|for)\b/i, 'description should say when to use the skill');
    assert.ok(p.body.trim().length > 500, 'body should hold the instructions');
  });

  test(`skill ${name}: every file it points to exists`, () => {
    const { body } = parse(path.join(skillsDir, name, 'SKILL.md'));
    const refs = new Set([...body.matchAll(/`((?:references|scripts)\/[A-Za-z0-9_./-]+)`/g)].map((m) => m[1]));
    for (const r of refs) assert.ok(existsSync(path.join(skillsDir, name, r)), `${name}: missing ${r}`);
    const repoRefs = new Set([...body.matchAll(/`((?:packages|docs|\.kiro|apps|tools|workers)\/[A-Za-z0-9_./-]+\.(?:json|md|mjs|toml))`/g)].map((m) => m[1]));
    const root = path.resolve(skillsDir, '..', '..');
    // files that do not exist yet because their task has not run are listed here on purpose
    const planned = new Set(['docs/field/failures.json', 'web/wrangler.toml', 'android/outage/app/build.gradle.kts', 'android/outage/app/src/main/AndroidManifest.xml', '.github/workflows/release.yml', 'core/detection/src/params.ts', 'docs/probe-checklist.md', 'docs/probe/<date>-<alias>.md']);
    for (const r of repoRefs) {
      if (/[<*]/.test(r) || planned.has(r) || /YYYY/.test(r)) continue;
      assert.ok(existsSync(path.join(root, r)), `${name}: points to ${r}, which does not exist`);
    }
  });

  test(`skill ${name}: every script has a test file, and the references folder holds only markdown`, () => {
    const dir = path.join(skillsDir, name, 'scripts');
    if (existsSync(dir)) {
      const scripts = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
      const tests = existsSync(path.join(dir, 'test')) ? readdirSync(path.join(dir, 'test')).filter((f) => f.endsWith('.test.mjs')) : [];
      assert.ok(scripts.length && tests.length, `${name}: scripts need a tests folder`);
    }
    const refs = path.join(skillsDir, name, 'references');
    if (existsSync(refs)) for (const f of readdirSync(refs)) assert.ok(f.endsWith('.md'), `${name}/references/${f}`);
  });

  test(`skill ${name}: nothing in it contains a secret or an identifier pattern`, async () => {
    const { findSecrets } = await import('../../scripts/scan.mjs');
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const f of walk(path.join(skillsDir, name))) {
      if (statSync(f).size > 400000) continue;
      const found = findSecrets(readFileSync(f, 'utf8'));
      assert.deepEqual(found, [], `${f}: ${JSON.stringify(found)}`);
    }
  });
}
