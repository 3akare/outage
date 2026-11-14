import { childrenOf, parentOf } from '@outage/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyMemberEvent,
  applyRemoval,
  expireMembers,
  isRecentlyArmed,
  MEMBER_TTL_MS,
  type MemberEvent,
  type Members,
  memberCount,
  recentlyArmedCount,
} from '../src/area/members.ts';
import { NUM_RUNS } from './runs.ts';

const P1 = '87754e649ffffff';
const P2 = '8775534b2ffffff';
const KIDS = [...childrenOf(P1), ...childrenOf(P2)];
const ids = ['a', 'b', 'c'];

const evArb = fc.record({
  installId: fc.constantFrom(...ids),
  cell: fc.constantFrom(...KIDS.slice(0, 5), ...KIDS.slice(7, 9)),
  type: fc.constantFrom('ARMED', 'DISARMED', 'UNPLUG', 'REPLUG', 'BATTERY_FULL' as const),
  eventTimeMs: fc.integer({ min: 1, max: 40 }),
  weight: fc.constantFrom(1, 0.8),
}) as fc.Arbitrary<MemberEvent>;

const run = (events: MemberEvent[]) => {
  let members: Members = new Map();
  const outs = events.map((ev) => {
    const s = applyMemberEvent(members, ev, parentOf);
    members = s.members;
    return { ev, s };
  });
  return { members, outs };
};

describe('A10 membership and moves', () => {
  it('A10_move_closes_old_cell: one cell per install = cell of its latest event; a move emits a MOVED disarm for the old cell at the new time', () => {
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 30 }), (events) => {
        const { members, outs } = run(events);
        for (const id of ids) {
          const mine = events.filter((e) => e.installId === id);
          const m = members.get(id);
          if (mine.length === 0) {
            expect(m).toBeUndefined();
            continue;
          }
          // The event that wins by (time, cell) decides the cell, as long as it was not itself ignored as stale.
          const best = mine.reduce((a, b) => (b.eventTimeMs > a.eventTimeMs || (b.eventTimeMs === a.eventTimeMs && b.cell > a.cell) ? b : a));
          expect(m?.cell).toBe(best.cell);
          expect(m?.lastEventMs).toBe(best.eventTimeMs);
        }
        // every member is in exactly one cell by construction; counts add up
        const total = KIDS.reduce((n, c) => n + memberCount(members, c), 0);
        expect(total).toBe(members.size);
        // a synthetic disarm only closes an armed old cell at the new event's time
        const state = new Map<string, { cell: string; armed: boolean }>();
        for (const { ev, s } of outs) {
          const before = state.get(ev.installId);
          const after = s.members.get(ev.installId);
          if (s.synthetic) {
            expect(before?.armed).toBe(true);
            expect(s.synthetic).toEqual({ installId: ev.installId, cell: before?.cell, eventTimeMs: ev.eventTimeMs, reason: 'MOVED' });
            expect(after?.cell).toBe(ev.cell);
            expect(after?.armed).toBe(ev.type === 'ARMED');
          }
          if (s.removal) {
            expect(s.removal).toEqual({ installId: ev.installId, oldCell: before?.cell, timeMs: ev.eventTimeMs });
            expect(parentOf(s.removal.oldCell)).not.toBe(parentOf(ev.cell));
          }
          if (after) state.set(ev.installId, { cell: after.cell, armed: after.armed });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('A10_final_cell_independent_of_arrival_order', () => {
    fc.assert(
      fc.property(
        fc
          .array(evArb, { minLength: 1, maxLength: 20 })
          .chain((e) => fc.tuple(fc.constant(e), fc.shuffledSubarray(e, { minLength: e.length, maxLength: e.length }))),
        ([a, b]) => {
          const x = run(a).members;
          const y = run(b).members;
          for (const id of ids) {
            expect(x.get(id)?.cell).toBe(y.get(id)?.cell);
            expect(x.get(id)?.lastEventMs).toBe(y.get(id)?.lastEventMs);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('A10_move_example: armed in A then event in B closes A, no removal inside one parent, removal across parents', () => {
    const [a, b] = childrenOf(P1);
    const c = childrenOf(P2)[0];
    let m: Members = new Map();
    const step = (cell: string, type: MemberEvent['type'], t: number) => {
      const s = applyMemberEvent(m, { installId: 'a', cell, type, eventTimeMs: t, weight: 1 }, parentOf);
      m = s.members;
      return s;
    };
    expect(step(a, 'ARMED', 10).synthetic).toBeNull();
    const s2 = step(b, 'UNPLUG', 20);
    expect(s2.synthetic).toEqual({ installId: 'a', cell: a, eventTimeMs: 20, reason: 'MOVED' });
    expect(s2.removal).toBeNull();
    expect(memberCount(m, a)).toBe(0);
    expect(memberCount(m, b)).toBe(1);
    const s3 = step(c, 'ARMED', 30);
    expect(s3.synthetic).toBeNull(); // not armed in b
    expect(s3.removal).toEqual({ installId: 'a', oldCell: b, timeMs: 30 });
    // an older event in another cell does not move the install back
    expect(step(a, 'ARMED', 5).members).toBe(m);
  });

  it('A10_expiry_weight_and_recently_armed', () => {
    const [a] = childrenOf(P1);
    let m: Members = new Map();
    const add = (id: string, type: MemberEvent['type'], t: number, weight = 1) => {
      m = applyMemberEvent(m, { installId: id, cell: a, type, eventTimeMs: t, weight }, parentOf).members;
    };
    add('w', 'ARMED', 1000);
    add('w', 'DISARMED', 2000);
    add('x', 'ARMED', 1000, 0.4); // weight below 0.5 never counts
    add('y', 'REPLUG', 1000);
    expect(memberCount(m, a)).toBe(2);
    // a phone that unplugged in an outage is still recently armed for 24 h (gap G1) and not after
    expect(recentlyArmedCount(m, a, 2000 + 86_000_000)).toBe(1);
    expect(recentlyArmedCount(m, a, 2000 + 86_400_001)).toBe(0);
    const w = m.get('w');
    expect(w && isRecentlyArmed(w, 2001)).toBe(true);
    expect(expireMembers(m, 2000 + MEMBER_TTL_MS).has('w')).toBe(true);
    expect(expireMembers(m, 2000 + MEMBER_TTL_MS + 1).has('w')).toBe(false);
    expect(expireMembers(m, 1000 + MEMBER_TTL_MS + 1).has('y')).toBe(false);
  });

  it('A10_removal_request_only_removes_a_stale_record', () => {
    const [a] = childrenOf(P1);
    const m: Members = applyMemberEvent(new Map(), { installId: 'a', cell: a, type: 'ARMED', eventTimeMs: 10, weight: 1 }, parentOf).members;
    expect(applyRemoval(m, { installId: 'a', oldCell: a, timeMs: 20 }).size).toBe(0);
    expect(applyRemoval(m, { installId: 'a', oldCell: a, timeMs: 5 })).toBe(m); // the install came back later
    expect(applyRemoval(m, { installId: 'a', oldCell: KIDS[1], timeMs: 20 })).toBe(m);
  });
});
