// The one alarm of a Durable Object, shared by several timers (home-watch R6, design section 6; property H7).
// A Durable Object has a single alarm, and each `setAlarm` call costs a row written:
//   https://developers.cloudflare.com/durable-objects/api/alarms/
//   https://developers.cloudflare.com/durable-objects/platform/pricing/
// So the alarm is set to the earliest due time and moved only when that is needed. Pure.

/** How late the alarm may sit after the earliest due time before it is moved (design 6: re-arm only on a change over 1 minute). */
export const ALARM_GRANULARITY_MS = 60_000;

/** The earliest of the due times that exist, or null when there is none. */
export function earliest(...due: (number | null | undefined)[]): number | null {
  let best: number | null = null;
  for (const d of due) if (d !== null && d !== undefined && (best === null || d < best)) best = d;
  return best;
}

/**
 * What to do with the alarm. `current` is the alarm now set (null if none), `due` the earliest timer due time.
 * Returns the time to set, or null to leave the alarm alone.
 * - No timer: leave it. A stale alarm only fires early and finds nothing to do.
 * - An alarm at or before the due time (or at most one granularity after it): leave it. It fires and re-plans.
 * - Otherwise (no alarm, or it would fire more than one granularity late): set it at the due time, never in the past.
 */
export function planAlarm(current: number | null, due: number | null, nowMs: number): number | null {
  if (due === null) return null;
  if (current !== null && current <= due + ALARM_GRANULARITY_MS) return null;
  return Math.max(due, nowMs + 1);
}
