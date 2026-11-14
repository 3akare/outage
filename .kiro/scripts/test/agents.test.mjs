// Validates the custom agents in .kiro/agents against the configuration reference
// (https://kiro.dev/docs/custom-agents/configuration-reference/) and against the brief (Part B, custom agents).
// Run: node --test ".kiro/scripts/test/agents.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const agentsDir = path.join(root, '.kiro', 'agents');
const files = readdirSync(agentsDir).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(path.join(agentsDir, f), 'utf8'));
const mcp = JSON.parse(readFileSync(path.join(root, '.kiro', 'settings', 'mcp.json'), 'utf8')).mcpServers;
const cli = JSON.parse(readFileSync(path.join(root, '.kiro', 'settings', 'cli.json'), 'utf8'));

const CAPABILITIES = new Set(['fs_read', 'fs_write', 'shell', 'web_fetch', 'web_search', 'mcp', 'subagent', 'skill', 'power', 'context', 'diagnostics', 'sandbox_network', 'all', 'builtin', 'filesystem']);
const EFFECTS = new Set(['allow', 'ask', 'deny', 'evaluate']);
const TOOL_SELECTOR = /^(read|write|shell|web|subagent|knowledge|\*|@mcp|@builtin|@powers|@[a-z0-9-]+(\/[A-Za-z0-9_-]+)?)$/;

/** Expand a file:// resource (a path or a ** glob) to existing files. */
function expand(uri) {
  const rel = uri.replace(/^file:\/\//, '').replace(/^\.\//, '');
  if (!/[*]/.test(rel)) return existsSync(path.join(root, rel)) ? [rel] : [];
  const [dir, pattern] = rel.split('/**/');
  const ext = pattern?.replace('*', '') || '';
  const walk = (d) => readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(ext) ? [`${d}/${e.name}`] : []));
  return existsSync(path.join(root, dir)) ? walk(dir) : [];
}

test('the three agents from the brief exist', () => {
  assert.deepEqual(files.map((f) => f.replace('.json', '')).sort(), ['detection-auditor', 'pitch-writer', 'sensor-engineer']);
});

for (const f of files) {
  const name = f.replace('.json', '');
  const a = load(f);

  test(`${name}: required fields, name equals file name, prompt file is real`, () => {
    assert.equal(a.name, name);
    assert.ok(a.description.length > 80 && /\bUse\b/.test(a.description), 'description says when to use it');
    assert.match(a.prompt, /^file:\/\/\.\/prompts\/[\w-]+\.md$/);
    const p = path.join(agentsDir, a.prompt.replace('file://./', ''));
    assert.ok(existsSync(p), `prompt ${a.prompt}`);
    assert.ok(readFileSync(p, 'utf8').length > 1500, 'the prompt has real instructions');
    assert.ok(Array.isArray(a.tools) && a.tools.length, 'tools');
    assert.ok(a.welcomeMessage && a.welcomeMessage.length < 220);
  });

  test(`${name}: tools use valid selectors and every @server exists in mcp config or the agent`, () => {
    for (const t of a.tools) assert.match(t, TOOL_SELECTOR, t);
    for (const t of a.tools.filter((x) => x.startsWith('@') && !['@mcp', '@builtin', '@powers'].includes(x))) {
      const server = t.slice(1).split('/')[0];
      assert.ok(a.mcpServers?.[server] || mcp[server], `${name}: tool ${t} names no server`);
    }
    for (const [s, cfg] of Object.entries(a.mcpServers || {})) assert.equal(cfg.url, mcp[s]?.url, `${name}: ${s} must use the same URL as .kiro/settings/mcp.json`);
  });

  test(`${name}: the brief's rule: steering is listed in resources, files exist, and the resource limits hold`, () => {
    assert.ok(a.resources.includes('file://.kiro/steering/**/*.md'), 'custom agents do not load steering automatically');
    const seen = new Set(); let total = 0;
    for (const r of a.resources.filter((x) => x.startsWith('file://'))) {
      const got = expand(r);
      assert.ok(got.length, `${name}: ${r} matches no file`);
      for (const g of got) { if (seen.has(g)) continue; seen.add(g); const sz = statSync(path.join(root, g)).size; assert.ok(sz < 50000, `${g} is ${sz} characters, over the 50,000 per-file limit`); total += sz; }
    }
    assert.ok(seen.size <= 32, `${seen.size} files, limit 32`);
    assert.ok(total <= 100000, `${total} characters in file:// resources, limit 100,000 (https://kiro.dev/docs/custom-agents/configuration-reference/)`);
    assert.ok(total <= 85000, `${total} characters leaves no room to grow: trim resources`);
    for (const r of a.resources.filter((x) => x.startsWith('skill://'))) assert.ok(existsSync(path.join(root, r.replace('skill://', ''))), r);
  });

  test(`${name}: permissions use known capabilities and effects, and shell never allows destructive or forced commands`, () => {
    assert.ok(a.permissions?.rules?.length);
    for (const r of a.permissions.rules) {
      assert.ok(CAPABILITIES.has(r.capability), r.capability); assert.ok(EFFECTS.has(r.effect), r.effect);
      if (r.capability !== 'all') assert.ok(Array.isArray(r.match) && r.match.length, `${r.capability} rule needs match`);
      if (r.capability === 'shell' && r.effect === 'allow') for (const m of r.match) assert.ok(!/rm -rf|sudo|push --force|push -f|reset --hard|git clean|curl|wget/.test(m), `allowed: ${m}`);
    }
  });

  test(`${name}: includeMcpJson is explicit so the agent only gets the servers it names`, () => assert.equal(a.includeMcpJson, false));
}

test('sensor-engineer: Kotlin and Android only (cannot write detection, Worker, steering or hooks) and is pinned to a max-effort model', () => {
  const a = load('sensor-engineer.json');
  const write = a.permissions.rules.filter((r) => r.capability === 'fs_write');
  const deny = write.find((r) => r.effect === 'deny'), allow = write.find((r) => r.effect === 'allow');
  assert.deepEqual(deny.match, ['**']);
  assert.ok(allow.match.every((m) => /^(modules\/outage-sensor\/\*\*|docs\/|\.kiro\/specs\/(sensor-android|station-mode|alerts-and-light-alarm)\/tasks\.md|\.commit-message\.txt)/.test(m)), allow.match.join());
  for (const forbidden of ['packages/detection/x.ts', 'workers/api/x.ts', '.kiro/steering/x.md', '.kiro/hooks/x.json', 'apps/mobile/src/a.tsx', 'packages/shared/src/a.ts']) {
    assert.ok(!allow.match.some((m) => forbidden.startsWith(m.replace('**', ''))), `${forbidden} must not be writable`);
    assert.ok(!deny.exclude.some((m) => forbidden.startsWith(m.replace('**', ''))), `${forbidden} must stay denied`);
  }
  assert.ok(a.permissions.rules.some((r) => r.capability === 'shell' && r.effect === 'ask' && r.match.some((m) => m.startsWith('npm install'))), 'installs ask');
  assert.ok(a.permissions.rules.some((r) => r.capability === 'shell' && r.effect === 'deny' && r.match.includes('git push --force*')));
  assert.equal(cli['chat.modelDefaults'][a.model]?.output_config?.effort, 'max', 'brief: highest reasoning effort for the Kotlin sensor');
});

test('detection-auditor: read-only by construction (no write tool, every write denied, no mutating shell) and max effort', () => {
  const a = load('detection-auditor.json');
  assert.ok(!a.tools.includes('write'));
  assert.ok(a.excludedTools.includes('write'));
  const w = a.permissions.rules.filter((r) => r.capability === 'fs_write');
  assert.equal(w.length, 1); assert.deepEqual(w[0].match, ['**']); assert.equal(w[0].effect, 'deny'); assert.equal(w[0].exclude, undefined);
  const allowed = a.permissions.rules.filter((r) => r.capability === 'shell' && r.effect === 'allow').flatMap((r) => r.match);
  for (const m of allowed) assert.ok(!/^(rm|mv|cp|git (add|commit|push|checkout|reset|stash|clean)|npm i|sed -i|tee)/.test(m), `mutating command allowed: ${m}`);
  const denied = a.permissions.rules.filter((r) => r.capability === 'shell' && r.effect === 'deny').flatMap((r) => r.match);
  for (const must of ['git commit*', 'git push*', 'rm *', '* > *']) assert.ok(denied.includes(must), `${must} must be denied`);
  assert.ok(a.resources.some((r) => r.endsWith('0005-detection-parameters.md')));
  assert.equal(cli['chat.modelDefaults'][a.model]?.output_config?.effort, 'max', 'brief: highest reasoning effort for the detection engine');
  const prompt = readFileSync(path.join(agentsDir, 'prompts', 'detection-auditor.md'), 'utf8');
  for (const must of ['detection-audit.mjs', 'VERDICT:', 'P1 to P12', 'ADR 0005', 'never edit']) assert.ok(new RegExp(must.replace(/ /g, '\\s+'), 'i').test(prompt), `prompt mentions ${must}`);
});

test('pitch-writer: may write only README.md and docs/pitch, and its prompt carries the claims discipline from the brief', () => {
  const a = load('pitch-writer.json');
  const w = a.permissions.rules.filter((r) => r.capability === 'fs_write');
  const deny = w.find((r) => r.effect === 'deny'), allow = w.find((r) => r.effect === 'allow');
  assert.deepEqual(deny.match, ['**']); assert.deepEqual(deny.exclude.sort(), allow.match.slice().sort());
  assert.ok(allow.match.every((m) => ['README.md', 'docs/pitch/**', '.commit-message.txt'].includes(m)));
  assert.ok(a.resources.includes('file://docs/kiro-log.md'));
  assert.equal(a.model, undefined, 'default model and effort outside the three max-effort areas');
  const p = readFileSync(path.join(agentsDir, 'prompts', 'pitch-writer.md'), 'utf8');
  for (const must of ['not from phones', '19 of 20', '989 to 310', 'nLine', 'claims.md', 'UNCHECKED', 'kiro-story.mjs', 'Never promise compensation', 'under 3 minutes']) assert.ok(p.includes(must), `prompt must contain: ${must}`);
});

test('the prompts never tell an agent to bypass a guard, and share the same stop rules', () => {
  for (const f of readdirSync(path.join(agentsDir, 'prompts'))) {
    const p = readFileSync(path.join(agentsDir, 'prompts', f), 'utf8');
    assert.ok(!/--no-verify|allow marker|git push --force|disable the hook/i.test(p.replace(/do not look for ways around them/gi, '')), f);
  }
  assert.ok(readFileSync(path.join(agentsDir, 'prompts', 'sensor-engineer.md'), 'utf8').includes('kill criterion'));
});

test('cli.json pins max effort for the model that the max-effort agents use, and the file is valid', () => {
  const models = new Set(['sensor-engineer.json', 'detection-auditor.json'].map((f) => load(f).model));
  assert.equal(models.size, 1, 'both max-effort agents share one model, because effort is configured per model');
  for (const m of models) assert.equal(cli['chat.modelDefaults'][m].output_config.effort, 'max');
});
