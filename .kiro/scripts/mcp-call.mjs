#!/usr/bin/env node
// Call one tool of a server from .kiro/settings/mcp.json from the shell. For sessions where the MCP servers are not attached
// to the agent (for example a Kiro Web workspace whose root is not this repository) and for CI. Read-only use: it refuses
// tool names that look like they change anything, unless --allow-write is passed.
// Usage: node .kiro/scripts/mcp-call.mjs <server> <tool> '<json arguments>' [--config file] [--raw]
//        node .kiro/scripts/mcp-call.mjs <server> --list
// Never put secrets, personal data or unpublished code in a query: documentation servers are third parties.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Rpc, expandEnv } from './mcp-check.mjs';

const WRITEY = /(^|_|-)(create|delete|update|write|execute|run|deploy|push|merge|add|remove|set)(_|-|$)/i;

export async function connect(cfg, env = process.env) {
  if (!cfg.url) throw new Error('only remote (URL) servers are supported');
  const headers = {}; const missing = [];
  for (const [k, v] of Object.entries(cfg.headers || {})) { const e = expandEnv(v, env); missing.push(...e.missing); headers[k] = e.value; }
  if (missing.length) throw new Error(`environment variable not set: ${[...new Set(missing)].join(', ')}`);
  const rpc = new Rpc(cfg.url, headers, 60000);
  await rpc.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'outage-mcp-call', version: '0.1.0' } });
  await rpc.notify('notifications/initialized');
  return rpc;
}

export async function callTool(cfg, tool, args, { allowWrite = false, env = process.env } = {}) {
  if (WRITEY.test(tool) && !allowWrite) throw new Error(`refusing "${tool}": the name suggests a change. Pass --allow-write after asking the human.`);
  const rpc = await connect(cfg, env);
  const out = await rpc.call('tools/call', { name: tool, arguments: args });
  return { isError: !!out.isError, text: (out.content || []).map((c) => c.text || '').join('\n') };
}

async function main() {
  const a = process.argv.slice(2);
  const pos = a.filter((x, i) => !x.startsWith('--') && a[i - 1] !== '--config');
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const [server, tool, json] = pos;
  const file = path.resolve(get('--config') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'settings', 'mcp.json'));
  if (!server) { console.error("usage: mcp-call.mjs <server> <tool> '<json>' | <server> --list"); process.exit(2); }
  const cfg = JSON.parse(readFileSync(file, 'utf8')).mcpServers?.[server];
  if (!cfg) { console.error(`no server "${server}" in ${file}`); process.exit(2); }
  try {
    if (a.includes('--list')) { const rpc = await connect(cfg); console.log(((await rpc.call('tools/list')).tools || []).map((t) => t.name).join('\n')); return; }
    const r = await callTool(cfg, tool, json ? JSON.parse(json) : {}, { allowWrite: a.includes('--allow-write') });
    console.log(r.text);
    process.exit(r.isError ? 1 : 0);
  } catch (e) { console.error('mcp-call: ' + e.message); process.exit(1); }
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
