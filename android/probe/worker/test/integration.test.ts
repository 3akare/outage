// Runs the real Worker and the SQLite Durable Object in the local Workers runtime (no network, no account).
// https://developers.cloudflare.com/workers/testing/test-harness/get-started/
import { createTestHarness } from 'wrangler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import sample from '../../contract/sample-export.json';

const TOKEN = 'test-token';
const server = createTestHarness({ workers: [{ configPath: './wrangler.jsonc', secrets: { PROBE_TOKEN: TOKEN } }] });
const auth = { authorization: `Bearer ${TOKEN}` };
const upload = JSON.stringify({ device: sample.devices[0].device, rows: sample.devices[0].rows });

beforeAll(async () => { await server.listen(); }, 120_000);
afterEach(async () => { await server.reset(); });
afterAll(async () => { await server.close(); });

describe('R3 probe Worker in the Workers runtime', () => {
  it('R3.1 SQLite store: insert, idempotent retry, export equals the shared sample', async () => {
    const first = await server.fetch('/probe/events', { method: 'POST', headers: auth, body: upload });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ accepted: 10, duplicates: 0 });
    const again = await server.fetch('/probe/events', { method: 'POST', headers: auth, body: upload });
    expect(await again.json()).toEqual({ accepted: 0, duplicates: 10 });
    const exp = await server.fetch('/probe/export', { headers: auth });
    expect(await exp.json()).toEqual(sample);
  });

  it('R3.2 the token is required in the runtime too', async () => {
    expect((await server.fetch('/probe/export')).status).toBe(401);
    expect((await server.fetch('/probe/events', { method: 'POST', headers: { authorization: 'Bearer nope' }, body: upload })).status).toBe(401);
  });
});
