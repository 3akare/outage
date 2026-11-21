// The deploy workflow's post-deploy check (.github/scripts/post-deploy-check.sh) against a local stub server.
// It must accept same-origin scripts and nonce-carrying inline elements, and fail on everything else.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../../.github/scripts/post-deploy-check.sh', import.meta.url));

function run(mode) {
  let n = 0;
  let base = '';
  const server = http.createServer((req, res) => {
    // /app and /judge are 301s to /app/simulate (ADR 0049); 'brokenRedirect' serves /app as a page instead.
    if ((req.url === '/app' || req.url === '/judge') && mode !== 'brokenRedirect') {
      res.writeHead(301, { location: `${base}/app/simulate`, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    if (req.url.startsWith('/js/')) {
      res.writeHead(200, { 'cache-control': mode === 'jsCached' ? 'public, max-age=3600' : 'no-cache' });
      res.end('1');
      return;
    }
    const nonce = mode === 'repeat' ? 'fixed' : `n${n++}`;
    const body = {
      ok: `<script nonce="${nonce}">1</script><style nonce="${nonce}">a{}</style><link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script>`,
      sameOriginOnly: '<link rel="stylesheet" href="/app.css"><script src="/app.js" defer></script>',
      inlineNoNonce: '<script>1</script>',
      styleNoNonce: '<style>a{}</style>',
      wrongNonce: '<script nonce="other">1</script>',
      placeholder: `<script nonce="${nonce}">__OUTAGE_NONCE__</script>`,
      external: '<script src="https://x.test/a.js"></script>',
      protocolRelative: '<script src="//x.test/a.js"></script>',
      repeat: '<script src="/app.js"></script>',
      jsCached: '<script src="/app.js"></script>',
      brokenRedirect: '<script src="/app.js"></script>',
    }[mode];
    res.writeHead(200, {
      'cache-control': 'public, max-age=1, s-maxage=1',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}' 'self'`,
    });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      execFile(script, { env: { ...process.env, URL: base } }, (err) => {
        server.close();
        resolve(err ? err.code : 0);
      });
    });
  });
}

for (const mode of ['ok', 'sameOriginOnly']) test(`post-deploy check passes: ${mode}`, async () => assert.equal(await run(mode), 0));
for (const mode of ['inlineNoNonce', 'styleNoNonce', 'wrongNonce', 'placeholder', 'external', 'protocolRelative', 'repeat', 'brokenRedirect', 'jsCached']) {
  test(`post-deploy check fails: ${mode}`, async () => assert.notEqual(await run(mode), 0));
}
