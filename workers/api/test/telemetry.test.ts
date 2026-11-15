// field-telemetry task 5: POST /v1/telemetry, the telemetry store, GET /v1/admin/field/:day, delete-my-data.
// Property IDs F2 (server part) and F8 from .kiro/specs/field-telemetry/design.md section 9.
import fc from 'fast-check';
import fixture from '@outage/shared/fixtures/telemetry/device-day.json' with { type: 'json' };
import type { DeviceDay, FieldDump, FieldRecord, OutageRecordOut } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';
import { handleRequest } from '../src/ingest/handlers.ts';
import { dayAcceptable, dayStartMs, fieldDump, recordFieldRecords } from '../src/telemetry/core.ts';
import { FIELD_BEARER, ID, makeWorld, NOW, post, ROOMY, tokenFor } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';
import { MemoryTelemetryStore } from './telemetry-store.ts';

const DAY_MS = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const TODAY = dayOf(NOW);
const YESTERDAY = dayOf(NOW - DAY_MS);
const ID2 = 'aaaaaaaaaaaaaaaaaaaaaaaaab';
const ID3 = 'bbbbbbbbbbbbbbbbbbbbbbbbbc';

const base = (over: Partial<DeviceDay> = {}): DeviceDay => ({
  ...(fixture as DeviceDay),
  installId: ID,
  day: YESTERDAY,
  ...over,
});
const upload = async (world: ReturnType<typeof makeWorld>, d: unknown, id = ID) =>
  handleRequest(await post('/v1/telemetry', d, await tokenFor(id)), world.deps);
const admin = (world: ReturnType<typeof makeWorld>, day: string, token: string | null = FIELD_BEARER, method = 'GET') =>
  handleRequest(
    new Request(`https://api.test/v1/admin/field/${day}`, {
      method,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
    world.deps,
  );

describe('F2_upload_idempotent (server part)', () => {
  it('R2.5 R3.1 any number of uploads for one install and day leave one row equal to the last, each answered accepted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            armed: fc.integer({ min: 0, max: 36_000_000 }),
            jobs: fc.array(fc.nat({ max: 90_000 }), { maxLength: 8 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.nat({ max: 3 }),
        async (ups, repeats) => {
          const world = makeWorld(ROOMY);
          let last: DeviceDay = base();
          for (const u of ups) {
            last = base({ armedMs: u.armed, delayJobMs: u.jobs });
            for (let i = 0; i <= repeats; i++) {
              const res = await upload(world, last);
              expect(res.status).toBe(200);
              expect(await res.json()).toEqual({ status: 'accepted' });
            }
          }
          expect(world.telemetryStore.days.size).toBe(1);
          expect(world.telemetryStore.all()[0]).toEqual(last);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R2.5 a different day or install is a different row', async () => {
    const world = makeWorld(ROOMY);
    await upload(world, base());
    await upload(world, base({ day: TODAY }));
    await upload(world, base({ installId: ID2 }), ID2);
    expect(world.telemetryStore.days.size).toBe(3);
  });

  it('R3.4 a field outside the schema is rejected and nothing is stored', async () => {
    const world = makeWorld(ROOMY);
    for (const extra of [{ lat: 6.5 }, { cell: '88' }, { model: 'TECNO KJ5' }, { ts: 1 }]) {
      const res = await upload(world, { ...base(), ...extra });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'malformed', code: 'UNKNOWN_FIELD' });
    }
    const nested = await upload(world, { ...base(), prompts: { ...base().prompts, who: 'x' } });
    expect(nested.status).toBe(400);
    expect((await upload(world, 'not json')).status).toBe(400);
    expect(world.telemetryStore.count()).toBe(0);
  });

  it('R3.1 the install token decides who uploads: missing, wrong, other install and revoked all get 401', async () => {
    const world = makeWorld(ROOMY);
    expect((await handleRequest(await post('/v1/telemetry', base()), world.deps)).status).toBe(401);
    expect((await handleRequest(await post('/v1/telemetry', base(), 'nope'), world.deps)).status).toBe(401);
    expect((await upload(world, base(), ID2)).status).toBe(401);
    world.revoked.add(ID);
    expect((await upload(world, base())).status).toBe(401);
    expect(world.telemetryStore.count()).toBe(0);
  });

  it('R3.3 an install is limited per hour, another install is not, and the window reopens', async () => {
    const world = makeWorld({ ...ROOMY, TELEMETRY_PER_INSTALL_PER_HOUR: 2 });
    expect((await upload(world, base())).status).toBe(200);
    expect((await upload(world, base())).status).toBe(200);
    const limited = await upload(world, base());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect((await upload(world, base({ installId: ID2 }), ID2)).status).toBe(200);
    world.now += 3_600_000;
    expect((await upload(world, base())).status).toBe(200);
  });

  it('R3 the day must be a real date near today (not older than retention, not more than a day ahead)', async () => {
    const world = makeWorld(ROOMY);
    for (const day of [dayOf(NOW - 91 * DAY_MS), dayOf(NOW + 3 * DAY_MS)]) {
      const res = await upload(world, base({ day }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_day' });
    }
    expect((await upload(world, base({ day: dayOf(NOW + DAY_MS / 2) }))).status).toBe(200);
    expect(dayAcceptable('2027-02-30', NOW, CONFIG.TELEMETRY_RETENTION_MS)).toBe(false);
    expect(dayStartMs('2027-02-30')).toBeNull();
  });

  it('R3 only POST, and a body over the limit is refused', async () => {
    const world = makeWorld(ROOMY);
    const get = await handleRequest(new Request('https://api.test/v1/telemetry'), world.deps);
    expect(get.status).toBe(405);
    const big = await handleRequest(
      await post('/v1/telemetry', 'x'.repeat(ROOMY.MAX_BODY_BYTES + 1), await tokenFor()),
      world.deps,
    );
    expect(big.status).toBe(413);
  });
});

describe('R1.4 delete my data removes the install device-days', () => {
  it('removes this install only and counts the rows', async () => {
    const world = makeWorld(ROOMY);
    await upload(world, base());
    await upload(world, base({ day: TODAY }));
    await upload(world, base({ installId: ID2 }), ID2);
    const res = await handleRequest(
      await post('/v1/delete', { installId: ID, cells: [] }, await tokenFor()),
      world.deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true, rows: 2 });
    expect(world.telemetryStore.all().map((d) => d.installId)).toEqual([ID2]);
    expect((await upload(world, base())).status).toBe(401); // revoked: a late upload cannot bring the rows back
  });
});

describe('F8_admin_auth_and_aliases', () => {
  it('R7.5 a missing, empty, wrong or look-alike token is rejected and nothing is returned', async () => {
    const world = makeWorld(ROOMY);
    await upload(world, base());
    for (const t of [null, '', 'wrong', `${FIELD_BEARER}x`, FIELD_BEARER.slice(1), FIELD_BEARER.toUpperCase()]) {
      const res = await admin(world, YESTERDAY, t);
      expect(res.status).toBe(401);
      expect(await res.text()).toBe('{"error":"unauthorized"}');
    }
    // The install token is not the field token.
    expect((await admin(world, YESTERDAY, await tokenFor())).status).toBe(401);
    expect((await admin(world, YESTERDAY)).status).toBe(200);
  });

  it('R7.5 an unset field token turns the endpoint off, and the answer names no value', async () => {
    const world = makeWorld(ROOMY);
    world.deps.fieldToken = undefined;
    const res = await admin(world, YESTERDAY, 'anything');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_not_configured' });
  });

  it('R7.3 only GET, and the day must be a real date (checked after the token)', async () => {
    const world = makeWorld(ROOMY);
    expect((await admin(world, YESTERDAY, FIELD_BEARER, 'POST')).status).toBe(405);
    expect((await admin(world, '2027-02-30')).status).toBe(400);
    expect((await admin(world, 'yesterday')).status).toBe(400);
    expect((await admin(world, '2027-02-30', null)).status).toBe(401);
    expect((await admin(world, `${YESTERDAY}/extra`)).status).toBe(400);
  });

  it('R6.6 the answer never holds an install ID; aliases are D1.. in install ID order and stable for a request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.stringMatching(/^[a-z2-7]{26}$/), { minLength: 1, maxLength: 6 }),
        fc.uniqueArray(fc.stringMatching(/^[a-z2-7]{26}$/), { minLength: 0, maxLength: 3 }),
        async (ids, quiet) => {
          const world = makeWorld(ROOMY);
          const silentIds = quiet.filter((q) => !ids.includes(q));
          for (const id of ids) expect((await upload(world, base({ installId: id }), id)).status).toBe(200);
          for (const id of silentIds) {
            expect((await upload(world, base({ installId: id, day: dayOf(NOW - 3 * DAY_MS) }), id)).status).toBe(200);
          }
          const res = await admin(world, YESTERDAY);
          const text = await res.text();
          for (const id of [...ids, ...silentIds]) expect(text).not.toContain(id);
          const dump = JSON.parse(text) as FieldDump;
          expect(dump.devices.map((d) => d.alias)).toHaveLength(ids.length);
          expect(dump.silent).toHaveLength(silentIds.length);
          const aliases = [...dump.devices, ...dump.silent].map((d) => d.alias);
          expect(new Set(aliases).size).toBe(aliases.length);
          expect([...aliases].sort()).toEqual(Array.from({ length: aliases.length }, (_, i) => `D${i + 1}`).sort());
          expect(JSON.stringify(dump)).not.toMatch(/installId/);
          expect(await (await admin(world, YESTERDAY)).text()).toBe(text); // same data, same answer
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('R6.6 aliases follow the sorted install IDs, so the alias map is not stored and not needed', async () => {
    const world = makeWorld(ROOMY);
    await upload(world, base({ installId: ID3 }), ID3);
    await upload(world, base({ installId: ID2 }), ID2);
    const dump = (await (await admin(world, YESTERDAY)).json()) as FieldDump;
    expect(dump.devices.map((d) => [d.alias, d.mode.normalMs])).toEqual([
      ['D1', base().mode.normalMs],
      ['D2', base().mode.normalMs],
    ]);
    expect(
      world.telemetryStore
        .all()
        .map((d) => d.installId)
        .sort(),
    ).toEqual([ID2, ID3]);
  });
});

describe('R5 R6 R8 field dump contents', () => {
  const outage = (over: Partial<OutageRecordOut> = {}): OutageRecordOut => ({
    kind: 'OUTAGE_RECORD',
    key: 'abcdef0123456789',
    scopeClass: 'PARENT',
    startMs: Date.parse(`${YESTERDAY}T10:00:00Z`),
    endMs: null,
    level: 'CONFIRMED',
    drops: 3,
    armedN: 4,
    labelsYes: 1,
    labelsNo: 0,
    labelsNone: 2,
    confirmedMs: Date.parse(`${YESTERDAY}T10:02:00Z`),
    withdrawn: false,
    ...over,
  });

  it('R5.1 a changed outage record replaces the earlier one by key; a miss is kept once', () => {
    const store = new MemoryTelemetryStore();
    const recs: FieldRecord[] = [
      outage(),
      outage({ labelsYes: 2, labelsNone: 1 }),
      { kind: 'MISS', atMs: Date.parse(`${YESTERDAY}T11:00:00Z`), armedN: 3 },
      { kind: 'MISS', atMs: Date.parse(`${YESTERDAY}T11:00:00Z`), armedN: 3 },
    ];
    recordFieldRecords(store, recs, NOW);
    const dump = fieldDump(store, YESTERDAY, 7) as FieldDump;
    expect(dump.outages).toHaveLength(1);
    expect(dump.outages[0].labelsYes).toBe(2);
    expect(dump.misses).toHaveLength(1);
  });

  it('R6.1 outages and misses are listed by the UTC day they started, and nothing else leaks in', () => {
    const store = new MemoryTelemetryStore();
    recordFieldRecords(
      store,
      [
        outage({ key: 'a'.repeat(16) }),
        outage({ key: 'b'.repeat(16), startMs: Date.parse(`${YESTERDAY}T23:59:59Z`) }),
        outage({ key: 'c'.repeat(16), startMs: Date.parse(`${TODAY}T00:00:00Z`) }),
        { kind: 'MISS', atMs: Date.parse(`${TODAY}T00:00:01Z`), armedN: 5 },
      ],
      NOW,
    );
    const dump = fieldDump(store, YESTERDAY, 7) as FieldDump;
    expect(dump.outages.map((o) => o.key)).toEqual(['a'.repeat(16), 'b'.repeat(16)]);
    expect(dump.misses).toEqual([]);
    expect(fieldDump(store, 'nope', 7)).toBeNull();
  });

  it('R8.1 a device seen in the 7 days before the day, but not on it, is listed as silent with its last day', () => {
    const store = new MemoryTelemetryStore();
    store.putDay(base({ installId: ID }), NOW);
    store.putDay(base({ installId: ID2, day: dayOf(NOW - 4 * DAY_MS) }), NOW);
    store.putDay(base({ installId: ID3, day: dayOf(NOW - 20 * DAY_MS) }), NOW);
    const dump = fieldDump(store, YESTERDAY, 7) as FieldDump;
    expect(dump.devices).toHaveLength(1);
    expect(dump.silent).toEqual([{ alias: 'D1', maker: 'tecno', androidMajor: 13, lastDay: dayOf(NOW - 4 * DAY_MS) }]);
  });

  it('R1.5 rows older than 90 days are pruned', () => {
    const store = new MemoryTelemetryStore();
    store.putDay(base(), NOW - 91 * DAY_MS);
    store.putDay(base({ installId: ID2 }), NOW);
    recordFieldRecords(store, [outage({ startMs: NOW - 91 * DAY_MS })], NOW);
    expect(store.prune(NOW - CONFIG.TELEMETRY_RETENTION_MS)).toBe(2);
    expect(store.count()).toBe(1);
  });
});
