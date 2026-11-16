// Subscriptions and push dispatch for one area actor (alerts-and-light-alarm design 5.1, 5.3, R6, R8, R10; property L7).
// Pure apart from the injected store. The actor shell owns the clock, the alarm and the FCM client.
import type { FollowRequest } from '@outage/shared';
import { type AreaPush, type PlannedMessage, plan, type SentMemory, type Subscription } from './planner.ts';
import type { PushQueue, QueuedMessage } from './sender.ts';

/** Rows older than this are forgotten (design 5.1). */
export const PUSH_SENT_KEEP_MS = 7 * 86_400_000;

export interface AlertsStore extends PushQueue, SentMemory {
  /** Replaces the row for (install, cell) (R8.5). Returns rows written. */
  putSubscription(s: Subscription): number;
  subscriptionsForCell(cell: string): Subscription[];
  /** Removes the subscription and its queued messages. Returns rows removed. */
  removeSubscriptionRows(installId: string, cell: string): number;
  /** Queue rows, skipping any whose key is already queued or sent. */
  enqueue(msgs: readonly PlannedMessage[], nowMs: number): number;
  nextDueMs(): number | null;
  /** Everything for the install: subscriptions, queued and sent memory (R10.2). Returns rows removed. */
  deleteInstall(installId: string): number;
  prune(beforeMs: number): number;
}

export class AlertsCore {
  constructor(private readonly store: AlertsStore) {}

  follow(req: FollowRequest, nowMs: number): void {
    this.store.putSubscription({
      installId: req.installId,
      cell: req.cell,
      fcmToken: req.fcmToken,
      kinds: req.kinds,
      quietStartMin: req.quietStartMin,
      quietEndMin: req.quietEndMin,
      tzOffsetMin: req.tzOffsetMin,
      createdMs: nowMs,
    });
  }

  unfollow(installId: string, cell: string): void {
    this.store.removeSubscriptionRows(installId, cell);
  }

  /** The push hook: turn the area's de-duplicated pushes into queued messages. Returns how many were queued. */
  onPushes(pushes: readonly AreaPush[], nowMs: number): number {
    if (pushes.length === 0) return 0;
    const subs = [...new Set(pushes.map((p) => p.cell))].flatMap((c) => this.store.subscriptionsForCell(c));
    if (subs.length === 0) return 0;
    return this.store.enqueue(plan(pushes, subs, nowMs, this.store), nowMs);
  }

  deleteInstall(installId: string): number {
    return this.store.deleteInstall(installId);
  }

  prune(nowMs: number): number {
    return this.store.prune(nowMs - PUSH_SENT_KEEP_MS);
  }

  nextDueMs(): number | null {
    return this.store.nextDueMs();
  }

  queue(): PushQueue {
    return this.store;
  }
}

export type { QueuedMessage };
