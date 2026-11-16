// Home push planner (home-watch task 6, R5; property H6). Pure: no I/O, the clock is an input. It turns one change of a
// station's state into messages for that station's viewers. It never sends and never sees a token.
// It reuses the alerts quiet-window test, the 10-minute age limit, the channels and the FCM size limit.
import { CHANNEL_LOUD, CHANNEL_QUIET, FCM_MAX_BYTES, PUSH_MAX_AGE_MS } from '../alerts/planner.ts';
import { localMinuteOfDay, quietContains } from '../alerts/quiet.ts';

export type HomeKind = 'ON' | 'OFF' | 'OFFLINE';

/** One change of a station's state. `version` is the event time of the change (OFFLINE: the last time the station was heard). */
export interface HomeChange {
  stationInstall: string;
  kind: HomeKind;
  version: number;
  /** When the change happened. For OFFLINE, when the silence limit passed. */
  eventTimeMs: number;
  /** The power state before the silence, for the OFFLINE text. */
  lastKnown: { state: 'ON' | 'OFF'; sinceMs: number } | null;
}

/** What the planner needs from a pair. No token (the sender looks it up) and no install id. */
export interface HomePair {
  pairId: string;
  quietStartMin: number;
  quietEndMin: number;
  tzOffsetMin: number;
  stationName: string | null;
}

export interface HomeMessage {
  pairId: string;
  version: number;
  kind: HomeKind;
  channel: typeof CHANNEL_LOUD | typeof CHANNEL_QUIET;
  /** R5.7: high for OFF and ON, normal for OFFLINE. */
  priority: 'HIGH' | 'NORMAL';
  title: string;
  body: string;
  /** FCM data values are strings. The app reads `sinceMs` and shows the time in its own time zone (R4.1). */
  data: Record<string, string>;
}

/** "2:14 p.m." in the viewer's local time (a UTC offset in minutes, as the quiet hours use). */
export function clockText(ms: number, tzOffsetMin: number): string {
  const minute = localMinuteOfDay(ms, tzOffsetMin);
  const h = Math.floor(minute / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minute % 60).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

const DEFAULT_NAME = 'Home';

function texts(change: HomeChange, pair: HomePair): { title: string; body: string } {
  const name = pair.stationName ?? DEFAULT_NAME;
  const at = (ms: number) => clockText(ms, pair.tzOffsetMin);
  if (change.kind === 'OFF') return { title: `${name}: power off since ${at(change.version)}`, body: 'The station phone stopped charging.' };
  if (change.kind === 'ON') return { title: `${name}: power is back since ${at(change.version)}`, body: 'The station phone is charging again.' };
  const known = change.lastKnown;
  return {
    title: `${name} station is offline`,
    body: known ? `Last known: power ${known.state === 'ON' ? 'on' : 'off'} since ${at(known.sinceMs)}` : 'No power state yet.',
  };
}

/**
 * Messages for one change. Rules:
 * - ON and OFF older than 10 minutes at plan time give nothing (R5.6); the state still updates elsewhere.
 * - A pair that already has (pair, version, kind) in the sent memory gets nothing (R5.4).
 * - OFFLINE always goes to the quiet channel, and so does anything inside the viewer's quiet hours (R5.2, R5.5).
 */
export function planHome(change: HomeChange, pairs: readonly HomePair[], nowMs: number, isSent: (pairId: string, version: number, kind: HomeKind) => boolean): HomeMessage[] {
  if (change.kind !== 'OFFLINE' && nowMs - change.eventTimeMs > PUSH_MAX_AGE_MS) return [];
  const out: HomeMessage[] = [];
  for (const pair of pairs) {
    if (isSent(pair.pairId, change.version, change.kind)) continue;
    const quiet = change.kind === 'OFFLINE' || quietContains(pair.quietStartMin, pair.quietEndMin, pair.tzOffsetMin, nowMs);
    const { title, body } = texts(change, pair);
    const sinceMs = change.kind === 'OFFLINE' ? (change.lastKnown?.sinceMs ?? null) : change.version;
    const msg: HomeMessage = {
      pairId: pair.pairId,
      version: change.version,
      kind: change.kind,
      channel: quiet ? CHANNEL_QUIET : CHANNEL_LOUD,
      priority: change.kind === 'OFFLINE' ? 'NORMAL' : 'HIGH',
      title,
      body,
      data: { type: 'HOME', pairId: pair.pairId, state: change.kind, sinceMs: sinceMs === null ? '' : String(sinceMs) },
    };
    if (new TextEncoder().encode(JSON.stringify(msg)).byteLength > FCM_MAX_BYTES) continue;
    out.push(msg);
  }
  return out;
}
