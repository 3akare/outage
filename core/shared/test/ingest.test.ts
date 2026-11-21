import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import armed from '../fixtures/ingest/event-armed.json';
import batteryFull from '../fixtures/ingest/event-battery-full.json';
import disarmed from '../fixtures/ingest/event-disarmed.json';
import heartbeatOnBattery from '../fixtures/ingest/event-heartbeat-battery.json';
import label from '../fixtures/ingest/event-label.json';
import replug from '../fixtures/ingest/event-replug.json';
import request from '../fixtures/ingest/events-request.json';
import response from '../fixtures/ingest/events-response.json';
import registerResponse from '../fixtures/ingest/register-response.json';
import unplug from '../fixtures/ingest/event-unplug.json';
import { isPermanent, MAX_ELAPSED_MS, parseDeleteRequest, parseEventsRequest, validateEvent } from '../src/index.ts';
import { INSTALL, validEventArb } from './arbs.ts';
import { NUM_RUNS } from './runs.ts';

const base = { ...unplug } as Record<string, unknown>;
const ALLOWED = new Set([
  'installId', 'seq', 'type', 'elapsedMs', 'cell', 'confidence', 'timeQuality',
  'stopReason', 'reason', 'schedulingDelayMs', 'batteryPct', 'plugType', 'refSeq', 'answer',
]);

describe('R1 contract fixtures', () => {
  it('R1.4 every fixture event validates and round-trips unchanged', () => {
    for (const ev of [armed, disarmed, heartbeatOnBattery, unplug, batteryFull, replug, label]) {
      const r = validateEvent(ev, INSTALL);
      expect(r).toEqual({ ok: true, event: ev });
    }
  });

  it('R1.4 request and response fixtures have the documented shape', () => {
    const parsed = parseEventsRequest(request, 100);
    expect(parsed.ok).toBe(true);
    expect(request.events.map((e) => e.type)).toEqual(['ARMED', 'DISARMED', 'UNPLUG', 'BATTERY_FULL', 'REPLUG', 'LABEL']);
    for (const e of request.events) expect(validateEvent(e, request.installId).ok).toBe(true);
    for (const r of response.results) expect(['accepted', 'duplicate', 'rejected']).toContain(r.status);
    expect(Object.keys(registerResponse).sort()).toEqual(['installId', 'token']);
  });
});

describe('I3 elapsed bounds', () => {
  const badElapsed = fc.oneof(
    fc.integer({ min: -1_000_000_000, max: -1 }),
    fc.integer({ min: MAX_ELAPSED_MS + 1, max: 2 ** 40 }),
    fc.double({ noNaN: true, min: -1e9, max: 1e12 }).filter((d) => !Number.isInteger(d)),
    fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
    fc.constantFrom('5', null, true, {}),
  );

  it('I3_elapsed_bounds: below 0, non-integer or above 7 days is always BAD_ELAPSED', () => {
    fc.assert(
      fc.property(validEventArb(), badElapsed, (ev, elapsedMs) => {
        const r = validateEvent({ ...ev, elapsedMs }, INSTALL);
        expect(r).toEqual({ ok: false, code: 'BAD_ELAPSED' });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I3_elapsed_bounds: 0 and exactly 7 days are accepted, 7 days + 1 is not', () => {
    for (const elapsedMs of [0, MAX_ELAPSED_MS]) expect(validateEvent({ ...base, elapsedMs }, INSTALL).ok).toBe(true);
    expect(validateEvent({ ...base, elapsedMs: MAX_ELAPSED_MS + 1 }, INSTALL).ok).toBe(false);
    expect(validateEvent({ ...base, elapsedMs: -1 }, INSTALL).ok).toBe(false);
    fc.assert(
      fc.property(validEventArb(), fc.constantFrom(0, MAX_ELAPSED_MS), (ev, elapsedMs) => {
        expect(validateEvent({ ...ev, elapsedMs }, INSTALL).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I3_elapsed_bounds: any elapsed in range is accepted for any valid event', () => {
    fc.assert(
      fc.property(validEventArb(), fc.integer({ min: 0, max: MAX_ELAPSED_MS }), (ev, elapsedMs) => {
        expect(validateEvent({ ...ev, elapsedMs }, INSTALL).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('I8 strict schema', () => {
  it('I8_strict_schema: any extra field is UNKNOWN_FIELD', () => {
    const extraKey = fc.string({ minLength: 1, maxLength: 12 }).filter((k) => !ALLOWED.has(k) && k !== 'simulated');
    fc.assert(
      fc.property(validEventArb(), extraKey, fc.jsonValue(), (ev, key, value) => {
        const r = validateEvent({ ...ev, [key]: value }, INSTALL);
        expect(r).toEqual({ ok: false, code: 'UNKNOWN_FIELD' });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I8_strict_schema: location and wall-clock field names cannot get in', () => {
    const names = ['lat', 'lng', 'lon', 'latitude', 'longitude', 'location', 'gps', 'timestamp', 'time', 'ts', 'createdAt', 'deviceTime', 'wallClock', 'ip', 'userAgent'];
    for (const name of names) {
      expect(validateEvent({ ...base, [name]: 1 }, INSTALL)).toEqual({ ok: false, code: 'UNKNOWN_FIELD' });
    }
  });

  it('I8_strict_schema: a valid event comes back with only allowed keys, and refSeq/answer only on LABEL', () => {
    fc.assert(
      fc.property(validEventArb(), (ev) => {
        const r = validateEvent(ev, INSTALL);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        for (const key of Object.keys(r.event)) expect(ALLOWED.has(key)).toBe(true);
        expect('refSeq' in r.event).toBe(ev.type === 'LABEL');
        const plainWithLabelField = ev.type === 'LABEL' ? ev : { ...ev, refSeq: 1 };
        if (ev.type !== 'LABEL') expect(validateEvent(plainWithLabelField, INSTALL)).toEqual({ ok: false, code: 'UNKNOWN_FIELD' });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('I8_strict_schema: free-text fields cannot hold coordinates or sentences', () => {
    for (const reason of ['6.5244, 3.3792', 'a'.repeat(41), '', 'two words']) {
      expect(validateEvent({ ...base, reason }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    }
  });
});

describe('R1 R4 R10 other codes', () => {
  it('R10.1 simulated marker is SIMULATED_REJECTED whatever its value', () => {
    for (const simulated of [true, false, 0, null]) {
      expect(validateEvent({ ...base, simulated }, INSTALL)).toEqual({ ok: false, code: 'SIMULATED_REJECTED' });
    }
  });

  it('R4.3 timeQuality other than OK is TIME_LOST', () => {
    for (const timeQuality of ['LOST', 'ok', '']) {
      expect(validateEvent({ ...base, timeQuality }, INSTALL)).toEqual({ ok: false, code: 'TIME_LOST' });
    }
  });

  it('R1.3 BAD_CELL for wrong resolution, upper case, garbage and non-strings', () => {
    for (const cell of ['87589c984ffffff', '88589C984DFFFFF', 'zzzzzzzzzzzzzzz', '', 5, null, '88589c984dfffffff']) {
      expect(validateEvent({ ...base, cell }, INSTALL)).toEqual({ ok: false, code: 'BAD_CELL' });
    }
  });

  it('R1.1 wrong install, missing fields, bad types are BAD_FIELD (permanent)', () => {
    expect(validateEvent({ ...base, installId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa' }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...base, seq: -1 }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...base, seq: 1.5 }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...base, type: 'NOPE' }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...base, batteryPct: 101 }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...label, answer: 'MAYBE' }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(validateEvent({ ...label, confidence: 'LOW' }, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    const { cell: _cell, ...noCell } = base;
    expect(validateEvent(noCell, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    for (const raw of [null, 5, 'x', [], undefined]) expect(validateEvent(raw, INSTALL)).toEqual({ ok: false, code: 'BAD_FIELD' });
    expect(isPermanent('BAD_FIELD') && isPermanent('SIMULATED_REJECTED')).toBe(true);
    expect(isPermanent('RATE_LIMITED') || isPermanent('UNAVAILABLE')).toBe(false);
  });

  it('R8.4 request envelope: exact keys, install id shape, batch limit', () => {
    expect(parseEventsRequest({ installId: INSTALL, events: [] }, 100)).toEqual({ ok: true, installId: INSTALL, events: [] });
    expect(parseEventsRequest({ installId: INSTALL, events: [], extra: 1 }, 100).ok).toBe(false);
    expect(parseEventsRequest({ installId: 'short', events: [] }, 100).ok).toBe(false);
    expect(parseEventsRequest({ installId: INSTALL, events: new Array(3).fill({}) }, 2)).toEqual({ ok: false, reason: 'TOO_MANY_EVENTS' });
    expect(parseEventsRequest([], 100).ok).toBe(false);
  });

  it('R12.1 delete envelope: valid cells only', () => {
    expect(parseDeleteRequest({ installId: INSTALL, cells: [base.cell] }, 10).ok).toBe(true);
    expect(parseDeleteRequest({ installId: INSTALL, cells: ['nope'] }, 10).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [base.cell, base.cell] }, 1).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL }, 1).ok).toBe(false);
  });

  it('delete envelope: legacy pairIds from old APKs are accepted and dropped', () => {
    const pairId = `AB${'0'.repeat(32)}`;
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: [pairId] }, 10)).toEqual({ ok: true, installId: INSTALL, cells: [] });
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: [] }, 10).ok).toBe(true);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: ['x'] }, 10).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], pairIds: new Array(26).fill(pairId) }, 10).ok).toBe(false);
    expect(parseDeleteRequest({ installId: INSTALL, cells: [], other: [] }, 10).ok).toBe(false);
  });
});
