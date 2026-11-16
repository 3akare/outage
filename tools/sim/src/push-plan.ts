// alerts-and-light-alarm task 9: what the push planner would queue for followers during a simulated outage. Build time only.
// It calls the real PushPlanner (workers/api) on the CONFIRMED and RESTORED frames of a replay and returns the planned
// messages marked simulated. Nothing here imports the sender or FCM client, so nothing can be sent (R6, R8).
import {
  type AreaPush,
  type PlannedMessage,
  plan,
  type Subscription,
} from '../../../workers/api/src/alerts/planner.ts';
import type { Replay } from './replay.ts';

export interface SimulatedPushPlan {
  simulated: true;
  /** Always false: the plan is a plan. There is no send path in this module. */
  sent: false;
  messages: (PlannedMessage & { simulated: true })[];
}

/** Followers are stand-ins with fake tokens made at run time. `baseMs` is the wall clock the replay starts at. */
export function simulatedPushPlan(
  replay: Replay,
  followers: readonly Subscription[],
  baseMs: number,
): SimulatedPushPlan {
  const pushes: { push: AreaPush; nowMs: number }[] = [];
  for (const kind of ['CONFIRMED', 'RESTORED'] as const) {
    const frame = replay.frames.find((f) => f.cells.some((c) => c.state === kind));
    const cell = frame?.cells.find((c) => c.state === kind)?.cell;
    if (!frame || !cell) continue;
    const t = baseMs + frame.tMs;
    pushes.push({ push: { cell, episodeId: `sim|${cell}|1`, kind, decisionTimeMs: t, precision: 'CELL' }, nowMs: t });
  }
  const sentNothing = { has: () => false };
  const messages = pushes.flatMap(({ push, nowMs }) =>
    plan([push], followers, nowMs, sentNothing).map((m) => ({ ...m, simulated: true as const })),
  );
  return { simulated: true, sent: false, messages };
}
