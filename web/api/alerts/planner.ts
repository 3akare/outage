// PushPlanner (alerts-and-light-alarm design 5.2, R6, R7; properties L5, L6, L12). Pure: no I/O, the clock is an input.
// It turns the area actor's de-duplicated pushes into messages for followers. It never sends and never sees a token.
import type { Precision } from '../area/view.ts';
import { quietContains } from './quiet.ts';
import { type PushKindName, pushText } from './strings.ts';

export const PUSH_MAX_AGE_MS = 600_000; // R6.9, the engine rule kept as a second check
export const PUSH_TTL_SECONDS = 600; // an old message must not be delivered later
export const FCM_MAX_BYTES = 4096; // https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode (INVALID_ARGUMENT, message too big)
export const CHANNEL_LOUD = 'alerts';
export const CHANNEL_QUIET = 'alerts-quiet';

/** One push from the area actor with what the actor knows when it is raised. `precision` is null when no public status covers the cell (R6.5). */
export interface AreaPush {
  cell: string;
  episodeId: string;
  kind: PushKindName;
  decisionTimeMs: number;
  precision: Precision | null;
}

export interface Subscription {
  installId: string;
  cell: string;
  fcmToken: string;
  kinds: PushKindName[];
  quietStartMin: number | null;
  quietEndMin: number | null;
  tzOffsetMin: number;
  createdMs: number;
}

/** A message without its token. The sender adds the token from the subscription at send time, so a refreshed token is used. */
export interface PlannedMessage {
  installId: string;
  cell: string;
  episodeId: string;
  kind: PushKindName;
  channel: typeof CHANNEL_LOUD | typeof CHANNEL_QUIET;
  title: string;
  body: string;
  data: { cell: string; episodeId: string; kind: PushKindName };
  decisionTimeMs: number;
}

export const sentKey = (installId: string, cell: string, episodeId: string, kind: string): string =>
  `${installId}|${cell}|${episodeId}|${kind}`;

/** Memory of what was already sent or is already queued, by `sentKey`. */
export interface SentMemory {
  has(key: string): boolean;
}

/** Size in bytes of the FCM payload the sender builds from a message (token excluded, 4096 is for the whole payload). */
export function messageBytes(m: PlannedMessage): number {
  return new TextEncoder().encode(JSON.stringify({ n: { t: m.title, b: m.body }, d: m.data, c: m.channel })).byteLength;
}

export function plan(
  pushes: readonly AreaPush[],
  subs: readonly Subscription[],
  nowMs: number,
  sent: SentMemory,
): PlannedMessage[] {
  const out: PlannedMessage[] = [];
  const seen = new Set<string>();
  for (const p of pushes) {
    if (p.kind !== 'CONFIRMED' && p.kind !== 'RESTORED') continue;
    if (nowMs - p.decisionTimeMs > PUSH_MAX_AGE_MS) continue; // R6.9
    if (p.precision === null) continue; // R6.5
    const text = pushText(p.kind, p.precision);
    for (const s of subs) {
      if (s.cell !== p.cell || !s.kinds.includes(p.kind)) continue;
      const key = sentKey(s.installId, s.cell, p.episodeId, p.kind);
      if (sent.has(key) || seen.has(key)) continue; // R6.4
      const quiet = quietContains(s.quietStartMin, s.quietEndMin, s.tzOffsetMin, nowMs);
      const msg: PlannedMessage = {
        installId: s.installId,
        cell: s.cell,
        episodeId: p.episodeId,
        kind: p.kind,
        channel: quiet ? CHANNEL_QUIET : CHANNEL_LOUD,
        title: text.title,
        body: text.body,
        data: { cell: p.cell, episodeId: p.episodeId, kind: p.kind },
        decisionTimeMs: p.decisionTimeMs,
      };
      if (messageBytes(msg) > FCM_MAX_BYTES) continue;
      seen.add(key);
      out.push(msg);
    }
  }
  return out;
}
