// Home Watch station state (home-watch R2, design section 4). Pure: no I/O, the clock is an input.
// The state is the power state of one plug, derived only from that station's own events. It never reads an area outage
// decision (R2.8, property H4). Lives here, not in core/detection, because it is not outage detection.

/** R2.4: silence of this long, with no message at all from the station, shows OFFLINE. */
export const SILENCE_LIMIT_MS = 30 * 60_000;
/** Most power events one station's window keeps. Older ones fold into one seed event (`mergeWindow`). */
export const STATION_WINDOW_MAX = 500;

export type PowerState = 'UNKNOWN' | 'ON' | 'OFF';
export type HomeStatus = PowerState | 'OFFLINE';

/** A station event as the Worker keeps it: type, event time and (for DISARMED) its reason. Other fields never matter here. */
export interface StationEvent {
  type: string;
  timeMs: number;
  reason?: string | null;
}

export interface PowerFold {
  state: PowerState;
  sinceMs: number | null;
}

export interface HomeView {
  status: HomeStatus;
  sinceMs: number | null;
  /** Only with OFFLINE: the power state before the silence, if one was ever known. */
  lastKnown: { state: 'ON' | 'OFF'; sinceMs: number } | null;
}

/** Only these change the power state (R2.1). BATTERY_FULL, every DISARMED (heartbeat or not) and LABEL are ignored (H3). */
const RANK: Record<string, number> = { ARMED: 0, REPLUG: 1, UNPLUG: 2 };
const isPower = (e: StationEvent): boolean => Object.hasOwn(RANK, e.type) && Number.isFinite(e.timeMs);

/** Time order. At the same instant UNPLUG goes last, so a tie reads as OFF. Total order: the result never depends on input order. */
const byTime = (a: StationEvent, b: StationEvent): number => a.timeMs - b.timeMs || RANK[a.type] - RANK[b.type];

/**
 * The power state after all events, in event-time order.
 * - `UNPLUG` starts OFF at its time. A second `UNPLUG` while OFF keeps the first time (the power was off since then).
 * - `REPLUG` or `ARMED` starts ON at its time only when not already ON, so a heartbeat never moves "since".
 */
export function foldPower(events: readonly StationEvent[]): PowerFold {
  let state: PowerState = 'UNKNOWN';
  let sinceMs: number | null = null;
  for (const e of events.filter(isPower).sort(byTime)) {
    if (e.type === 'UNPLUG') {
      if (state !== 'OFF') {
        state = 'OFF';
        sinceMs = e.timeMs;
      }
    } else if (state !== 'ON') {
      state = 'ON';
      sinceMs = e.timeMs;
    }
  }
  return { state, sinceMs };
}

/**
 * The state a viewer sees. `lastSeenMs` is the newest receive time of any message from the station (heartbeats included);
 * null means nothing was ever heard. Silence only ever gives OFFLINE, never OFF (R2.5, H1).
 */
export function homeState(events: readonly StationEvent[], lastSeenMs: number | null, nowMs: number): HomeView {
  const power = foldPower(events);
  const known = power.state === 'UNKNOWN' ? null : { state: power.state, sinceMs: power.sinceMs as number };
  if (lastSeenMs !== null && nowMs - lastSeenMs >= SILENCE_LIMIT_MS) return { status: 'OFFLINE', sinceMs: null, lastKnown: known };
  return { status: power.state, sinceMs: power.sinceMs, lastKnown: null };
}

/**
 * Add new events to a station's window: keep only power events, drop duplicates, sort, and fold everything beyond `max`
 * into one seed event with the same effect (`REPLUG` for ON, `UNPLUG` for OFF at the "since" time). `foldPower` of the result equals
 * `foldPower` of all events whenever the old part came first in time. Pure.
 */
export function mergeWindow(window: readonly StationEvent[], incoming: readonly StationEvent[], max = STATION_WINDOW_MAX): StationEvent[] {
  const seen = new Set<string>();
  const all: StationEvent[] = [];
  for (const e of [...window, ...incoming]) {
    if (!isPower(e)) continue;
    const key = `${e.type}|${e.timeMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ type: e.type, timeMs: e.timeMs });
  }
  all.sort(byTime);
  if (all.length <= max) return all;
  const cut = all.length - max + 1;
  const seed = foldPower(all.slice(0, cut));
  const head: StationEvent = { type: seed.state === 'OFF' ? 'UNPLUG' : 'REPLUG', timeMs: seed.sinceMs as number };
  return [head, ...all.slice(cut)];
}

// ---- viewer API shape (home-watch R4, R7.5; `GET /v1/home/:pairId`) -------------------------------------------------------

/**
 * What a viewer may learn about a station: its state and "since", when the server last heard it, and the name the viewer
 * chose if it chose to sync one. No cell, no install id, no map (R4.5, R7.5).
 */
export interface HomeResponse {
  status: HomeStatus;
  sinceMs: number | null;
  lastKnown: { state: 'ON' | 'OFF'; sinceMs: number } | null;
  /** Receive time of the newest message from the station. The app shows "Station offline" with this age. */
  lastSeenMs: number | null;
  stationName: string | null;
  /** Server time of this answer, so the app can show the age of a cached one. */
  asOfMs: number;
}

const STATUSES: readonly string[] = ['UNKNOWN', 'ON', 'OFF', 'OFFLINE'];
const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** Strict check used by the contract test over `fixtures/home/home-response.json`. */
export function isHomeResponse(v: unknown): v is HomeResponse {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(',');
  if (keys !== 'asOfMs,lastKnown,lastSeenMs,sinceMs,stationName,status') return false;
  const lk = r.lastKnown as Record<string, unknown> | null;
  const lastKnownOk =
    lk === null ||
    (typeof lk === 'object' && Object.keys(lk).sort().join(',') === 'sinceMs,state' && (lk.state === 'ON' || lk.state === 'OFF') && isMs(lk.sinceMs));
  return (
    typeof r.status === 'string' &&
    STATUSES.includes(r.status) &&
    (r.sinceMs === null || isMs(r.sinceMs)) &&
    lastKnownOk &&
    (r.lastSeenMs === null || isMs(r.lastSeenMs)) &&
    (r.stationName === null || typeof r.stationName === 'string') &&
    isMs(r.asOfMs)
  );
}
