// home-watch tasks 5, 6, 7: station state in the pairing shard, the alarm multiplexer, the home push, the viewer API.
// Properties H6, H7 and the state parts of H8, plus the Worker path from a station's events to a viewer's push.
import fc from 'fast-check';
import { isHomeResponse, type OfferResponse, SILENCE_LIMIT_MS, type WireEvent } from '@outage/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/ingest/handlers.ts';
import { HomeCore, LAST_SEEN_WRITE_MS, DEAD_TOKEN_KEEP_MS } from '../src/home/core.ts';
import { clockText, planHome, type HomeChange } from '../src/home/planner.ts';
import { ALARM_GRANULARITY_MS, earliest, planAlarm } from '../src/home/wake.ts';
import { HOME_CACHE_MS, HomeViewCache } from '../src/home/cache.ts';
import { CELL, FakeSender, ID, makeWorld, MemoryPairStore, NOW, PARENT, post, ROOMY, tokenFor, wire } from './helpers.ts';
import { NUM_RUNS } from './runs.ts';

const VIEWER = 'bbbbbbbbbbbbbbbbbbbbbbbbbb';
const VIEWER2 = 'cccccccccccccccccccccccccc';
const MIN = 60_000;
type World = ReturnType<typeof makeWorld>;

async function pair(w: World, viewer = VIEWER, extra: Record<string, unknown> = {}, offerExtra: Record<string, unknown> = { cell: CELL }) {
  const o = await handleRequest(await post('/v1/pair/offer', { installId: ID, ...offerExtra }, await tokenFor(ID)), w.deps);
  expect(o.status).toBe(200);
  const { code } = (await o.json()) as OfferResponse;
  const c = await handleRequest(
    await post('/v1/pair/claim', { installId: viewer, code, fcmToken: `tok-${viewer.slice(0, 3)}`, quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 60, ...extra }, await tokenFor(viewer)),
    w.deps,
  );
  expect(c.status).toBe(200);
  return ((await c.json()) as { pairId: string }).pairId;
}

/** Station events at the Worker clock `w.now`; `agoMs` is how long before it each event happened. */
async function station(w: World, events: { seq: number; type: WireEvent['type']; agoMs?: number; reason?: string }[]) {
  const wireEvents = events.map((e) => wire({ seq: e.seq, type: e.type, elapsedMs: e.agoMs ?? 1000, ...(e.reason ? { reason: e.reason } : {}) }));
  const res = await handleRequest(await post('/v1/events', { installId: ID, events: wireEvents }, await tokenFor(ID)), w.deps);
  expect(res.status).toBe(200);
}
const heartbeat = (seq: number) => ({ seq, type: 'DISARMED' as const, reason: 'HEARTBEAT_ON_BATTERY' });

const view = async (w: World, pairId: string, viewer = VIEWER, headers: Record<string, string> | null = {}) => {
  const h: Record<string, string> = headers === null ? {} : { 'x-install-id': viewer, authorization: `Bearer ${await tokenFor(viewer)}`, ...headers };
  return handleRequest(new Request(`https://api.test/v1/home/${pairId}`, { method: 'GET', headers: h }), w.deps);
};

describe('Worker path: pairing starts forwarding (ADR 0036)', () => {
  it('a claim with a station cell makes the station parent forward its events to the pair shard', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    expect(w.watched.get(PARENT)?.get(ID)).toBe(pairId.slice(0, 2));
  });

  it('the claim response and the pair row carry no cell and no station id', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const row = w.shard(pairId.slice(0, 2)).store.pairs.get(pairId);
    expect(JSON.stringify(row)).not.toContain(CELL);
    expect(Object.keys(row ?? {})).not.toContain('stationCell');
  });

  it('an offer without a cell still pairs, but the station is not watched', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w, VIEWER, {}, {});
    expect(w.watched.size).toBe(0);
    const res = await view(w, pairId);
    expect(((await res.json()) as { status: string }).status).toBe('UNKNOWN');
  });
});

describe('H6_push_once_per_change (R5)', () => {
  it('H6_push_once_per_change: an unplug pushes once; a repeat, a heartbeat and a duplicate push nothing', async () => {
    const w = makeWorld(ROOMY);
    await pair(w);
    await station(w, [{ seq: 1, type: 'ARMED' }]); // first heartbeat after pairing: not news
    expect(w.sender.sent).toHaveLength(0);
    w.now = NOW + 5 * MIN;
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(w.sender.sent).toHaveLength(1);
    const m = w.sender.sent[0];
    expect(m.title).toMatch(/^Home: power off since \d{1,2}:\d{2} [ap]\.m\.$/);
    expect(m.channel).toBe('alerts');
    expect(m.priority).toBe('HIGH');
    expect(m.data).toMatchObject({ type: 'HOME', state: 'OFF', sinceMs: String(NOW + 5 * MIN - 1000) });
    await station(w, [{ seq: 2, type: 'UNPLUG' }]); // duplicate seq
    w.now += 10 * MIN;
    await station(w, [heartbeat(3)]); // battery heartbeat
    expect(w.sender.sent).toHaveLength(1);
    w.now += MIN;
    await station(w, [{ seq: 4, type: 'REPLUG' }]);
    expect(w.sender.sent).toHaveLength(2);
    expect(w.sender.sent[1].title).toMatch(/^Home: power is back since /);
  });

  it('H6_push_once_per_change: news older than 10 minutes updates the state and sends nothing (R5.6)', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + 3 * 3_600_000; // router was down for hours
    await station(w, [{ seq: 2, type: 'UNPLUG', agoMs: 2 * 3_600_000 }]);
    expect(w.sender.sent).toHaveLength(0);
    const v = (await (await view(w, pairId)).json()) as { status: string; sinceMs: number };
    expect(v.status).toBe('OFF');
    expect(v.sinceMs).toBe(w.now - 2 * 3_600_000);
  });

  it('H6_push_once_per_change: the viewer quiet hours choose the quiet channel (R5.5)', async () => {
    const w = makeWorld(ROOMY);
    // 01:00 UTC+1 is 00:00 UTC; NOW is 2027-01-15 08:00 UTC, so make the window cover local 09:00.
    await pair(w, VIEWER, { quietStartMin: 8 * 60, quietEndMin: 10 * 60, tzOffsetMin: 60 });
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(w.sender.sent.map((m) => m.channel)).toEqual(['alerts-quiet']);
  });

  it('H6_push_once_per_change: two viewers each get one push', async () => {
    const w = makeWorld(ROOMY);
    await pair(w, VIEWER);
    w.now += 1; // the test world derives pair ids from the clock
    await pair(w, VIEWER2);
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(w.sender.sent.map((m) => m.token).sort()).toEqual(['tok-bbb', 'tok-ccc']);
  });

  it('H6_push_once_per_change: a failed send is retried by the alarm and is sent once', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    w.sender.results = [{ kind: 'retry', reason: 'UNAVAILABLE', retryAfterMs: null }];
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(w.sender.sent).toHaveLength(1); // tried, not accepted
    const due = shard.home.nextDueMs() as number;
    expect(due).toBeLessThanOrEqual(w.now + 2 * MIN);
    await shard.home.tick(due);
    expect(w.sender.sent).toHaveLength(2); // the retry was accepted
    await shard.home.tick(due + 10 * MIN);
    expect(w.sender.sent).toHaveLength(2); // and is not sent again
  });

  it('H6_push_once_per_change: UNREGISTERED stops pushes to that pair but the viewer can still read the state; 7 days later the pair goes', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    w.sender.results = [{ kind: 'unregistered' }];
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(shard.store.pairs.get(pairId)?.pushFailedMs).toBe(w.now);
    w.now += MIN;
    await station(w, [{ seq: 3, type: 'REPLUG' }]);
    expect(w.sender.sent).toHaveLength(1);
    expect(((await (await view(w, pairId)).json()) as { status: string }).status).toBe('ON');
    await shard.home.tick(w.now + DEAD_TOKEN_KEEP_MS + 2 * 86_400_000);
    expect(shard.store.pairs.has(pairId)).toBe(false);
  });

  it('H6_push_once_per_change: a push-less station (no sender configured) still tracks state', async () => {
    const store = new MemoryPairStore();
    const core = new HomeCore(store, null, NOW);
    store.pairs.set('p1', { pairId: 'p1', stationInstall: ID, viewerInstall: VIEWER, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
    expect(await core.observe(ID, [{ type: 'UNPLUG', eventTimeMs: NOW }], NOW)).toBe(true);
    expect(store.stations.get(ID)?.state).toBe('OFF');
  });

  it('H6_push_once_per_change: any events, order and arrival times give at most one push per change and none for old news', () => {
    const arbEvent = fc.record({
      type: fc.constantFrom('ARMED', 'REPLUG', 'UNPLUG', 'BATTERY_FULL', 'DISARMED'),
      ago: fc.integer({ min: 0, max: 40 * MIN }),
      reason: fc.constantFrom('HEARTBEAT_ON_BATTERY', 'REBOOT', null),
    });
    return fc.assert(
      fc.asyncProperty(fc.array(fc.array(arbEvent, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 8 }), async (batches) => {
        const store = new MemoryPairStore();
        const sender = new FakeSender();
        const core = new HomeCore(store, sender, NOW);
        store.pairs.set('p1', { pairId: 'p1', stationInstall: ID, viewerInstall: VIEWER, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
        let now = NOW;
        for (const batch of batches) {
          now += 2 * MIN;
          await core.observe(ID, batch.map((e) => ({ type: e.type, eventTimeMs: now - e.ago, reason: e.reason })), now);
        }
        const keys = sender.sent.map((m) => `${m.data.pairId}|${m.data.state}|${m.data.sinceMs}`);
        expect(new Set(keys).size).toBe(keys.length); // at most once per change
        for (const m of sender.sent) expect(['ON', 'OFF']).toContain(m.data.state);
        const heartbeatsOnly = batches.every((b) => b.every((e) => e.type === 'DISARMED' || e.type === 'BATTERY_FULL'));
        if (heartbeatsOnly) expect(sender.sent).toHaveLength(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H6_push_once_per_change: planHome honors the age rule, the sent memory and the OFFLINE channel', () => {
    const change: HomeChange = { stationInstall: ID, kind: 'OFF', version: NOW, eventTimeMs: NOW, lastKnown: null };
    const pairs = [{ pairId: 'p1', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: 'Mum' }];
    expect(planHome(change, pairs, NOW + 11 * MIN, () => false)).toEqual([]);
    expect(planHome(change, pairs, NOW + 9 * MIN, () => true)).toEqual([]);
    expect(planHome(change, pairs, NOW + MIN, () => false)[0].title).toBe('Mum: power off since 8:00 a.m.');
    const off = planHome({ ...change, kind: 'OFFLINE', version: NOW - SILENCE_LIMIT_MS, eventTimeMs: NOW, lastKnown: { state: 'ON', sinceMs: NOW - 3_600_000 } }, pairs, NOW + 99 * MIN, () => false);
    expect(off[0]).toMatchObject({ channel: 'alerts-quiet', priority: 'NORMAL', title: 'Mum station is offline', body: 'Last known: power on since 7:00 a.m.' });
  });

  it('clockText renders the viewer local time', () => {
    expect(clockText(NOW, 0)).toBe('8:00 a.m.');
    expect(clockText(NOW, 60)).toBe('9:00 a.m.');
    expect(clockText(NOW + 4 * 3_600_000 + 14 * MIN, 0)).toBe('12:14 p.m.');
    expect(clockText(NOW + 16 * 3_600_000, 0)).toBe('12:00 a.m.');
  });
});

describe('H7_alarm_multiplexer (R6)', () => {
  it('H7_alarm_multiplexer: planAlarm moves the alarm earlier only, within one granularity', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
        (current, due) => {
          const now = 0;
          const set = planAlarm(current, due, now);
          if (due === null) {
            expect(set).toBeNull();
            return;
          }
          const alarm = set ?? current;
          expect(alarm).not.toBeNull();
          expect(alarm as number).toBeLessThanOrEqual(due + ALARM_GRANULARITY_MS); // never later than due plus one granularity
          if (set !== null) expect(set).toBeGreaterThanOrEqual(now + 1);
          if (current !== null && current <= due + ALARM_GRANULARITY_MS) expect(set).toBeNull(); // re-arms only when it must
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(earliest(null, 5, undefined, 3)).toBe(3);
    expect(earliest(null)).toBeNull();
  });

  it('H7_alarm_multiplexer: a silent station is OFFLINE by silence limit plus one granularity, for any heartbeat pattern', () => {
    return fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 1, max: 45 * MIN }), { minLength: 1, maxLength: 12 }), async (gaps) => {
        const store = new MemoryPairStore();
        const core = new HomeCore(store, new FakeSender(), NOW);
        store.pairs.set('p1', { pairId: 'p1', stationInstall: ID, viewerInstall: VIEWER, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
        let alarm: number | null = null;
        let now = NOW;
        let offlineAt: number | null = null;
        const run = async (until: number) => {
          while (alarm !== null && alarm <= until) {
            now = alarm;
            alarm = null;
            await core.tick(now);
            if (offlineAt === null && store.stations.get(ID)?.offline) offlineAt = now;
            alarm = planAlarm(alarm, core.nextDueMs(), now);
          }
        };
        let last = NOW;
        for (const gap of [0, ...gaps]) {
          const at = last + gap;
          await run(at);
          now = at;
          await core.observe(ID, [{ type: 'ARMED', eventTimeMs: at }], at);
          alarm = planAlarm(alarm, core.nextDueMs(), now) ?? alarm;
          last = at;
        }
        await run(last + 2 * SILENCE_LIMIT_MS);
        expect(store.stations.get(ID)?.offline).toBe(true);
        // The last heartbeat was at `last`; the final OFFLINE came no later than the limit plus one granularity after it.
        const row = store.stations.get(ID);
        expect(row?.lastSeenMs).toBe(last);
        expect(now).toBeLessThanOrEqual(last + SILENCE_LIMIT_MS + ALARM_GRANULARITY_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H7_alarm_multiplexer: a station that goes silent gets one OFFLINE push on the quiet channel, never "power off"', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    const due = shard.home.nextDueMs() as number;
    expect(due).toBe(NOW + SILENCE_LIMIT_MS);
    await shard.home.tick(due - 1);
    expect(w.sender.sent).toHaveLength(0);
    await shard.home.tick(due);
    expect(w.sender.sent).toHaveLength(1);
    expect(w.sender.sent[0]).toMatchObject({ channel: 'alerts-quiet', priority: 'NORMAL', title: 'Home station is offline' });
    expect(w.sender.sent[0].body).toMatch(/^Last known: power on since /);
    await shard.home.tick(due + 5 * MIN);
    expect(w.sender.sent).toHaveLength(1); // once
    expect(shard.home.nextDueMs()).not.toBeLessThan(due + 5 * MIN); // an offline station needs no timer
  });

  it('H7_alarm_multiplexer: hearing the station again clears OFFLINE, and the events during the silence correct the state', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    await shard.home.tick(NOW + SILENCE_LIMIT_MS);
    w.sender.sent.length = 0;
    w.now = NOW + 2 * 3_600_000; // router was down for two hours; the station went OFF in the middle
    await station(w, [{ seq: 2, type: 'UNPLUG', agoMs: 3_600_000 }, heartbeat(3)]);
    const v = (await (await view(w, pairId)).json()) as { status: string; sinceMs: number };
    expect(v).toMatchObject({ status: 'OFF', sinceMs: w.now - 3_600_000 });
    expect(w.sender.sent).toHaveLength(0); // old news
    expect(shard.store.stations.get(ID)?.offline).toBe(false);
  });

  it('H7_alarm_multiplexer / R8.1: last-seen is written at most every 10 minutes, a state change at once', async () => {
    const store = new MemoryPairStore();
    const core = new HomeCore(store, new FakeSender(), NOW);
    store.pairs.set('p1', { pairId: 'p1', stationInstall: ID, viewerInstall: VIEWER, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
    await core.observe(ID, [{ type: 'ARMED', eventTimeMs: NOW }], NOW);
    const first = store.stationWrites;
    for (let i = 1; i <= 9; i++) await core.observe(ID, [{ type: 'ARMED', eventTimeMs: NOW + i * MIN }], NOW + i * MIN);
    expect(store.stationWrites).toBe(first); // nine minutes of one-minute heartbeats: no write
    await core.observe(ID, [{ type: 'ARMED', eventTimeMs: NOW + LAST_SEEN_WRITE_MS }], NOW + LAST_SEEN_WRITE_MS);
    expect(store.stationWrites).toBe(first + 1);
    await core.observe(ID, [{ type: 'UNPLUG', eventTimeMs: NOW + LAST_SEEN_WRITE_MS + 1000 }], NOW + LAST_SEEN_WRITE_MS + 1000);
    expect(store.stationWrites).toBe(first + 2);
  });

  it('H7_alarm_multiplexer: after a restart the state is rebuilt from the stored row', async () => {
    const store = new MemoryPairStore();
    store.pairs.set('p1', { pairId: 'p1', stationInstall: ID, viewerInstall: VIEWER, fcmToken: 't', quietStartMin: 0, quietEndMin: 0, tzOffsetMin: 0, stationName: null, createdMs: NOW, pushFailedMs: null });
    const a = new HomeCore(store, new FakeSender(), NOW);
    await a.observe(ID, [{ type: 'UNPLUG', eventTimeMs: NOW - 1000 }], NOW);
    const b = new HomeCore(store, new FakeSender(), NOW);
    expect(b.view('p1', VIEWER, NOW + MIN)).toMatchObject({ status: 'OFF', sinceMs: NOW - 1000 });
    await b.observe(ID, [{ type: 'DISARMED', eventTimeMs: NOW + MIN, reason: 'HEARTBEAT_ON_BATTERY' }], NOW + MIN);
    expect(b.view('p1', VIEWER, NOW + 2 * MIN)).toMatchObject({ status: 'OFF', sinceMs: NOW - 1000 });
  });
});

describe('viewer API GET /v1/home/:pairId (task 7, R4, R7.5)', () => {
  it('answers state, since and last-seen, and nothing else', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w, VIEWER, { stationName: "Mum's flat" });
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    const res = await view(w, pairId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(isHomeResponse(body)).toBe(true);
    expect(body).toEqual({ status: 'ON', sinceMs: NOW - 1000, lastKnown: null, lastSeenMs: NOW, stationName: "Mum's flat", asOfMs: NOW });
    expect(JSON.stringify(body)).not.toContain(CELL);
    expect(JSON.stringify(body)).not.toContain(ID);
  });

  it('shows OFFLINE with the last known state after 30 minutes of silence, never OFF (R2.5)', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + SILENCE_LIMIT_MS + HOME_CACHE_MS;
    const body = (await (await view(w, pairId)).json()) as { status: string; lastKnown: unknown; sinceMs: unknown };
    expect(body).toMatchObject({ status: 'OFFLINE', sinceMs: null, lastKnown: { state: 'ON', sinceMs: NOW - 1000 } });
  });

  it('is UNKNOWN before the station is first heard', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    expect(await (await view(w, pairId)).json()).toMatchObject({ status: 'UNKNOWN', sinceMs: null, lastSeenMs: null });
  });

  it('needs the viewer token and id; the station, another install and an unknown pair all get the same 404', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    expect((await view(w, pairId, VIEWER, null)).status).toBe(401);
    expect((await view(w, pairId, VIEWER, { authorization: 'Bearer nope' })).status).toBe(401);
    expect((await view(w, pairId, VIEWER, { 'x-install-id': 'short' })).status).toBe(401);
    const other = await view(w, pairId, VIEWER2);
    const station = await view(w, pairId, ID);
    const unknown = await view(w, `${pairId.slice(0, 2)}${'0'.repeat(32)}`);
    for (const r of [other, station, unknown]) expect(r.status).toBe(404);
    expect(await other.text()).toBe(await unknown.text());
    w.revoked.add(VIEWER);
    expect((await view(w, pairId)).status).toBe(401);
  });

  it('only GET is allowed, and an unconfigured Worker says so', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const post405 = await handleRequest(new Request(`https://api.test/v1/home/${pairId}`, { method: 'POST' }), w.deps);
    expect(post405.status).toBe(405);
    expect(post405.headers.get('allow')).toBe('GET');
    const bare = makeWorld(ROOMY, null);
    expect((await handleRequest(new Request(`https://api.test/v1/home/${pairId}`), bare.deps)).status).toBe(500);
  });

  it('is cached for 10 seconds per pair and viewer, and a removed pair is not served from the cache', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    expect(((await (await view(w, pairId)).json()) as { status: string }).status).toBe('ON');
    w.now = NOW + 2000;
    await station(w, [{ seq: 2, type: 'UNPLUG', agoMs: 0 }]);
    expect(((await (await view(w, pairId)).json()) as { status: string }).status).toBe('ON'); // inside 10 s
    w.now = NOW + HOME_CACHE_MS + 1;
    expect(((await (await view(w, pairId)).json()) as { status: string }).status).toBe('OFF');
    const rm = await handleRequest(await post('/v1/pair/remove', { installId: VIEWER, pairId }, await tokenFor(VIEWER)), w.deps);
    expect(rm.status).toBe(200);
    expect((await view(w, pairId)).status).toBe(404);
  });

  it('cache entries are per viewer and bounded', () => {
    const c = new HomeViewCache();
    const v = { status: 'ON', sinceMs: 1, lastKnown: null, lastSeenMs: 1, stationName: null, asOfMs: 1 } as const;
    c.put('p', 'a', v, 0);
    expect(c.get('p', 'b', 1)).toBeUndefined();
    expect(c.get('p', 'a', HOME_CACHE_MS - 1)).toEqual(v);
    expect(c.get('p', 'a', HOME_CACHE_MS)).toBeUndefined();
    for (let i = 0; i < 1500; i++) c.put(`p${i}`, 'a', v, 0);
    expect(c.get('p1499', 'a', 1)).toEqual(v);
  });
});

describe('H8_delete_removes_pairs (state parts, R7.3, R7.4)', () => {
  it('H8_delete_removes_pairs: a station delete leaves no state, no sent memory, no pair and no forwarding', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    expect(shard.store.stations.size).toBe(1);
    expect(shard.store.sentKeys.size).toBe(1);
    const del = await handleRequest(await post('/v1/delete', { installId: ID, cells: [CELL] }, await tokenFor(ID)), w.deps);
    expect(del.status).toBe(200);
    expect([shard.store.stations.size, shard.store.sentKeys.size, shard.store.pairs.size]).toEqual([0, 0, 0]);
    expect(w.watched.get(PARENT)?.has(ID) ?? false).toBe(false);
  });

  it('H8_delete_removes_pairs: a viewer delete removes its pair, token and sent memory, and the station stops being tracked', async () => {
    const w = makeWorld(ROOMY);
    const pairId = await pair(w);
    const shard = w.shard(pairId.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    w.now = NOW + MIN;
    await station(w, [{ seq: 2, type: 'UNPLUG' }]);
    const del = await handleRequest(await post('/v1/delete', { installId: VIEWER, cells: [], pairIds: [pairId] }, await tokenFor(VIEWER)), w.deps);
    expect(del.status).toBe(200);
    expect([shard.store.stations.size, shard.store.sentKeys.size, shard.store.pairs.size]).toEqual([0, 0, 0]);
    expect(shard.home.nextDueMs()).toBeNull();
    w.now += MIN;
    await station(w, [{ seq: 3, type: 'REPLUG' }]); // forwarded once more, found unneeded, then dropped
    expect(w.watched.get(PARENT)?.has(ID)).toBe(false);
    expect(w.sender.sent).toHaveLength(1);
  });

  it('H8_delete_removes_pairs: removing the last pair stops tracking the station, with one pair left it keeps going', async () => {
    const w = makeWorld(ROOMY);
    const p1 = await pair(w, VIEWER);
    w.now += 1;
    const p2 = await pair(w, VIEWER2);
    const shard = w.shard(p1.slice(0, 2));
    await station(w, [{ seq: 1, type: 'ARMED' }]);
    await handleRequest(await post('/v1/pair/remove', { installId: VIEWER, pairId: p1 }, await tokenFor(VIEWER)), w.deps);
    expect(shard.store.stations.size).toBe(1);
    await handleRequest(await post('/v1/pair/remove', { installId: ID, pairId: p2 }, await tokenFor(ID)), w.deps);
    expect(shard.store.stations.size).toBe(0);
  });
});
