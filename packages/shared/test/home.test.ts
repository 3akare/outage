// home-watch task 3: HomeState (pure) and the station event window. Properties H1 to H4.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import responses from '../fixtures/home/home-response.json';
import { foldPower, homeState, isHomeResponse, mergeWindow, SILENCE_LIMIT_MS, type StationEvent } from '../src/home.ts';
import { parseOfferRequest } from '../src/pairing.ts';
import { NUM_RUNS } from './runs.ts';

const T0 = 1_800_000_000_000;
const POWER = ['ARMED', 'REPLUG', 'UNPLUG'] as const;
const OTHER = ['BATTERY_FULL', 'DISARMED', 'LABEL'] as const;

// Small time range on purpose: ties and duplicates are common.
const power = fc.record({ type: fc.constantFrom(...POWER), timeMs: fc.integer({ min: 0, max: 40 }).map((n) => T0 + n * 60_000) });
const other = fc.record({
  type: fc.constantFrom(...OTHER),
  timeMs: fc.integer({ min: 0, max: 40 }).map((n) => T0 + n * 60_000),
  reason: fc.constantFrom('HEARTBEAT_ON_BATTERY', 'REBOOT', 'PROCESS_DEATH', 'NON_DETECTION_PLUG', null),
});
const anyEvent = fc.oneof(power, other);
const END = T0 + 41 * 60_000;

describe('HomeState basics (R2.1)', () => {
  it('UNPLUG starts OFF and REPLUG starts ON at the event time', () => {
    expect(foldPower([])).toEqual({ state: 'UNKNOWN', sinceMs: null });
    expect(foldPower([{ type: 'ARMED', timeMs: T0 }])).toEqual({ state: 'ON', sinceMs: T0 });
    expect(foldPower([{ type: 'ARMED', timeMs: T0 }, { type: 'UNPLUG', timeMs: T0 + 5 }])).toEqual({ state: 'OFF', sinceMs: T0 + 5 });
    expect(foldPower([{ type: 'UNPLUG', timeMs: T0 }, { type: 'REPLUG', timeMs: T0 + 9 }])).toEqual({ state: 'ON', sinceMs: T0 + 9 });
  });

  it('a heartbeat while ON keeps since (R2.2)', () => {
    const ev: StationEvent[] = [{ type: 'ARMED', timeMs: T0 }, { type: 'ARMED', timeMs: T0 + 600_000 }];
    expect(foldPower(ev)).toEqual({ state: 'ON', sinceMs: T0 });
  });

  it('a battery heartbeat while OFF keeps OFF and since (R2.3)', () => {
    const ev: StationEvent[] = [
      { type: 'UNPLUG', timeMs: T0 },
      { type: 'DISARMED', timeMs: T0 + 600_000, reason: 'HEARTBEAT_ON_BATTERY' },
    ];
    expect(homeState(ev, T0 + 600_000, T0 + 700_000)).toEqual({ status: 'OFF', sinceMs: T0, lastKnown: null });
  });

  it('a router-down outage corrected after reconnection shows the later state with its since', () => {
    const ev: StationEvent[] = [{ type: 'ARMED', timeMs: T0 }, { type: 'UNPLUG', timeMs: T0 + 1000 }];
    const silent = homeState(ev, T0 + 500, T0 + 2 * 3_600_000);
    expect(silent).toEqual({ status: 'OFFLINE', sinceMs: null, lastKnown: { state: 'OFF', sinceMs: T0 + 1000 } });
    expect(homeState(ev, T0 + 2 * 3_600_000, T0 + 2 * 3_600_000 + 1)).toMatchObject({ status: 'OFF', sinceMs: T0 + 1000 });
  });
});

describe('H1_offline_never_off (R2.4, R2.5)', () => {
  it('H1_offline_never_off: 30 minutes of silence or more gives OFFLINE with the event-derived state as last known', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 30 }), fc.integer({ min: SILENCE_LIMIT_MS, max: 10 * SILENCE_LIMIT_MS }), (events, silence) => {
        const fold = foldPower(events);
        const v = homeState(events, END, END + silence);
        expect(v.status).toBe('OFFLINE');
        expect(v.sinceMs).toBeNull();
        expect(v.lastKnown).toEqual(fold.state === 'UNKNOWN' ? null : { state: fold.state, sinceMs: fold.sinceMs });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H1_offline_never_off: less than 30 minutes gives exactly the event-derived state', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 30 }), fc.integer({ min: 0, max: SILENCE_LIMIT_MS - 1 }), (events, silence) => {
        const fold = foldPower(events);
        expect(homeState(events, END, END + silence)).toEqual({ status: fold.state, sinceMs: fold.sinceMs, lastKnown: null });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H1_offline_never_off: silence alone never turns an ON station into OFF', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 * SILENCE_LIMIT_MS }), (silence) => {
        const v = homeState([{ type: 'ARMED', timeMs: T0 }], T0, T0 + silence);
        expect(v.status).not.toBe('OFF');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('H2_state_order_independent (R2.6, R2.7)', () => {
  it('H2_state_order_independent: any order and any duplication gives the same state', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 30 }), fc.integer(), (events, seed) => {
        const rng = (i: number) => Math.abs(Math.sin(seed + i)) % 1;
        const shuffled = events
          .flatMap((e, i) => (rng(i) < 0.4 ? [e, e] : [e]))
          .map((e, i) => ({ e, k: rng(i + 1000) }))
          .sort((a, b) => a.k - b.k)
          .map((x) => x.e);
        expect(homeState(shuffled, END, END + 1)).toEqual(homeState(events, END, END + 1));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H2_state_order_independent: any batching through the window gives the same state', () => {
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 40 }), fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 12 }), (events, sizes) => {
        let win: StationEvent[] = [];
        let at = 0;
        for (const n of sizes) {
          win = mergeWindow(win, events.slice(at, at + n));
          at += n;
        }
        win = mergeWindow(win, events.slice(at));
        expect(foldPower(win)).toEqual(foldPower(events));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('H2_state_order_independent: a window kept small keeps the state when events arrive in time order', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...POWER), { minLength: 1, maxLength: 60 }), fc.integer({ min: 2, max: 8 }), (types, max) => {
        const events: StationEvent[] = types.map((type, i) => ({ type, timeMs: T0 + i * 1000 }));
        let win: StationEvent[] = [];
        for (const e of events) win = mergeWindow(win, [e], max);
        expect(win.length).toBeLessThanOrEqual(max);
        expect(foldPower(win)).toEqual(foldPower(events));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('H3_non_power_events_ignored (R2.2, R2.3, R3)', () => {
  it('H3_non_power_events_ignored: BATTERY_FULL, every DISARMED reason and LABEL change nothing', () => {
    fc.assert(
      fc.property(fc.array(power, { maxLength: 20 }), fc.array(other, { maxLength: 20 }), (p, o) => {
        expect(homeState([...p, ...o], END, END)).toEqual(homeState(p, END, END));
        expect(mergeWindow([], [...p, ...o])).toEqual(mergeWindow([], p));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('H4_state_independent_of_area (R2.8)', () => {
  it('H4_state_independent_of_area: the function takes only the station events, last-seen and the clock', () => {
    expect(homeState.length).toBe(3);
    fc.assert(
      fc.property(fc.array(anyEvent, { maxLength: 20 }), fc.constantFrom('NORMAL', 'SUSPECTED', 'CONFIRMED'), (events, level) => {
        const loose = homeState as (...args: unknown[]) => unknown;
        expect(loose(events, END, END, { areaLevel: level })).toEqual(homeState(events, END, END));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('viewer response shape (R4, R7.5)', () => {
  it('accepts every fixture and rejects a cell or an extra field', () => {
    for (const r of responses as unknown[]) expect(isHomeResponse(r)).toBe(true);
    expect(isHomeResponse({ ...(responses[0] as object), cell: '88589c984dfffff' })).toBe(false);
    expect(isHomeResponse({ ...(responses[0] as object), status: 'DEAD' })).toBe(false);
  });

  it('an offer may carry the station cell, and only a valid res-8 cell', () => {
    const installId = 'kg4yq7mxwb2ndpr3tfhj5vcsaz';
    expect(parseOfferRequest({ installId, cell: '88589c984dfffff' })).toEqual({ ok: true, value: { installId, cell: '88589c984dfffff' } });
    expect(parseOfferRequest({ installId, cell: 'nope' }).ok).toBe(false);
    expect(parseOfferRequest({ installId }).ok).toBe(true);
  });
});
