// Push sender loop (alerts-and-light-alarm design 5.3, R8, R11; property L8). Pure apart from the injected queue and sender.
// One invocation sends at most MAX_SENDS_PER_INVOCATION messages (free plan: 50 subrequests, one is the OAuth token, the
// actor makes a few more). Anything left stays queued and the actor's alarm runs again. A message is removed from the queue in
// the same step that records it as sent, so an accepted message is never sent twice.
import { backoffMs, type PushSender } from './fcm.ts';
import { PUSH_MAX_AGE_MS, PUSH_TTL_SECONDS, type PlannedMessage } from './planner.ts';

export const MAX_SENDS_PER_INVOCATION = 40;

export interface QueuedMessage extends PlannedMessage {
  attempts: number; // failed tries so far
  nextTryMs: number;
}

export interface PushQueue {
  /** Messages whose next try is due, oldest first. */
  due(nowMs: number, limit: number): QueuedMessage[];
  /** The follower's current token, or undefined if the subscription is gone. Never logged. */
  token(installId: string, cell: string): string | undefined;
  markSent(m: QueuedMessage, nowMs: number, name: string | null): void;
  reschedule(m: QueuedMessage, atMs: number, failed: boolean): void;
  drop(m: QueuedMessage): void;
  /** UNREGISTERED: remove the subscription and its queued messages (R8.2). */
  removeSubscription(installId: string, cell: string): void;
}

export interface RunReport {
  attempted: number;
  sent: number;
  removed: number;
  backedOff: boolean;
}

export async function runSends(queue: PushQueue, sender: PushSender, nowMs: number): Promise<RunReport> {
  const batch = queue.due(nowMs, MAX_SENDS_PER_INVOCATION);
  const report: RunReport = { attempted: 0, sent: 0, removed: 0, backedOff: false };
  for (let i = 0; i < batch.length; i++) {
    const m = batch[i] as QueuedMessage;
    if (nowMs - m.decisionTimeMs > PUSH_MAX_AGE_MS) {
      queue.drop(m); // R6.9: too old to be useful
      continue;
    }
    const token = queue.token(m.installId, m.cell);
    if (token === undefined) {
      queue.drop(m);
      continue;
    }
    report.attempted++;
    const r = await sender.send({
      token,
      channel: m.channel,
      title: m.title,
      body: m.body,
      data: m.data,
      ttlSeconds: PUSH_TTL_SECONDS,
    });
    if (r.kind === 'ok') {
      queue.markSent(m, nowMs, r.name);
      report.sent++;
    } else if (r.kind === 'unregistered') {
      queue.removeSubscription(m.installId, m.cell);
      report.removed++;
    } else if (r.kind === 'drop') {
      queue.drop(m);
    } else {
      // QUOTA_EXCEEDED or UNAVAILABLE: back off this message, and hold the rest of the batch to the same time without
      // counting a failure against them, so one bad minute does not become a retry storm.
      const at = nowMs + Math.max(backoffMs(m.attempts), r.retryAfterMs ?? 0);
      queue.reschedule(m, at, true);
      for (const rest of batch.slice(i + 1)) queue.reschedule(rest, at, false);
      report.backedOff = true;
      break;
    }
  }
  return report;
}
