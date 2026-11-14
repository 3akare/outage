import { describe, expect, it } from 'vitest';
import sample from '../../contract/sample-export.json';
import { type Device, type Export, handle, LIMITS, type Row, type Store, tokenOk } from '../src/handler';

/** In-memory store with the same (alias, id) idempotency as the SQLite table. */
function memoryStore(): Store & { rows: Map<string, Row> } {
  const devices = new Map<string, Device>();
  const rows = new Map<string, Row>();
  return {
    rows,
    async insert(device, list) {
      devices.set(device.alias, device);
      let accepted = 0;
      for (const r of list) { const k = `${device.alias}/${r.id}`; if (!rows.has(k)) { rows.set(k, r); accepted++; } }
      return { accepted, duplicates: list.length - accepted };
    },
    async exportAll(): Promise<Export> {
      return { version: 1, devices: [...devices.values()].map((device) => ({ device, rows: [...rows.entries()].filter(([k]) => k.startsWith(`${device.alias}/`)).map(([, r]) => r).sort((a, b) => a.id - b.id) })) };
    },
  };
}
const SECRET = 'test-secret';
const auth = { authorization: `Bearer ${SECRET}` };
const post = (body: unknown, headers: Record<string, string> = auth) => new Request('https://x/probe/events', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const upload = { device: sample.devices[0].device, rows: sample.devices[0].rows };

describe('R3 probe Worker', () => {
  it('R3.1 stores a batch and exports it back unchanged in the contract shape (shared sample)', async () => {
    const s = memoryStore();
    const r = await handle(post(upload), s, SECRET);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ accepted: 10, duplicates: 0 });
    const e = await handle(new Request('https://x/probe/export', { headers: auth }), s, SECRET);
    expect(await e.json()).toEqual(sample);
  });

  it('R3.1 a retried upload is harmless: the same (alias, id) is stored once', async () => {
    const s = memoryStore();
    await handle(post(upload), s, SECRET);
    const again = await handle(post(upload), s, SECRET);
    expect(await again.json()).toEqual({ accepted: 0, duplicates: 10 });
    expect(s.rows.size).toBe(10);
  });

  it('R3.2 R3.3 every route needs the token; a missing secret never opens the endpoint', async () => {
    const s = memoryStore();
    expect((await handle(post(upload, {}), s, SECRET)).status).toBe(401);
    expect((await handle(post(upload, { authorization: 'Bearer wrong' }), s, SECRET)).status).toBe(401);
    expect((await handle(new Request('https://x/probe/export'), s, SECRET)).status).toBe(401);
    expect((await handle(post(upload), s, undefined)).status).toBe(503);
    expect((await handle(post(upload), s, '')).status).toBe(503);
    expect(s.rows.size).toBe(0);
    expect(await tokenOk(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(await tokenOk(SECRET, SECRET)).toBe(false); // no Bearer prefix
  });

  it('R3.1 R7.3 refuses bad input as a whole batch, so the phone keeps and resends it', async () => {
    const s = memoryStore();
    const bad = async (body: unknown) => (await handle(post(body), s, SECRET)).status;
    expect(await bad('not json')).toBe(400);
    expect(await bad({ device: { ...upload.device, alias: 'Ada Lovelace' }, rows: [] })).toBe(400); // aliases only, never a name
    expect(await bad({ device: upload.device, rows: [{ ...upload.rows[0], kind: 'LOCATION' }] })).toBe(400);
    expect(await bad({ device: upload.device, rows: [upload.rows[0], { ...upload.rows[1], fields: { nested: { a: 1 } } }] })).toBe(400);
    expect(await bad({ device: upload.device, rows: Array.from({ length: LIMITS.rows + 1 }, (_, i) => ({ ...upload.rows[0], id: i })) })).toBe(413);
    expect(s.rows.size).toBe(0);
  });

  it('routes: unknown paths are 404, wrong methods 405', async () => {
    const s = memoryStore();
    expect((await handle(new Request('https://x/'), s, SECRET)).status).toBe(404);
    expect((await handle(new Request('https://x/probe/events', { headers: auth }), s, SECRET)).status).toBe(405);
    expect((await handle(new Request('https://x/probe/export', { method: 'POST', headers: auth, body: '{}' }), s, SECRET)).status).toBe(405);
  });
});
