// Home Watch scenario (home-watch task 9, design section 10): the station's power goes off, the home router goes down with
// it, and the station reconnects hours later. Build time and test only. It drives the same pure functions the Worker uses
// (`homeState`, `mergeWindow` in packages/shared) on a timeline of deliveries, so the viewer's answer at each moment can be
// checked. Every event the scenario makes is simulated and carries `simulated: true`.
import { HEARTBEAT_ON_BATTERY, homeState, type HomeView, mergeWindow, type StationEvent } from '@outage/shared';

export const HEARTBEAT_MS = 10 * 60_000;

export interface HomeScenarioParams {
  /** Power cut time, ms after the start. The station has been ON and heard before it. */
  cutMs: number;
  /** How long the router stays down after the cut. The station uploads nothing in that time. */
  routerDownMs: number;
  /** When the power comes back, ms after the start, or null if it is still off when the router returns. */
  powerBackMs: number | null;
  /** Order in which the buffered events are uploaded at reconnect (a permutation of their indexes), for H2. */
  uploadOrder?: number[];
}

export interface SimStationEvent extends StationEvent {
  simulated: true;
}

/** One delivery to the Worker: the receive time and the events in it. */
export interface Delivery {
  receiveMs: number;
  events: SimStationEvent[];
}

const ev = (type: string, timeMs: number, reason?: string): SimStationEvent =>
  reason === undefined ? { type, timeMs, simulated: true } : { type, timeMs, reason, simulated: true };

/**
 * The station's uploads. Before the cut: an ARMED heartbeat every 10 minutes, each delivered at once. From the cut until
 * the router returns: nothing arrives; the station records its UNPLUG, battery heartbeats and (if power returns in that
 * time) its REPLUG and ARMED heartbeats, and uploads them all at reconnect in [uploadOrder]. After that: live again.
 */
export function stationDeliveries(p: HomeScenarioParams, endMs: number): Delivery[] {
  const out: Delivery[] = [];
  const reconnectMs = p.cutMs + p.routerDownMs;
  for (let t = 0; t < p.cutMs; t += HEARTBEAT_MS) out.push({ receiveMs: t, events: [ev('ARMED', t)] });
  const buffered: SimStationEvent[] = [ev('UNPLUG', p.cutMs)];
  const powered = (t: number) => p.powerBackMs !== null && t >= p.powerBackMs;
  if (p.powerBackMs !== null && p.powerBackMs < reconnectMs) buffered.push(ev('REPLUG', p.powerBackMs));
  for (let t = p.cutMs + HEARTBEAT_MS; t < reconnectMs; t += HEARTBEAT_MS) {
    buffered.push(powered(t) ? ev('ARMED', t) : ev('DISARMED', t, HEARTBEAT_ON_BATTERY));
  }
  const order = p.uploadOrder && p.uploadOrder.length === buffered.length ? p.uploadOrder : buffered.map((_, i) => i);
  out.push({ receiveMs: reconnectMs, events: order.map((i) => buffered[i]) });
  if (p.powerBackMs !== null && p.powerBackMs >= reconnectMs) out.push({ receiveMs: p.powerBackMs, events: [ev('REPLUG', p.powerBackMs)] });
  for (let t = reconnectMs + HEARTBEAT_MS; t <= endMs; t += HEARTBEAT_MS) {
    out.push({ receiveMs: t, events: [powered(t) ? ev('ARMED', t) : ev('DISARMED', t, HEARTBEAT_ON_BATTERY)] });
  }
  return out.sort((a, b) => a.receiveMs - b.receiveMs);
}

/** What the viewer would read at `atMs`: the Worker's view after every delivery received by then. */
export function viewerAt(deliveries: readonly Delivery[], atMs: number): HomeView {
  let window: StationEvent[] = [];
  let lastSeen: number | null = null;
  for (const d of deliveries) {
    if (d.receiveMs > atMs) break;
    window = mergeWindow(window, d.events);
    lastSeen = d.receiveMs;
  }
  return homeState(window, lastSeen, atMs);
}
