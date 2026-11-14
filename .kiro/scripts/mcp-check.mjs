#!/usr/bin/env node
// Verify the MCP servers in .kiro/settings/mcp.json for real: connect, initialize, list tools, check that the config
// (autoApprove, disabledTools) names tools that exist, check for literal secrets, and run one smoke call per server.
// Plain Node 20+ (global fetch), no dependencies. MCP Streamable HTTP: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
// Usage: node .kiro/scripts/mcp-check.mjs [--config .kiro/settings/mcp.json] [--server name] [--include-disabled] [--no-smoke] [--json]
// Exit 0: every enabled server with its credentials present works. Exit 1: a server failed. Servers that are disabled or
// whose ${ENV} variable is not set are reported as skipped, not as failures.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from './scan.mjs';

const PROTOCOL = '2025-06-18';
// Kiro rejects MCP tool names outside this pattern (https://kiro.dev/docs/mcp/ troubleshooting). We report, not fail:
// the hyphenated Context7 names are widely used with Kiro, so Kiro may sanitize them; confirm in the MCP panel.
export const KIRO_TOOL_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** One smoke call per known server. Read-only documentation queries about this project's own stack. */
export const SMOKE = {
  'cloudflare-docs': { tool: 'search_cloudflare_documentation', args: { query: 'Durable Objects alarm API setAlarm' }, expect: /alarm/i },
  context7: { tool: 'resolve-library-id', args: { libraryName: 'fast-check', query: 'property-based testing numRuns seed' }, expect: /fast-check/i },
};

export function expandEnv(text, env) {
  const missing = [];
  const value = String(text).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => {
    if (env[name] === undefined || env[name] === '') { missing.push(name); return m; }
    return env[name];
  });
  return { value, missing };
}

/** A JSON-RPC response may arrive as JSON or as a Server-Sent Events stream. Return the message with the given id. */
export function parseRpcBody(text, contentType, id) {
  const wanted = (m) => m && typeof m === 'object' && m.id === id;
  if (/text\/event-stream/i.test(contentType || '')) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { const m = JSON.parse(data); if (wanted(m)) return m; } catch { /* keep looking */ }
    }
    return null;
  }
  try {
    const m = JSON.parse(text);
    if (Array.isArray(m)) return m.find(wanted) || null;
    return wanted(m) ? m : null;
  } catch { return null; }
}

export class Rpc {
  constructor(url, headers, timeoutMs) { this.url = url; this.headers = headers; this.timeoutMs = timeoutMs; this.session = null; this.nextId = 1; }
  async send(body, expectId) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...this.headers };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    const res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 120).replace(/\s+/g, ' ')}`), { http: res.status });
    if (expectId === undefined) return null;
    const msg = parseRpcBody(text, res.headers.get('content-type'), expectId);
    if (!msg) throw new Error('no JSON-RPC response with the expected id');
    if (msg.error) throw new Error(`JSON-RPC error ${msg.error.code}: ${msg.error.message}`);
    return msg.result;
  }
  call(method, params = {}) { const id = this.nextId++; return this.send({ jsonrpc: '2.0', id, method, params }, id); }
  notify(method, params = {}) { return this.send({ jsonrpc: '2.0', method, params }); }
}

export async function checkServer(name, cfg, { env = process.env, includeDisabled = false, smoke = true, timeoutMs = 30000 } = {}) {
  const r = { name, status: 'ok', url: cfg.url || null, server: null, tools: [], issues: [], smoke: null };
  const fail = (m) => { r.status = 'fail'; r.issues.push(m); };

  if (!cfg.url) { r.status = 'skipped'; r.issues.push('stdio server: this checker only tests remote (URL) servers'); return r; }
  if (cfg.disabled && !includeDisabled) { r.status = 'disabled'; return r; }
  let u; try { u = new URL(cfg.url); } catch { fail('url is not a valid URL'); return r; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) fail('url must be https (http only for localhost)');

  // no literal secrets in the committed config; values must come from ${ENV}
  const headers = {}; const missing = [];
  for (const [k, v] of Object.entries(cfg.headers || {})) {
    const found = findSecrets(`${k}: ${v}`);
    if (found.length) fail(`header ${k} holds a literal secret (${found[0].rule}); use \${ENV_VAR}`);
    const e = expandEnv(v, env); missing.push(...e.missing); headers[k] = e.value;
  }
  if (r.status === 'fail') return r;
  if (missing.length) { r.status = 'skipped'; r.issues.push(`environment variable not set: ${[...new Set(missing)].join(', ')}`); return r; }

  const rpc = new Rpc(cfg.url, headers, timeoutMs);
  try {
    const init = await rpc.call('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'outage-mcp-check', version: '0.1.0' } });
    r.server = `${init.serverInfo?.name || '?'} ${init.serverInfo?.version || ''}`.trim();
    await rpc.notify('notifications/initialized');
    const list = await rpc.call('tools/list');
    r.tools = (list.tools || []).map((t) => t.name);
    if (!r.tools.length) fail('server lists no tools');
  } catch (e) {
    fail(e.http === 401 || e.http === 403 ? `not authorized (${e.message})` : `cannot connect: ${e.message}`);
    return r;
  }

  for (const t of cfg.autoApprove || []) if (t !== '*' && !r.tools.includes(t)) fail(`autoApprove names a tool the server does not have: ${t}`);
  for (const t of cfg.disabledTools || []) if (!r.tools.includes(t)) fail(`disabledTools names a tool the server does not have: ${t}`);
  const odd = r.tools.filter((t) => !KIRO_TOOL_NAME.test(t));
  if (odd.length) r.issues.push(`note: Kiro only accepts tool names like ^[a-zA-Z][a-zA-Z0-9_]*$; check the MCP panel shows: ${odd.join(', ')}`);

  const s = smoke && SMOKE[name];
  if (s) {
    if (!r.tools.includes(s.tool)) fail(`smoke tool ${s.tool} is not offered by the server`);
    else {
      try {
        const out = await rpc.call('tools/call', { name: s.tool, arguments: s.args });
        const text = (out.content || []).map((c) => c.text || '').join('\n');
        const ok = !out.isError && text.length > 40 && s.expect.test(text);
        r.smoke = { tool: s.tool, ok, chars: text.length, sample: text.slice(0, 160).replace(/\s+/g, ' ') };
        if (!ok) fail(`smoke call ${s.tool} returned ${out.isError ? 'an error' : 'no useful answer'}`);
      } catch (e) { fail(`smoke call ${s.tool} failed: ${e.message}`); }
    }
  }
  return r;
}

export async function checkConfig(config, opts = {}) {
  const servers = Object.entries(config.mcpServers || {}).filter(([n]) => !opts.only || n === opts.only);
  const out = [];
  for (const [name, cfg] of servers) out.push(await checkServer(name, cfg, opts));
  return out;
}

async function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(get('--config') || path.join(here, '..', 'settings', 'mcp.json'));
  let config;
  try { config = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(1); }
  const results = await checkConfig(config, { only: get('--server'), includeDisabled: a.includes('--include-disabled'), smoke: !a.includes('--no-smoke') });
  if (a.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.status.toUpperCase().padEnd(8)} ${r.name.padEnd(16)} ${r.server || ''}  tools: ${r.tools.join(', ') || '-'}`);
      if (r.smoke) console.log(`         smoke ${r.smoke.tool}: ${r.smoke.ok ? 'ok' : 'FAILED'} (${r.smoke.chars} chars) ${r.smoke.sample}`);
      for (const i of r.issues) console.log(`         - ${i}`);
    }
  }
  process.exit(results.some((r) => r.status === 'fail') ? 1 : 0);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
