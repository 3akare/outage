// Write-behind armed state (R11, ADR 0002, property I9). Pure reducer: last writer by event time wins.
export interface InstallState {
  armed: boolean;
  armedSinceMs: number | null; // event time of the ARMED event that began this armed run as seen by this actor
  lastEventMs: number; // event time of the state event that decided `armed`
  lastSeenMs: number; // receive time of the newest event from this install
}

/**
 * Apply one state event. An older event never overwrites a newer one. On an exact tie DISARMED wins, which is the
 * safe direction (it lowers the sensor count) and makes the result independent of arrival order.
 */
export function applyStateEvent(
  prev: InstallState | undefined,
  type: 'ARMED' | 'DISARMED',
  eventTimeMs: number,
  receiveTimeMs: number,
): InstallState {
  const lastSeenMs = Math.max(prev?.lastSeenMs ?? receiveTimeMs, receiveTimeMs);
  const wins = !prev || eventTimeMs > prev.lastEventMs || (eventTimeMs === prev.lastEventMs && type === 'DISARMED');
  if (!wins) return { ...prev, lastSeenMs };
  const armed = type === 'ARMED';
  return {
    armed,
    armedSinceMs: armed ? (prev?.armed ? prev.armedSinceMs : eventTimeMs) : null,
    lastEventMs: eventTimeMs,
    lastSeenMs,
  };
}

/** A detection event proves the phone was alive; it never changes the armed flag. */
export function touchSeen(prev: InstallState | undefined, receiveTimeMs: number): InstallState | undefined {
  return prev ? { ...prev, lastSeenMs: Math.max(prev.lastSeenMs, receiveTimeMs) } : prev;
}

/**
 * Whether memory differs enough from the stored row to spend a write (R11.2). Only the `armed` flag is state, so a
 * gap that closes inside the flush interval (DISARMED then ARMED) leaves nothing to write (design 6.4). `lastSeenMs`
 * alone triggers a write once the stored value is `refreshMs` stale, so area-cells can still expire silent phones.
 * `armedSinceMs` and `lastEventMs` alone never trigger one.
 */
export function needsWrite(mem: InstallState, stored: InstallState | undefined, refreshMs: number): boolean {
  if (!stored) return true;
  if (mem.armed !== stored.armed) return true;
  return mem.lastSeenMs - stored.lastSeenMs >= refreshMs;
}
