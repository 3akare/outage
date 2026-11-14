// Tests for mcp-check.mjs against a local mock MCP server (Streamable HTTP, JSON and SSE responses, sessions, auth).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = (cmd, args, opts) => promisify(execFile)(cmd, args, opts).then((r) => ({ status: 0, ...r }), (e) => ({ status: e.code, stdout: e.stdout, stderr: e.stderr }));
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkServer, checkConfig, expandEnv, parseRpcBody, KIRO_TOOL_NAME, SMOKE } from '../mcp-check.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mcp-check.mjs');
const FAKE_BEARER = 'abcdefghijklmnop' + 'qrstuvwxyz123456'; // assembled so this file holds no literal secret

/** Mock server: GET nothing; POST JSON-RPC. mode: 'sse' | 'json'. requires auth when `token` is set. */
function mockServer({ mode = 'sse', token = null, tools = [{ name: 'search_cloudflare_documentation' }, { name: 'extra_tool' }], answer = 'The alarm API lets a Durable Object schedule one alarm. '.repeat(3), session = true } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ headers: req.headers, body });
      if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401, { 'content-type': 'text/plain' }); return res.end('bad request: missing required Authorization header'); }
      const msg = JSON.parse(body);
      if (session && msg.method !== 'initialize' && req.headers['mcp-session-id'] !== 'sess-1') { res.writeHead(400); return res.end('missing session'); }
      const reply = (result) => {
        const payload = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result });
        const h = { ...(session ? { 'mcp-session-id': 'sess-1' } : {}) };
        if (mode === 'sse') { res.writeHead(200, { ...h, 'content-type': 'text/event-stream' }); res.end(`event: message\ndata: ${payload}\n\n`); }
        else { res.writeHead(200, { ...h, 'content-type': 'application/json' }); res.end(payload); }
      };
      if (msg.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '1.2.3' } });
      if (msg.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
      if (msg.method === 'tools/list') return reply({ tools });
      if (msg.method === 'tools/call') return reply({ content: [{ type: 'text', text: answer }] });
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/mcp` })));
}
const close = (s) => new Promise((r) => s.server.close(r));

test('expandEnv expands set variables and reports missing ones', () => {
  assert.deepEqual(expandEnv('Bearer ${T}', { T: 'x' }), { value: 'Bearer x', missing: [] });
  assert.deepEqual(expandEnv('Bearer ${T}', {}), { value: 'Bearer ${T}', missing: ['T'] });
  assert.deepEqual(expandEnv('a${A}b${B}', { A: '1', B: '' }).missing, ['B']);
});

test('parseRpcBody reads JSON and SSE, picks the matching id, ignores noise', () => {
  assert.deepEqual(parseRpcBody('{"jsonrpc":"2.0","id":2,"result":{"a":1}}', 'application/json', 2).result, { a: 1 });
  assert.equal(parseRpcBody('{"jsonrpc":"2.0","id":3,"result":{}}', 'application/json', 2), null);
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"ping","id":9}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n';
  assert.deepEqual(parseRpcBody(sse, 'text/event-stream; charset=utf-8', 2).result, { ok: true });
  assert.equal(parseRpcBody('not json', 'application/json', 1), null);
  assert.deepEqual(parseRpcBody('[{"id":1,"result":1},{"id":2,"result":2}]', 'application/json', 2).result, 2);
});

test('Kiro tool-name rule: hyphens are flagged as a note', () => {
  assert.ok(KIRO_TOOL_NAME.test('search_cloudflare_documentation'));
  assert.ok(!KIRO_TOOL_NAME.test('resolve-library-id'));
});

for (const mode of ['sse', 'json']) {
  test(`checkServer works over ${mode} responses with a session, lists tools and runs the smoke call`, async () => {
    const m = await mockServer({ mode });
    try {
      const r = await checkServer('cloudflare-docs', { url: m.url, autoApprove: ['search_cloudflare_documentation'], disabledTools: ['extra_tool'] });
      assert.equal(r.status, 'ok', JSON.stringify(r));
      assert.deepEqual(r.tools, ['search_cloudflare_documentation', 'extra_tool']);
      assert.equal(r.server, 'mock 1.2.3');
      assert.equal(r.smoke.ok, true);
      assert.ok(m.seen.filter((x) => x.headers['mcp-session-id'] === 'sess-1').length >= 3, 'session id is sent after initialize');
    } finally { await close(m); }
  });
}

test('checkServer: config naming a tool that does not exist is a failure', async () => {
  const m = await mockServer();
  try {
    const r = await checkServer('x', { url: m.url, autoApprove: ['no_such_tool'], disabledTools: ['also_missing'] });
    assert.equal(r.status, 'fail');
    assert.match(r.issues.join('\n'), /autoApprove names a tool the server does not have: no_such_tool/);
    assert.match(r.issues.join('\n'), /disabledTools names a tool the server does not have: also_missing/);
  } finally { await close(m); }
});

test('checkServer: the smoke call fails when the answer is useless, or the tool is missing', async () => {
  const m = await mockServer({ answer: 'ok' });
  try {
    const r = await checkServer('cloudflare-docs', { url: m.url });
    assert.equal(r.status, 'fail'); assert.match(r.issues.join(), /no useful answer/);
  } finally { await close(m); }
  const n = await mockServer({ tools: [{ name: 'other' }] });
  try { assert.match((await checkServer('cloudflare-docs', { url: n.url })).issues.join(), /is not offered/); } finally { await close(n); }
  const o = await mockServer({ answer: 'ok' });
  try { assert.equal((await checkServer('cloudflare-docs', { url: o.url }, { smoke: false })).status, 'ok'); } finally { await close(o); }
});

test('checkServer: env headers are expanded; missing env means skipped, never failed', async () => {
  const m = await mockServer({ token: 'sekret-token-value' });
  try {
    const cfg = { url: m.url, headers: { Authorization: 'Bearer ${MOCK_TOKEN}' } };
    const skipped = await checkServer('github', cfg, { env: {} });
    assert.equal(skipped.status, 'skipped'); assert.match(skipped.issues.join(), /MOCK_TOKEN/);
    assert.equal(m.seen.length, 0, 'no request is made without credentials');
    const ok = await checkServer('github', cfg, { env: { MOCK_TOKEN: 'sekret-token-value' } });
    assert.equal(ok.status, 'ok');
    const bad = await checkServer('github', cfg, { env: { MOCK_TOKEN: 'wrong' } });
    assert.equal(bad.status, 'fail'); assert.match(bad.issues.join(), /not authorized/);
  } finally { await close(m); }
});

test('checkServer: 401 without credentials, unreachable host, disabled and stdio servers', async () => {
  const m = await mockServer({ token: 't' });
  try { assert.match((await checkServer('x', { url: m.url })).issues.join(), /not authorized/); } finally { await close(m); }
  assert.equal((await checkServer('x', { url: 'http://127.0.0.1:1/mcp' }, { timeoutMs: 3000 })).status, 'fail');
  assert.equal((await checkServer('x', { url: 'https://example.invalid/mcp', disabled: true })).status, 'disabled');
  assert.equal((await checkServer('x', { command: 'npx', args: ['y'] })).status, 'skipped');
});

test('checkServer: literal secrets in headers and plain http are rejected without any request', async () => {
  const m = await mockServer();
  try {
    const lit = await checkServer('x', { url: m.url, headers: { Authorization: `Bearer ${FAKE_BEARER}` } });
    assert.equal(lit.status, 'fail'); assert.match(lit.issues.join(), /literal secret/);
    assert.equal(m.seen.length, 0);
  } finally { await close(m); }
  const plain = await checkServer('x', { url: 'http://example.com/mcp' });
  assert.equal(plain.status, 'fail'); assert.match(plain.issues.join(), /must be https/);
});

test('checkConfig filters by server and CLI exits 1 on a failure, 0 when all pass or are skipped', async () => {
  const m = await mockServer();
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'mcp-'));
    const f = path.join(dir, 'mcp.json');
    writeFileSync(f, JSON.stringify({ mcpServers: { good: { url: m.url }, gh: { url: m.url, headers: { Authorization: 'Bearer ${NOT_SET_ANYWHERE}' }, disabled: false } } }));
    const only = await checkConfig(JSON.parse(JSON.stringify({ mcpServers: { good: { url: m.url }, other: { url: m.url } } })), { only: 'good', smoke: false });
    assert.deepEqual(only.map((r) => r.name), ['good']);
    const ok = await run('node', [script, '--config', f, '--json'], { encoding: 'utf8', env: { ...process.env, NOT_SET_ANYWHERE: '' } });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout).map((r) => r.status), ['ok', 'skipped']);
    writeFileSync(f, JSON.stringify({ mcpServers: { bad: { url: m.url, autoApprove: ['nope'] } } }));
    assert.equal((await run('node', [script, '--config', f], { encoding: 'utf8' })).status, 1);
    assert.equal(spawnSync('node', [script, '--config', path.join(dir, 'missing.json')], { encoding: 'utf8' }).status, 1);
  } finally { await close(m); }
});

test('SMOKE queries are read-only documentation lookups for the project stack', () => {
  for (const [name, s] of Object.entries(SMOKE)) { assert.ok(s.tool && s.args && s.expect instanceof RegExp, name); assert.ok(!/delete|create|write|execute/i.test(s.tool), name); }
});

// ---------- mcp-call ----------
import { callTool, connect } from '../mcp-call.mjs';

test('mcp-call: calls a tool, expands env headers, refuses write-looking tools without --allow-write', async () => {
  const m = await mockServer({ token: 'tok-123', tools: [{ name: 'query_docs' }, { name: 'delete_all' }], answer: 'documentation answer' });
  try {
    const cfg = { url: m.url, headers: { Authorization: 'Bearer ${CALL_TOKEN}' } };
    const r = await callTool(cfg, 'query_docs', { q: 'x' }, { env: { CALL_TOKEN: 'tok-123' } });
    assert.deepEqual(r, { isError: false, text: 'documentation answer' });
    await assert.rejects(callTool(cfg, 'delete_all', {}, { env: { CALL_TOKEN: 'tok-123' } }), /refusing "delete_all"/);
    const allowed = await callTool(cfg, 'delete_all', {}, { env: { CALL_TOKEN: 'tok-123' }, allowWrite: true });
    assert.equal(allowed.isError, false);
    await assert.rejects(connect(cfg, {}), /environment variable not set: CALL_TOKEN/);
    await assert.rejects(connect({ command: 'npx' }), /only remote/);
  } finally { await close(m); }
});
