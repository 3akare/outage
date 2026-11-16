import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FCM_MAX_BYTES, messageBytes, type AreaPush, plan, sentKey, type Subscription } from '../api/alerts/planner.ts';
import { quietContains } from '../api/alerts/quiet.ts';
import { allPushTexts } from '../api/alerts/strings.ts';
import { push, sub } from './alerts-helpers.ts';
import { CELL, ID, NOW, SIBLINGS } from './helpers.ts';

const RUNS = Number(process.env.FC_NUM_RUNS ?? 100);
const IDS = [
  'kg4yq7mxwb2ndpr3tfhj5vcsaz',
  'aaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccccccccc',
];
const none = { has: () => false };

describe('L5_quiet_window', () => {
  // Reference: the local clock through Date, not through the modular arithmetic under test.
  const reference = (s: number | null, e: number | null, tz: number, now: number): boolean => {
    if (s === null || e === null || s === e) return false;
    const d = new Date(now + tz * 60_000);
    const local = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (let m = s; m !== e; m = (m + 1) % 1440) if (m === local) return true;
    return false;
  };
  it('matches the reference for any window, offset and time, across midnight and with s == e', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1439 }),
        fc.nat({ max: 1439 }),
        fc.integer({ min: -840, max: 840 }),
        fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }),
        (s, e, tz, now) => {
          expect(quietContains(s, e, tz, now)).toBe(reference(s, e, tz, now));
        },
      ),
      { numRuns: RUNS },
    );
  });
  it('null bounds mean no window, and the window only picks the channel', () => {
    expect(quietContains(null, null, 0, NOW)).toBe(false);
    const minuteNow = Math.floor(NOW / 60_000) % 1440;
    const inWindow = sub({ quietStartMin: minuteNow, quietEndMin: (minuteNow + 60) % 1440 });
    const [m] = plan([push()], [inWindow], NOW, none);
    expect(m?.channel).toBe('alerts-quiet');
    const [loud] = plan([push()], [sub()], NOW, none);
    expect(loud?.channel).toBe('alerts');
    expect({ ...m, channel: '' }).toEqual({ ...loud, channel: '' });
  });
});

describe('L6_push_planning', () => {
  const subArb = fc.record({
    installId: fc.constantFrom(...IDS),
    cell: fc.constantFrom(...SIBLINGS.slice(0, 3)),
    kinds: fc.constantFrom<Subscription['kinds']>(['CONFIRMED'], ['RESTORED'], ['CONFIRMED', 'RESTORED']),
    quietStartMin: fc.option(fc.nat({ max: 1439 }), { nil: null }),
    quietEndMin: fc.option(fc.nat({ max: 1439 }), { nil: null }),
    tzOffsetMin: fc.integer({ min: -840, max: 840 }),
  });
  const pushArb = fc.record({
    cell: fc.constantFrom(...SIBLINGS.slice(0, 3)),
    episodeId: fc.constantFrom('e1', 'e2'),
    kind: fc.constantFrom<AreaPush['kind']>('CONFIRMED', 'RESTORED'),
    decisionTimeMs: fc.integer({ min: NOW - 900_000, max: NOW }),
    precision: fc.constantFrom<AreaPush['precision']>('CELL', 'LINKED', 'COARSE', null),
  });

  it('lists each (subscription, episode, kind) once, only for followers, with safe text', () => {
    fc.assert(
      fc.property(fc.array(subArb, { maxLength: 8 }), fc.array(pushArb, { maxLength: 8 }), (rawSubs, pushes) => {
        const subs = rawSubs.map((s) => sub(s));
        const out = plan(pushes, subs, NOW, none);
        const keys = out.map((m) => sentKey(m.installId, m.cell, m.episodeId, m.kind));
        expect(new Set(keys).size).toBe(keys.length);
        for (const m of out) {
          expect(subs.some((s) => s.installId === m.installId && s.cell === m.cell && s.kinds.includes(m.kind))).toBe(
            true,
          );
          expect(`${m.title} ${m.body}`).not.toMatch(/\d/); // no number, so none under 3 (R6.6)
          const text = JSON.stringify(m.data) + m.title + m.body;
          for (const id of IDS) expect(text).not.toContain(id);
          expect(messageBytes(m)).toBeLessThanOrEqual(FCM_MAX_BYTES);
        }
      }),
      { numRuns: RUNS },
    );
  });
  it('drops old decisions, non-public cells and anything already sent', () => {
    expect(plan([push({ decisionTimeMs: NOW - 600_001 })], [sub()], NOW, none)).toHaveLength(0);
    expect(plan([push({ precision: null })], [sub()], NOW, none)).toHaveLength(0);
    const sent = { has: (k: string) => k === sentKey(ID, CELL, `${CELL}|1`, 'CONFIRMED') };
    expect(plan([push()], [sub()], NOW, sent)).toHaveLength(0);
    expect(plan([push()], [sub({ kinds: ['RESTORED'] })], NOW, none)).toHaveLength(0);
  });
  it('uses wide-area words for COARSE precision', () => {
    const [m] = plan([push({ precision: 'COARSE' })], [sub()], NOW, none);
    expect(m?.body).toContain('wide area');
  });
});

describe('L12_string_pack (server push texts)', () => {
  it('has no digits and is small', () => {
    for (const t of allPushTexts()) {
      expect(t).not.toMatch(/\d/);
      expect(new TextEncoder().encode(t).byteLength).toBeLessThan(200);
    }
  });
});
