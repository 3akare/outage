// field-telemetry task 5 in the real Workers runtime: the TelemetryActor and its SQLite storage, the area actor's record
// hand-off, the admin endpoint and delete-my-data (no network, no account).
// https://developers.cloudflare.com/workers/testing/test-harness/get-started/
import { createTestHarness } from 'wrangler';
import type { DeviceDay, FieldDump } from '@outage/shared';
import fixture from '@outage/shared/fixtures/telemetry/device-day.json' with { type: 'json' };
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CELL, FIELD_BEARER, SECRET, wire } from './helpers.ts';

const server = createTestHarness({
  workers: [
    { configPath: './wrangler.jsonc', secrets: { INSTALL_TOKEN_SECRET: SECRET, FIELD_READ_TOKEN: FIELD_BEARER }, vars: { STATE_FLUSH_MS: '300' } },
  ],
});

beforeAll(async () => {
  await server.listen();
}, 120_000);
afterAll(async () => {
  await server.close();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (path: string, body: unknown, token?: string) =>
  server.fetch(path, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const admin = (day: string, token: string | null = FIELD_BEARER) =>
  server.fetch(`/v1/admin/field/${day}`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } });
const register = async () => (await (await server.fetch('/v1/register', { method: 'POST' })).json()) as { installId: string; token: string };
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('field telemetry in the Workers runtime', () => {
  it('F2 F8 R1.4 upload twice, read through the admin endpoint with aliases, then delete my data', async () => {
    const a = await register();
    const b = await register();
    const today = dayOf(Date.now());
    const day = (installId: string, over: Partial<DeviceDay> = {}) => ({ ...(fixture as DeviceDay), installId, day: today, ...over });

    expect((await call('/v1/telemetry', day(a.installId), a.token)).status).toBe(200);
    expect((await call('/v1/telemetry', day(a.installId, { armedMs: 1000 }), a.token)).status).toBe(200); // last wins
    expect((await call('/v1/telemetry', day(a.installId, { armedMs: 1000 }), a.token)).status).toBe(200); // duplicate
    expect((await call('/v1/telemetry', day(b.installId), b.token)).status).toBe(200);
    expect((await call('/v1/telemetry', day(b.installId), a.token)).status).toBe(401);

    expect((await admin(today, null)).status).toBe(401);
    expect((await admin(today, 'wrong')).status).toBe(401);
    const text = await (await admin(today)).text();
    expect(text).not.toContain(a.installId);
    expect(text).not.toContain(b.installId);
    const dump = JSON.parse(text) as FieldDump;
    expect(dump.devices).toHaveLength(2);
    expect(dump.devices.map((d) => d.alias).sort()).toEqual(['D1', 'D2']);
    expect(dump.devices.map((d) => d.armedMs).sort((x, y) => x - y)).toEqual([1000, (fixture as DeviceDay).armedMs]);

    const del = await call('/v1/delete', { installId: a.installId, cells: [CELL] }, a.token);
    expect(del.status).toBe(200);
    expect(((await del.json()) as { rows: number }).rows).toBeGreaterThanOrEqual(1);
    const after = (await (await admin(today)).json()) as FieldDump;
    expect(after.devices).toHaveLength(1);
  }, 60_000);

  it('R5 an outage the area actor confirms reaches the telemetry actor as counts only', async () => {
    const phones = await Promise.all(Array.from({ length: 6 }, register));
    const batch = (p: { installId: string }) => [
      { ...wire({ seq: 1, type: 'ARMED', elapsedMs: 40 * 60_000 }), installId: p.installId },
      { ...wire({ seq: 2, type: 'UNPLUG', elapsedMs: 1000 }), installId: p.installId },
    ];
    for (const p of phones) {
      const res = await call('/v1/events', { installId: p.installId, events: batch(p) }, p.token);
      expect(res.status).toBe(200);
    }
    let dump: FieldDump | null = null;
    for (let i = 0; i < 40 && !dump?.outages.length; i++) {
      await sleep(250);
      dump = (await (await admin(dayOf(Date.now()))).json()) as FieldDump;
    }
    expect(dump?.outages.length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(dump);
    for (const p of phones) expect(text).not.toContain(p.installId);
    expect(text).not.toContain(CELL);
    expect(dump?.outages[0]).toMatchObject({ kind: 'OUTAGE_RECORD', labelsYes: 0, labelsNo: 0 });
  }, 60_000);
});
