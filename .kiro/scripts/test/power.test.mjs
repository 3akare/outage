// Conformance test for powers/grid-sensing against the Agent Plugins specification v1.0.0
// (https://github.com/agentplugins/agent-plugins-spec, spec/1.0.0.md) and Kiro's page on creating powers
// (https://kiro.dev/docs/powers/create/). Also checks that the Power is portable and in sync with the project's data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const power = path.join(root, 'powers', 'grid-sensing');
const json = (f) => JSON.parse(readFileSync(path.join(power, f), 'utf8'));
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const manifest = json('plugin.json');
const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

test('plugin.json: closed schema, required fields, and the keywords the brief asks for', () => {
  const allowed = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
  for (const k of Object.keys(manifest)) assert.ok(allowed.has(k), `unknown top-level field: ${k}`);
  assert.equal(manifest.$schema, SCHEMA);
  assert.equal(manifest.name, 'grid-sensing');
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length > 60 && typeof manifest.description === 'string');
  for (const k of Object.keys(manifest.author)) assert.ok(['name', 'email', 'url'].includes(k), `author.${k}`);
  assert.ok(manifest.author.name);
  assert.ok(Array.isArray(manifest.keywords) && manifest.keywords.every((k) => typeof k === 'string' && k));
  for (const must of ['outage', 'charging sensor', 'blackout detection']) assert.ok(manifest.keywords.includes(must), `brief keyword: ${must}`);
  assert.equal(manifest.license, undefined, 'the human has not chosen a license');
});

test('skills: each immediate child of skills/ has SKILL.md whose name equals the folder; nothing is nested deeper', () => {
  const dir = path.join(power, 'skills');
  const names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.deepEqual(names.sort(), ['blackout-detection', 'charging-sensor', 'oem-battery-guide']);
  for (const n of names) {
    const text = readFileSync(path.join(dir, n, 'SKILL.md'), 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n/.exec(text); assert.ok(m, n);
    const fm = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
    assert.equal(fm.name, n); assert.ok(fm.description.length >= 80 && fm.description.length <= 1024, `${n} description ${fm.description.length}`);
    assert.match(fm.description, /\bUse when\b/);
    assert.equal(fm.license, undefined);
    const nested = walk(path.join(dir, n)).filter((f) => path.basename(f) === 'SKILL.md' && f !== path.join(dir, n, 'SKILL.md'));
    assert.deepEqual(nested, []);
    for (const ref of new Set([...text.matchAll(/`((?:references|scripts)\/[A-Za-z0-9_./-]+)`/g)].map((x) => x[1]))) assert.ok(existsSync(path.join(dir, n, ref)), `${n}: missing ${ref}`);
  }
});

test('mcp.json: Agent Plugins shape, same schema version as plugin.json, no secrets and no expansion', () => {
  const m = json('mcp.json');
  assert.equal(m.$schema, MCP_SCHEMA);
  assert.equal(SCHEMA.match(/\/(\d+\.\d+\.\d+)\//)[1], MCP_SCHEMA.match(/\/(\d+\.\d+\.\d+)\//)[1], 'schema versions match');
  for (const [name, s] of Object.entries(m.mcpServers)) {
    assert.ok(['stdio', 'streamable-http', 'sse'].includes(s.type), `${name} type`);
    if (s.type !== 'stdio') {
      const u = new URL(s.url); assert.equal(u.protocol, 'https:'); assert.equal(u.username, ''); assert.equal(u.hash, '');
      assert.deepEqual(Object.keys(s).filter((k) => !['type', 'url', 'headers'].includes(k)), [], 'closed variant');
      for (const [h, v] of Object.entries(s.headers || {})) {
        assert.ok(!/\$\{/.test(h + v), 'no placeholder expansion in headers');
        assert.deepEqual(findSecrets(`${h}: ${v}`), []);
      }
    }
  }
  assert.deepEqual(Object.keys(m.mcpServers), ['context7']);
  assert.equal(m.mcpServers.context7.url, JSON.parse(readFileSync(path.join(root, '.kiro/settings/mcp.json'), 'utf8')).mcpServers.context7.url, 'same server as the project');
});

test('the Power is portable: no path into the rest of the repository, no secrets', () => {
  for (const f of walk(power)) {
    if (statSync(f).size > 400000) continue;
    const t = readFileSync(f, 'utf8'); const rel = path.relative(power, f);
    assert.deepEqual(findSecrets(t), [], rel);
    if (rel.endsWith('.md') && rel !== 'README.md') {
      const bad = t.match(/`(?:\.kiro|packages|apps|workers|tools|modules)\/[^`]*`/g);
      // sources.md names project spec ids in prose; code-formatted repository paths are not allowed
      assert.equal(bad, null, `${rel} points into the repository: ${bad}`);
      assert.ok(!/docs\/(adr|probe|field|kiro-log)/.test(t.replace(/ADR 0005 of the project/g, '')), `${rel} points at project docs`);
    }
  }
});

test('copies of project data are identical to their source (sync)', () => {
  const pairs = [
    ['packages/shared/src/oem-guide.json', 'powers/grid-sensing/skills/oem-battery-guide/references/oem-guide.json'],
    ['.kiro/skills/oem-battery-guide/scripts/validate-guide.mjs', 'powers/grid-sensing/skills/oem-battery-guide/scripts/validate-guide.mjs'],
    ['.kiro/skills/oem-battery-guide/references/sources.md', 'powers/grid-sensing/skills/oem-battery-guide/references/sources.md'],
  ];
  for (const [a, b] of pairs) assert.equal(readFileSync(path.join(root, a), 'utf8'), readFileSync(path.join(root, b), 'utf8'), `${b} differs from ${a}: copy it (see powers/grid-sensing/README.md)`);
});

test('the numbers in blackout-detection match the project ADR table', () => {
  const skill = readFileSync(path.join(power, 'skills/blackout-detection/SKILL.md'), 'utf8');
  const adr = readFileSync(path.join(root, 'docs/adr/0005-detection-parameters.md'), 'utf8');
  const rows = (t) => [...t.matchAll(/^\| (\d+) \| ([\d.]+) \| (\d+) \| (\d+) \|$/gm)].map((m) => m.slice(1).join(','));
  assert.deepEqual(rows(skill), rows(adr));
  assert.equal(rows(skill).length, 7);
});

test('the README states what is not verified and points to the repository license, not an open one', () => {
  const r = readFileSync(path.join(power, 'README.md'), 'utf8');
  assert.match(r, /has not been verified on real phones yet|not been verified on real phones/);
  assert.match(r, /repository `LICENSE` \(view-only\)/);
  assert.ok(!/\b(MIT|Apache|GPL|BSD)\b/.test(r), 'the README must not claim an open source license');
  assert.ok(!('license' in JSON.parse(readFileSync(path.join(power, 'plugin.json'), 'utf8'))), 'plugin.json has no license field');
  assert.match(r, /Needs Kiro IDE or Kiro CLI v3/);
});
