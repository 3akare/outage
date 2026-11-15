// Runs the real Worker, both Durable Objects and their SQLite storage in the local Workers runtime (no network, no account).
// https://developers.cloudflare.com/workers/testing/test-harness/get-started/
import { createTestHarness } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cellToParent } from 'h3-js';
import { CELL, wire } from './helpers.ts';

const server = createTestHarness({
  workers: [{ configPath: './wrangler.jsonc', secrets: { INSTALL_TOKEN_SECRET: 'test-secret' }, vars: { STATE_FLUSH_MS: '300' } }],
});

beforeAll(async () => {
  await server.listen();
}, 120_000);
afterAll(async () => {
  await server.close();
});

const OTHER_CELL = '88589c986bfffff'; // different res-7 parent than CELL
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (path: string, body: unknown, token?: string) =>
  server.fetch(path, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });

describe('R7 R8 R12 Worker and area actors in the Workers runtime', () => {
  it('R7.1 R7.2 R5 R11 R12.1 register, ingest to two parents, duplicates, flush alarm, stats, delete, revoked', async () => {
    const reg = await server.fetch('/v1/register', { method: 'POST' });
    expect(reg.status).toBe(200);
    const { installId, token } = (await reg.json()) as { installId: string; token: string };
    const ev = (over: Record<string, unknown>) => ({ ...wire({ seq: 0 }), installId, ...over });

    const events = [
      ev({ seq: 1, type: 'ARMED' }),
      ev({ seq: 2, type: 'UNPLUG', elapsedMs: 2000 }),
      { ...ev({ seq: 3, type: 'LABEL' }), confidence: 'HIGH', refSeq: 2, answer: 'YES' },
      ev({ seq: 4, type: 'REPLUG', cell: OTHER_CELL }),
      ev({ seq: 5, cell: 'bad-cell' }),
    ];
    const first = await call('/v1/events', { installId, events }, token);
    expect(first.status).toBe(200);
    const body = (await first.json()) as { results: { seq: number; status: string; code?: string }[] };
    expect(body.results.map((r) => r.status)).toEqual(['accepted', 'accepted', 'accepted', 'accepted', 'rejected']);
    expect(body.results[4].code).toBe('BAD_CELL');

    // The detection rows are in SQLite: the primary key answers a resend with duplicate.
    const again = (await (await call('/v1/events', { installId, events }, token)).json()) as typeof body;
    expect(again.results.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate', 'rejected']);

    expect((await call('/v1/events', { installId, events }, 'wrong')).status).toBe(401);
    expect(CELL).not.toBe(OTHER_CELL);

    // The 300 ms flush alarm writes the armed row and reports usage to the registry. Each area actor reports on its
    // own alarm, and an alarm can fire between the first and second POST above, so usage arrives in several reports.
    // Wait until every counter this test asserts on has landed, not just until the first report.
    let stats: { rowsWritten: number; counters: Record<string, number> } = { rowsWritten: 0, counters: {} };
    const reported = () => stats.rowsWritten > 0 && stats.counters['type.UNPLUG'] === 1 && (stats.counters['result.duplicate'] ?? 0) >= 3;
    for (let i = 0; i < 40 && !reported(); i++) {
      await sleep(250);
      stats = (await (await server.fetch('/v1/stats')).json()) as typeof stats;
    }
    expect(stats.rowsWritten).toBeGreaterThan(0);
    expect(stats.counters['type.UNPLUG']).toBe(1);
    expect(stats.counters['result.duplicate']).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(stats)).not.toContain(installId);

    // area-cells task 10: the area model is written behind into SQLite, and holds the install until delete-my-data.
    const modelRows = async () => {
      const sql = await server.getWorker('outage-api').getDurableObjectStorage('AREA', { name: cellToParent(CELL, 7) });
      return (await sql.exec('SELECT tbl, key, part, json FROM area_model')) as { json: string }[];
    };
    let rows: { json: string }[] = [];
    for (let i = 0; i < 40 && rows.length === 0; i++) {
      await sleep(250);
      rows = await modelRows();
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).toContain(installId);

    // Delete: 3 detection rows (UNPLUG, LABEL, REPLUG) and the flushed armed row, in both parents.
    const del = await call('/v1/delete', { installId, cells: [CELL, OTHER_CELL] }, token);
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true, areas: 2, rows: 4 });
    expect(JSON.stringify(await modelRows())).not.toContain(installId);
    expect((await call('/v1/events', { installId, events: [ev({ seq: 9 })] }, token)).status).toBe(401);
    // A retried delete still works and finds nothing left.
    const retry = await call('/v1/delete', { installId, cells: [CELL, OTHER_CELL] }, token);
    expect(await retry.json()).toEqual({ deleted: true, areas: 2, rows: 0 });
  }, 60_000);

  it('R8.4 R2.3 request-level errors in the runtime', async () => {
    expect((await server.fetch('/v1/events', { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await call('/v1/events', { installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa', events: [] })).status).toBe(401);
    expect((await server.fetch('/v1/nothing')).status).toBe(404);
    // web-and-area-pages task 8: public site routes in the runtime, reading the PublicIndex actor.
    expect((await server.fetch('/robots.txt')).status).toBe(200);
    expect((await server.fetch('/', { method: 'POST' })).status).toBe(405);
    const map = await server.fetch('/api/v1/public/map');
    expect(map.status).toBe(200);
    expect(await map.json()).toEqual({ areas: [] });
    expect((await server.fetch('/area/nowhere')).status).toBe(404);
  });
});

describe('home-watch pairing shards in the Workers runtime (ADR 0009)', () => {
  const register = async () => (await (await server.fetch('/v1/register', { method: 'POST' })).json()) as { installId: string; token: string };
  const claimBody = (installId: string, code: string) => ({
    installId,
    code,
    fcmToken: 'fcm-1',
    quietStartMin: 0,
    quietEndMin: 0,
    tzOffsetMin: 0,
  });

  it('H5_pairing_rules H8_delete_removes_pairs offer, wrong claims, claim, remove, delete against real SQLite', async () => {
    const station = await register();
    const viewer = await register();
    const offer = await call('/v1/pair/offer', { installId: station.installId }, station.token);
    expect(offer.status).toBe(200);
    const { code } = (await offer.json()) as { code: string };
    const wrong = `${code.slice(0, 4)}${code.slice(4) === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA'}`;
    const bad = await call('/v1/pair/claim', claimBody(viewer.installId, wrong), viewer.token);
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual({ error: 'not_found' });

    const ok = await call('/v1/pair/claim', claimBody(viewer.installId, code), viewer.token);
    expect(ok.status).toBe(200);
    const { pairId } = (await ok.json()) as { pairId: string };
    expect((await call('/v1/pair/claim', claimBody(viewer.installId, code), viewer.token)).status).toBe(404); // used once

    const shardSql = async () => server.getWorker('outage-api').getDurableObjectStorage('PAIRING', { name: code.slice(0, 2) });
    const pairRows = async () => ((await (await shardSql()).exec('SELECT pair_id, fcm_token FROM pair')) as { pair_id: string }[]).map((r) => r.pair_id);
    expect(await pairRows()).toEqual([pairId]);

    expect((await call('/v1/pair/remove', { installId: viewer.installId, pairId }, viewer.token)).status).toBe(200);
    expect(await pairRows()).toEqual([]);

    // A second pair, then the station deletes its data: offers and pairs go.
    const again = (await (await call('/v1/pair/offer', { installId: station.installId }, station.token)).json()) as { code: string };
    const second = (await (await call('/v1/pair/claim', claimBody(viewer.installId, again.code), viewer.token)).json()) as { pairId: string };
    expect(await pairRows()).toEqual([second.pairId]);
    const del = await call('/v1/delete', { installId: station.installId, cells: [] }, station.token);
    expect(del.status).toBe(200);
    expect(await pairRows()).toEqual([]);
  }, 60_000);
});
