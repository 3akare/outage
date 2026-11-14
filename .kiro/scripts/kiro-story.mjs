#!/usr/bin/env node
// Generate the "How Kiro built this" section from the repository itself and docs/kiro-log.md (brief Part I milestone 5, Part J).
// Every number is counted from files that exist; nothing is typed by hand. Used by the pitch-writer agent.
// Usage: node .kiro/scripts/kiro-story.mjs [--root .] [--write README.md] [--check README.md] [--entries N]
//   (no flag)        print the section
//   --write FILE     replace the generated block in FILE (appended if absent). FILE must exist.
//   --check FILE     exit 1 when the block in FILE is out of date
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BEGIN = '<!-- BEGIN GENERATED: how-kiro-built-this (.kiro/scripts/kiro-story.mjs) -->';
const END = '<!-- END GENERATED: how-kiro-built-this -->';

const ls = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }) : []);
const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };

export function countRepo(root) {
  const k = path.join(root, '.kiro');
  const steering = ls(path.join(k, 'steering')).filter((e) => e.isFile() && e.name.endsWith('.md'));
  const modes = { always: 0, fileMatch: 0, auto: 0, manual: 0 };
  for (const e of steering) { const m = /^inclusion:\s*(\w+)/m.exec(read(path.join(k, 'steering', e.name))); if (m && m[1] in modes) modes[m[1]]++; }
  const specDirs = ls(path.join(k, 'specs')).filter((e) => e.isDirectory());
  const feature = specDirs.filter((e) => existsSync(path.join(k, 'specs', e.name, 'requirements.md')) && !e.name.startsWith('bugfix-')).length;
  const bugfix = specDirs.filter((e) => e.name.startsWith('bugfix-')).length;
  const hookFiles = ls(path.join(k, 'hooks')).filter((e) => e.name.endsWith('.json'));
  let hooks = 0; const triggers = new Set(); let agentHooks = 0, commandHooks = 0;
  for (const e of hookFiles) { try { for (const h of JSON.parse(read(path.join(k, 'hooks', e.name))).hooks) { hooks++; triggers.add(h.trigger); h.action.type === 'agent' ? agentHooks++ : commandHooks++; } } catch { /* ignore */ } }
  const skills = ls(path.join(k, 'skills')).filter((e) => e.isDirectory() && existsSync(path.join(k, 'skills', e.name, 'SKILL.md'))).length;
  const agents = ls(path.join(k, 'agents')).filter((e) => e.isFile() && e.name.endsWith('.json')).length;
  let mcp = []; try { mcp = Object.keys(JSON.parse(read(path.join(k, 'settings', 'mcp.json'))).mcpServers || {}); } catch { /* ignore */ }
  const adrs = ls(path.join(root, 'docs', 'adr')).filter((e) => /^\d{4}-.*\.md$/.test(e.name)).length;
  const powers = ls(path.join(root, 'powers')).filter((e) => e.isDirectory() && existsSync(path.join(root, 'powers', e.name, 'plugin.json'))).map((e) => e.name);
  const fieldReports = ls(path.join(root, 'docs', 'field')).filter((e) => /^\d{4}-\d{2}-\d{2}\.md$/.test(e.name)).length;
  const props = new Set();
  for (const e of specDirs) for (const m of read(path.join(k, 'specs', e.name, 'design.md')).matchAll(/^\| ([A-Z]{1,2}\d{1,2}) \|/gm)) props.add(`${e.name}:${m[1]}`);
  return { steering: steering.length, modes, feature, bugfix, hooks, hookFiles: hookFiles.length, triggers: [...triggers].sort(), agentHooks, commandHooks, skills, agents, mcp, adrs, powers, fieldReports, properties: props.size };
}

export function parseLog(text) {
  const entries = []; let cur = null;
  for (const line of text.split('\n')) {
    const h = /^## (\d{4}-\d{2}-\d{2}) (.+)$/.exec(line);
    if (h) { cur = { date: h[1], title: h[2].trim(), bullets: [] }; entries.push(cur); }
    else if (cur && /^- /.test(line)) cur.bullets.push(line.slice(2).trim());
  }
  return entries;
}

const clip = (s, n) => { const t = s.replace(/\*\*|`/g, '').replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1).replace(/\s\S*$/, '') + '...' : t; };

export function render(counts, entries, { max = 12 } = {}) {
  const c = counts;
  const rows = [
    ['Specs (requirements, design, tasks)', c.feature, '`.kiro/specs/`'],
    ['Bugfix specs', c.bugfix, '`.kiro/specs/bugfix-*`'],
    ['Steering files', `${c.steering} (always ${c.modes.always}, fileMatch ${c.modes.fileMatch}, auto ${c.modes.auto}, manual ${c.modes.manual})`, '`.kiro/steering/`'],
    ['Hooks', `${c.hooks} in ${c.hookFiles} files (${c.commandHooks} command, ${c.agentHooks} agent; triggers ${c.triggers.join(', ') || 'none'})`, '`.kiro/hooks/`'],
    ['Agent skills', c.skills, '`.kiro/skills/`'],
    ['Custom agents', c.agents, '`.kiro/agents/`'],
    ['MCP servers configured', c.mcp.length ? c.mcp.join(', ') : 'none', '`.kiro/settings/mcp.json`'],
    ['Power (Agent Plugin)', c.powers.length ? c.powers.join(', ') : 'none yet', '`powers/`'],
    ['Architecture decision records', c.adrs, '`docs/adr/`'],
    ['Properties named in design tables', c.properties, '`.kiro/specs/*/design.md`'],
    ['Daily field reports', c.fieldReports, '`docs/field/`'],
  ];
  const recent = entries.slice(-max);
  const lines = [
    BEGIN, '## How Kiro built this', '',
    'Counted from the repository by `.kiro/scripts/kiro-story.mjs`. Each row is a folder you can open.', '',
    '| What | Count | Where |', '|---|---|---|', ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`), '',
    `The full build log is \`docs/kiro-log.md\` (${entries.length} entries). The last ${recent.length}:`, '',
    ...recent.flatMap((e) => [`- **${e.date} ${clip(e.title, 90)}**` + (e.bullets[0] ? `: ${clip(e.bullets[0], 200)}` : '')]),
    '', END,
  ];
  return lines.join('\n');
}

const BLOCK = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
export const applyBlock = (doc, block) => (BLOCK.test(doc) ? doc.replace(BLOCK, () => block) : doc.replace(/\n*$/, '\n\n') + block + '\n');

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const root = path.resolve(get('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const block = render(countRepo(root), parseLog(read(path.join(root, 'docs', 'kiro-log.md'))), { max: Number(get('--entries')) || 12 });
  const w = get('--write'), c = get('--check');
  if (w) { const f = path.resolve(root, w); if (!existsSync(f)) { console.error(`${w} does not exist; the pitch-writer creates it first`); process.exit(1); } writeFileSync(f, applyBlock(read(f), block)); console.log(`updated ${w}`); }
  else if (c) { const f = path.resolve(root, c); const cur = (BLOCK.exec(read(f)) || [])[0]; if (cur === block) console.log('up to date'); else { console.error(`${c}: the generated block is ${cur ? 'out of date' : 'missing'}; run with --write`); process.exit(1); } }
  else console.log(block);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
