// alerts-and-light-alarm task 9 (all requirements): a simulated outage gives followers a planned push set that is marked
// simulated and never sent. Real planner, real engine replay.
import { describe, expect, it } from 'vitest';
import { buildDemoReplay } from '../src/scenario.ts';
import { simulatedPushPlan } from '../src/push-plan.ts';

const BASE = 1_800_000_000_000;
const token = 'x'.repeat(40); // made at run time, not a real token

describe('simulated outage push plan', () => {
  const replay = buildDemoReplay();
  const cell = replay.frames.flatMap((f) => f.cells).find((c) => c.state === 'CONFIRMED')?.cell as string;
  const follower = (installId: string, over: Record<string, unknown> = {}) => ({
    installId,
    cell,
    fcmToken: token,
    kinds: ['CONFIRMED', 'RESTORED'] as ('CONFIRMED' | 'RESTORED')[],
    quietStartMin: null,
    quietEndMin: null,
    tzOffsetMin: 0,
    createdMs: BASE,
    ...over,
  });

  it('plans a CONFIRMED and a RESTORED push per follower, all marked simulated, none sent', () => {
    const out = simulatedPushPlan(replay, [follower('a'.repeat(26)), follower('b'.repeat(26))], BASE);
    expect(out.simulated).toBe(true);
    expect(out.sent).toBe(false);
    expect(out.messages.map((m) => m.kind).sort()).toEqual(['CONFIRMED', 'CONFIRMED', 'RESTORED', 'RESTORED']);
    expect(out.messages.every((m) => m.simulated === true)).toBe(true);
  });

  it('plans nothing for a follower of another cell or of another kind', () => {
    const other = follower('c'.repeat(26), { cell: '88a5a9d8e1fffff' });
    const onlyRestored = follower('d'.repeat(26), { kinds: ['RESTORED'] });
    const out = simulatedPushPlan(replay, [other, onlyRestored], BASE);
    expect(out.messages.map((m) => `${m.installId[0]}:${m.kind}`)).toEqual(['d:RESTORED']);
  });

  it('puts a follower inside quiet hours on the quiet channel', () => {
    const quiet = follower('e'.repeat(26), { quietStartMin: 0, quietEndMin: 1439 });
    const out = simulatedPushPlan(replay, [quiet], BASE);
    expect(out.messages.length).toBe(2);
    expect(out.messages.every((m) => m.channel === 'alerts-quiet')).toBe(true);
  });
});
