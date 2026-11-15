// DM6 (demo-mode task 2, R6): the sanitizer output has no install ID, absolute date or res-8 cell, for any raw fixture.
// Raw events are real events, so these tests build them from a typed helper instead of simulated factories.
import { childrenOf, INSTALL_ID_PATTERN } from '@outage/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LAGOS_PARENT, syntheticFixture } from '../src/fixture.ts';
import { buildReplay } from '../src/replay.ts';
import {
  type RawEvent,
  type RawEventType,
  type RawRecording,
  SanitizeError,
  sanitize,
  scanForbidden,
} from '../src/sanitize.ts';
import { NUM_RUNS } from './runs.ts';

const CELLS = childrenOf(LAGOS_PARENT);
const BASE32 = [...'abcdefghijklmnopqrstuvwxyz234567'];
const idArb = fc.array(fc.constantFrom(...BASE32), { minLength: 26, maxLength: 26 }).map((a) => a.join(''));
const typeArb: fc.Arbitrary<RawEventType> = fc.constantFrom('ARMED', 'UNPLUG', 'REPLUG', 'DISARMED', 'BATTERY_FULL');
const T2025 = Date.UTC(2025, 0, 1);
const T2027 = Date.UTC(2027, 0, 1);

const rawArb: fc.Arbitrary<RawRecording> = fc
  .tuple(fc.uniqueArray(idArb, { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 40 }))
  .chain(([ids, n]) =>
    fc.record({
      events: fc.array(
        fc.record({
          installId: fc.constantFrom(...ids),
          seq: fc.integer({ min: 1, max: 50 }),
          type: typeArb,
          eventTimeMs: fc.integer({ min: T2025, max: T2027 }),
          cell: fc.constantFrom(...CELLS),
          schedulingDelayMs: fc.option(fc.integer({ min: 0, max: 60_000 }), { nil: undefined }),
        }),
        { minLength: 1, maxLength: n },
      ),
      labels: fc.constant([] as RawRecording['labels']),
    }),
  );

const rawEvent = (installId: string, type: RawEventType, eventTimeMs: number, cell = CELLS[0] ?? ''): RawEvent => ({
  installId,
  seq: 1,
  type,
  eventTimeMs,
  cell,
});

describe('DM6 sanitizer', () => {
  it('DM6_sanitizer: output has no install ID, absolute date, res-8 cell or epoch time, for any raw fixture', () => {
    fc.assert(
      fc.property(rawArb, (raw) => {
        const fx = sanitize(raw);
        expect(scanForbidden(fx)).toEqual([]);
        const text = JSON.stringify(fx);
        for (const e of raw.events) {
          expect(text).not.toContain(e.installId);
          expect(text).not.toContain(e.cell);
          expect(text).not.toContain(String(e.eventTimeMs));
        }
        expect(fx.cell).toBe(LAGOS_PARENT);
        expect(fx.source).toBe('RECORDED');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM6_offsets_and_aliases: times are offsets from the first event, aliases are stable, order is kept', () => {
    fc.assert(
      fc.property(rawArb, (raw) => {
        const fx = sanitize(raw);
        const start = Math.min(...raw.events.map((e) => e.eventTimeMs));
        expect(fx.events).toHaveLength(raw.events.length);
        expect(Math.min(...fx.events.map((e) => e.tMs))).toBe(0);
        expect(fx.events.map((e) => e.tMs)).toEqual([...fx.events.map((e) => e.tMs)].sort((a, b) => a - b));
        expect(fx.events.map((e) => e.tMs).sort((a, b) => a - b)).toEqual(
          raw.events.map((e) => e.eventTimeMs - start).sort((a, b) => a - b),
        );
        const installs = new Set(raw.events.map((e) => e.installId));
        expect(fx.phones).toHaveLength(installs.size);
        expect(fx.phones.every((p) => /^A\d+$/.test(p.alias) && p.role === 'REAL')).toBe(true);
        expect(fx.events.every((e) => e.simulated === true)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('DM6_labels_follow_aliases: a label keeps its unplug and points at the alias of its install', () => {
    const id = 'abcdefghijklmnopqrstuvwxyz'.slice(0, 26);
    const other = 'bcdefghijklmnopqrstuvwxyz2';
    const fx = sanitize({
      events: [rawEvent(other, 'ARMED', T2025 + 5), rawEvent(id, 'UNPLUG', T2025 + 9)],
      labels: [{ installId: id, unplugSeq: 1, answer: 'YES' }],
    });
    expect(fx.phones.map((p) => p.alias)).toEqual(['A1', 'A2']);
    expect(fx.labels).toEqual([{ alias: 'A2', unplugSeq: 1, answer: 'YES', simulated: true }]);
  });

  it('DM6_refusals: bad cell, bad time, empty recording, two areas, label for an unknown install', () => {
    const id = 'abcdefghijklmnopqrstuvwxyz';
    expect(() => sanitize({ events: [], labels: [] })).toThrow(SanitizeError);
    expect(() => sanitize({ events: [rawEvent(id, 'ARMED', 5, LAGOS_PARENT)], labels: [] })).toThrow(SanitizeError);
    expect(() => sanitize({ events: [rawEvent(id, 'ARMED', -1)], labels: [] })).toThrow(SanitizeError);
    expect(() => sanitize({ events: [rawEvent(id, 'ARMED', 1.5)], labels: [] })).toThrow(SanitizeError);
    expect(() =>
      sanitize({ events: [rawEvent(id, 'ARMED', 5)], labels: [{ installId: 'zzzz', unplugSeq: 1, answer: 'NO' }] }),
    ).toThrow(SanitizeError);
    const far = '88194ad14dfffff'; // a valid res-8 cell in London, h3-js latLngToCell(51.5, -0.12, 8)
    expect(() => sanitize({ events: [rawEvent(id, 'ARMED', 5), rawEvent(id, 'UNPLUG', 9, far)], labels: [] })).toThrow(
      /more than one area/,
    );
  });

  it('DM6_through_engine: a sanitized recording goes through the real engine and the replay stays clean', () => {
    const base = T2025 + 123_456;
    const ids = Array.from({ length: 6 }, (_, i) => `${'abcdef'[i]}${'a'.repeat(25)}`);
    const events: RawEvent[] = [
      ...ids.map((id, i) => rawEvent(id, 'ARMED', base + i * 1000)),
      ...ids.map((id, i) => ({ ...rawEvent(id, 'UNPLUG', base + 600_000 + i * 300), seq: 2 })),
    ];
    const replay = buildReplay(sanitize({ events, labels: [] }));
    expect(replay.source).toBe('RECORDED');
    expect(replay.recordedDevices).toBe(6);
    expect(replay.frames.some((f) => f.cells[0]?.state === 'CONFIRMED')).toBe(true);
    expect(scanForbidden(replay)).toEqual([]);
  });
});

describe('DM6 forbidden-shape scanner', () => {
  const kinds = (v: unknown) => scanForbidden(v).map((f) => f.kind);

  it('DM6_scanner_detects: each forbidden shape is found, in values and in keys', () => {
    const id = 'abcdefghijklmnopqrstuvwxyz';
    expect(INSTALL_ID_PATTERN.test(id)).toBe(true);
    expect(kinds({ a: id })).toEqual(['INSTALL_ID']);
    expect(kinds({ a: `phone ${id} here` })).toEqual(['INSTALL_ID']);
    expect(kinds({ [id]: 1 })).toEqual(['INSTALL_ID']);
    expect(kinds({ a: CELLS[0] })).toEqual(['RES8_CELL']);
    expect(kinds({ a: '2026-11-14' })).toEqual(['ISO_DATE']);
    expect(kinds({ a: 'at 2026-11-14T09:30:00Z' })).toEqual(['ISO_DATE']);
    expect(kinds({ t: Date.UTC(2026, 10, 14) })).toEqual(['EPOCH_MS']);
    expect(kinds({ a: '6.506812, 3.375512' })).toEqual(['COORDINATES']);
    expect(kinds({ lat: 1 })).toEqual(['COORDINATES']);
    expect(scanForbidden({ events: [{ x: CELLS[0] }] })[0]?.path).toBe('events[0].x');
  });

  it('DM6_scanner_passes_clean: aliases, res-7 parents, offsets and probabilities are not flagged', () => {
    const clean = {
      cell: LAGOS_PARENT,
      phones: [{ alias: 'A1' }],
      events: [{ tMs: 647_999_999, seq: 12 }],
      explanation: { p: 0.0143876779, lambdaPerSec: 0.000555 },
      note: 'Simulated replay, 7 of 10 phones',
    };
    expect(scanForbidden(clean)).toEqual([]);
    expect(scanForbidden(syntheticFixture())).toEqual([]);
    expect(scanForbidden(buildReplay(syntheticFixture()))).toEqual([]);
  });

  it('DM6_scanner_total: never throws on any JSON-like value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(Array.isArray(scanForbidden(v))).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
