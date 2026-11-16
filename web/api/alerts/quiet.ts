// Quiet-window test (alerts-and-light-alarm R7, property L5). Pure. The window only chooses the push channel (R7.4); the
// Light Alarm is on the phone and never reads it (R3.7).

/** Minutes since local midnight for `nowMs` at a UTC offset in minutes. */
export function localMinuteOfDay(nowMs: number, tzOffsetMin: number): number {
  const m = (Math.floor(nowMs / 60_000) + tzOffsetMin) % 1440;
  return m < 0 ? m + 1440 : m;
}

/** Window [start, end). It may cross midnight. `start == end` and a null bound mean no window. */
export function quietContains(
  startMin: number | null,
  endMin: number | null,
  tzOffsetMin: number,
  nowMs: number,
): boolean {
  if (startMin === null || endMin === null || startMin === endMin) return false;
  const local = localMinuteOfDay(nowMs, tzOffsetMin);
  return startMin < endMin ? local >= startMin && local < endMin : local >= startMin || local < endMin;
}
