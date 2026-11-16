import type { AlertsStore } from '../src/alerts/core.ts';
import { type PlannedMessage, sentKey, type Subscription } from '../src/alerts/planner.ts';
import type { QueuedMessage } from '../src/alerts/sender.ts';

/** In-memory AlertsStore with the same contract as SqlAlertsStore. */
export class MemAlertsStore implements AlertsStore {
  subs = new Map<string, Subscription>();
  sent = new Map<string, { installId: string; sentMs: number; name: string | null }>();
  queue = new Map<string, QueuedMessage>();
  private k = (m: { installId: string; cell: string; episodeId: string; kind: string }) =>
    sentKey(m.installId, m.cell, m.episodeId, m.kind);

  putSubscription(s: Subscription) {
    this.subs.set(`${s.installId}|${s.cell}`, { ...s });
    return 1;
  }
  subscriptionsForCell(cell: string) {
    return [...this.subs.values()].filter((s) => s.cell === cell);
  }
  removeSubscriptionRows(installId: string, cell: string) {
    let n = this.subs.delete(`${installId}|${cell}`) ? 1 : 0;
    for (const [k, m] of this.queue)
      if (m.installId === installId && m.cell === cell) n += this.queue.delete(k) ? 1 : 0;
    return n;
  }
  has(key: string) {
    return this.sent.has(key) || this.queue.has(key);
  }
  enqueue(msgs: readonly PlannedMessage[], nowMs: number) {
    let n = 0;
    for (const m of msgs) {
      if (this.has(this.k(m))) continue;
      this.queue.set(this.k(m), { ...m, attempts: 0, nextTryMs: nowMs });
      n++;
    }
    return n;
  }
  nextDueMs() {
    const t = [...this.queue.values()].map((m) => m.nextTryMs);
    return t.length ? Math.min(...t) : null;
  }
  due(nowMs: number, limit: number) {
    return [...this.queue.values()]
      .filter((m) => m.nextTryMs <= nowMs)
      .sort((a, b) => a.nextTryMs - b.nextTryMs)
      .slice(0, limit);
  }
  token(installId: string, cell: string) {
    return this.subs.get(`${installId}|${cell}`)?.fcmToken;
  }
  markSent(m: QueuedMessage, nowMs: number, name: string | null) {
    this.sent.set(this.k(m), { installId: m.installId, sentMs: nowMs, name });
    this.queue.delete(this.k(m));
  }
  reschedule(m: QueuedMessage, atMs: number, failed: boolean) {
    const q = this.queue.get(this.k(m));
    if (q) {
      q.nextTryMs = atMs;
      if (failed) q.attempts++;
    }
  }
  drop(m: QueuedMessage) {
    this.queue.delete(this.k(m));
  }
  removeSubscription(installId: string, cell: string) {
    this.removeSubscriptionRows(installId, cell);
  }
  deleteInstall(installId: string) {
    let n = 0;
    for (const [k, s] of this.subs) if (s.installId === installId) n += this.subs.delete(k) ? 1 : 0;
    for (const [k, m] of this.queue) if (m.installId === installId) n += this.queue.delete(k) ? 1 : 0;
    for (const [k, s] of this.sent) if (s.installId === installId) n += this.sent.delete(k) ? 1 : 0;
    return n;
  }
  prune(beforeMs: number) {
    let n = 0;
    for (const [k, s] of this.sent) if (s.sentMs < beforeMs) n += this.sent.delete(k) ? 1 : 0;
    return n;
  }
}
