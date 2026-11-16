// Home Watch core for one pairing shard (home-watch tasks 5, 6, 7; ADR 0036). Owns the stations whose pairs live in this
// shard: their state, the event window, silence detection, the home push and the viewer's view. Synchronous store port, the
// clock and the sender are inputs, so Vitest runs it with a memory store and a fake sender.
import {
  foldPower,
  type HomeResponse,
  homeState,
  mergeWindow,
  type PowerState,
  SILENCE_LIMIT_MS,
  type StationEvent,
} from '@outage/shared';
import type { PushSender } from '../alerts/fcm.ts';
import { PUSH_MAX_AGE_MS, PUSH_TTL_SECONDS } from '../alerts/planner.ts';
import type { PairRow } from '../pairing/core.ts';
import { backoffMs } from '../alerts/fcm.ts';
import { type HomeChange, type HomeKind, planHome } from './planner.ts';
import { earliest } from './wake.ts';

export interface StationRow {
  stationInstall: string;
  state: PowerState;
  sinceMs: number | null;
  /** Event time of the last power change. Part of the sent-memory key. */
  stateVersion: number;
  /** Newest receive time of any message from the station. Written at most every LAST_SEEN_WRITE_MS (R8.1). */
  lastSeenMs: number;
  offline: boolean;
}

/** Storage the core needs. Writes return rows written. The pair rows are the pairing core's; the core only reads them and marks a dead token. */
export interface HomeStore {
  listStations(): StationRow[];
  putStation(row: StationRow): number;
  deleteStation(stationInstall: string): number;
  pairsOfStation(stationInstall: string): PairRow[];
  getPair(pairId: string): PairRow | undefined;
  hasSent(pairId: string, version: number, kind: HomeKind): boolean;
  markSent(pairId: string, version: number, kind: HomeKind): number;
  /** Forget sent memory for changes older than `beforeVersion`. */
  pruneSent(beforeVersion: number): number;
  markPushFailed(pairId: string, atMs: number): number;
  /** R9 (design): a pair whose token has been dead since before `beforeMs` is removed. Returns pairs removed. */
  removePairsFailedBefore(beforeMs: number): number;
}

/** One event of a watched station as the area actor forwards it. */
export interface ForwardedEvent {
  type: string;
  eventTimeMs: number;
  reason?: string | null;
}

export const LAST_SEEN_WRITE_MS = 600_000; // R8.1
export const PRUNE_EVERY_MS = 86_400_000;
export const DEAD_TOKEN_KEEP_MS = 7 * 86_400_000; // design section 9
const SENT_KEEP_MS = 7 * 86_400_000;
const MAX_SEND_TRIES = 5;

interface Tracked {
  row: StationRow;
  window: StationEvent[];
  writtenSeenMs: number;
  pending: { change: HomeChange; retryAt: number; tries: number } | null;
}

export class HomeCore {
  private readonly stations = new Map<string, Tracked>();
  private loaded = false;
  private nextPruneMs: number;
  /** Rows written since the last report. The shell may read it for counters. */
  rowsWritten = 0;

  constructor(
    private readonly store: HomeStore,
    private readonly sender: PushSender | null,
    nowMs: number,
  ) {
    this.nextPruneMs = nowMs + PRUNE_EVERY_MS;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    for (const row of this.store.listStations()) this.stations.set(row.stationInstall, this.fromRow(row));
  }

  /** After a restart the window holds one seed event that stands for the stored state (ADR 0036). */
  private fromRow(row: StationRow): Tracked {
    const window: StationEvent[] = row.state === 'UNKNOWN' ? [] : [{ type: row.state === 'ON' ? 'REPLUG' : 'UNPLUG', timeMs: row.sinceMs as number }];
    return { row, window, writtenSeenMs: row.lastSeenMs, pending: null };
  }

  private write(t: Tracked): void {
    this.rowsWritten += this.store.putStation(t.row);
    t.writtenSeenMs = t.row.lastSeenMs;
  }

  // ---- observe: events of a station (task 3 state, task 5 last-seen rule, task 6 push) -------------------------------

  /**
   * One batch of a station's events, forwarded by its area actor. Returns false when no pair needs this station any more,
   * so the area actor can stop forwarding.
   */
  async observe(stationInstall: string, events: readonly ForwardedEvent[], receiveMs: number): Promise<boolean> {
    this.load();
    let t = this.stations.get(stationInstall);
    if (!t) {
      if (this.store.pairsOfStation(stationInstall).length === 0) return false;
      t = this.fromRow({ stationInstall, state: 'UNKNOWN', sinceMs: null, stateVersion: 0, lastSeenMs: receiveMs, offline: false });
      this.stations.set(stationInstall, t);
      this.write(t);
    }
    const prev = t.row;
    t.window = mergeWindow(t.window, events.map((e) => ({ type: e.type, timeMs: e.eventTimeMs, reason: e.reason ?? null })));
    const fold = foldPower(t.window);
    const lastSeenMs = Math.max(prev.lastSeenMs, receiveMs);
    const stateChanged = fold.state !== prev.state || fold.sinceMs !== prev.sinceMs;
    t.row = {
      ...prev,
      state: fold.state,
      sinceMs: fold.sinceMs,
      stateVersion: stateChanged && fold.sinceMs !== null ? fold.sinceMs : prev.stateVersion,
      lastSeenMs,
      offline: false,
    };
    // R8.1, R8.2: a write on a state change or a flag change, otherwise last-seen at most every 10 minutes.
    if (stateChanged || prev.offline || lastSeenMs - t.writtenSeenMs >= LAST_SEEN_WRITE_MS) this.write(t);

    // R5.1, R5.6: a push only for a power change, and only when the news is fresh. UNKNOWN to ON is the first heartbeat after
    // pairing, not news. A late batch that ends in the same power state is not a change.
    const powerChanged = fold.state !== prev.state && fold.state !== 'UNKNOWN' && !(prev.state === 'UNKNOWN' && fold.state === 'ON');
    if (powerChanged && fold.sinceMs !== null) {
      const change: HomeChange = { stationInstall, kind: fold.state as 'ON' | 'OFF', version: fold.sinceMs, eventTimeMs: fold.sinceMs, lastKnown: null };
      if (receiveMs - change.eventTimeMs <= PUSH_MAX_AGE_MS) await this.send(t, change, receiveMs);
    }
    return true;
  }

  // ---- silence and retries (task 5) ------------------------------------------------------------------------------

  /** Earliest time `tick` has work: a station passing the silence limit, a push retry, or the daily prune. Null when idle. */
  nextDueMs(): number | null {
    this.load();
    if (this.stations.size === 0) return null;
    const dues: (number | null)[] = [this.nextPruneMs];
    for (const t of this.stations.values()) {
      if (!t.row.offline) dues.push(t.row.lastSeenMs + SILENCE_LIMIT_MS);
      if (t.pending) dues.push(t.pending.retryAt);
    }
    return earliest(...dues);
  }

  /** Run what is due at `nowMs`. R6.2: a silent station becomes OFFLINE. The last-seen time is only moved by `observe`. */
  async tick(nowMs: number): Promise<void> {
    this.load();
    for (const t of [...this.stations.values()]) {
      if (!t.row.offline && nowMs - t.row.lastSeenMs >= SILENCE_LIMIT_MS) {
        t.row = { ...t.row, offline: true };
        this.write(t);
        const known = t.row.state === 'UNKNOWN' ? null : { state: t.row.state, sinceMs: t.row.sinceMs as number };
        await this.send(t, { stationInstall: t.row.stationInstall, kind: 'OFFLINE', version: t.row.lastSeenMs, eventTimeMs: nowMs, lastKnown: known }, nowMs);
      } else if (t.pending && t.pending.retryAt <= nowMs) {
        await this.send(t, t.pending.change, nowMs, t.pending.tries);
      }
    }
    if (nowMs >= this.nextPruneMs) this.prune(nowMs);
  }

  private prune(nowMs: number): void {
    this.nextPruneMs = nowMs + PRUNE_EVERY_MS;
    this.rowsWritten += this.store.pruneSent(nowMs - SENT_KEEP_MS);
    this.rowsWritten += this.store.removePairsFailedBefore(nowMs - DEAD_TOKEN_KEEP_MS);
    for (const id of [...this.stations.keys()]) this.dropIfUnpaired(id);
  }

  // ---- push (task 6) ---------------------------------------------------------------------------------------------

  /** Plan from the current change and send directly (R5.1, no queue). Sent memory makes a retry the same plan again (H6). */
  private async send(t: Tracked, change: HomeChange, nowMs: number, tries = 0): Promise<void> {
    t.pending = null;
    const pairs = this.store.pairsOfStation(change.stationInstall).filter((p) => p.pushFailedMs === null);
    const messages = planHome(change, pairs, nowMs, (pairId, version, kind) => this.store.hasSent(pairId, version, kind));
    if (messages.length === 0 || !this.sender) return;
    let retryAt: number | null = null;
    for (const m of messages) {
      const pair = pairs.find((p) => p.pairId === m.pairId);
      if (!pair) continue;
      const r = await this.sender.send({
        token: pair.fcmToken,
        channel: m.channel,
        title: m.title,
        body: m.body,
        data: m.data,
        ttlSeconds: PUSH_TTL_SECONDS,
        priority: m.priority,
      });
      if (r.kind === 'ok') this.rowsWritten += this.store.markSent(m.pairId, m.version, m.kind);
      else if (r.kind === 'unregistered') this.rowsWritten += this.store.markPushFailed(m.pairId, nowMs); // keep the pair, stop pushing
      else if (r.kind === 'retry') retryAt = Math.max(retryAt ?? 0, nowMs + Math.max(backoffMs(tries), r.retryAfterMs ?? 0));
      // 'drop' (bad request, not configured): retrying does not help.
    }
    if (retryAt !== null && tries + 1 < MAX_SEND_TRIES) t.pending = { change, retryAt, tries: tries + 1 };
  }

  // ---- viewer view (task 7) --------------------------------------------------------------------------------------

  /** The state a viewer may see, or null when the pair does not exist or is not this viewer's (R7.5). */
  view(pairId: string, viewerInstall: string, nowMs: number): HomeResponse | null {
    this.load();
    const pair = this.store.getPair(pairId);
    if (!pair || pair.viewerInstall !== viewerInstall) return null;
    const row = this.stations.get(pair.stationInstall)?.row;
    const seed: StationEvent[] = row && row.state !== 'UNKNOWN' ? [{ type: row.state === 'ON' ? 'REPLUG' : 'UNPLUG', timeMs: row.sinceMs as number }] : [];
    const v = homeState(seed, row?.lastSeenMs ?? null, nowMs);
    return { ...v, lastSeenMs: row?.lastSeenMs ?? null, stationName: pair.stationName, asOfMs: nowMs };
  }

  // ---- removal ---------------------------------------------------------------------------------------------------

  /** After a pair is removed: a station with no pair left is no longer tracked (R7.3). */
  dropIfUnpaired(stationInstall: string): void {
    if (this.store.pairsOfStation(stationInstall).length > 0) return;
    this.stations.delete(stationInstall);
    this.rowsWritten += this.store.deleteStation(stationInstall);
  }

  /** Stop tracking every station that has no pair left (after a viewer's delete-my-data or a removal). */
  sweep(): void {
    this.load();
    for (const id of [...this.stations.keys()]) this.dropIfUnpaired(id);
  }

  /** delete-my-data of an install: forget it from memory. The rows go with `PairStore.deleteInstall`. */
  forget(installId: string): void {
    this.stations.delete(installId);
  }
}
