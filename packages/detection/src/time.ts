// Local hour and day from a fixed offset. No environment time zone is read (R4.6, R15).

export const SECOND_MS = 1000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const mod = (a: number, b: number): number => ((a % b) + b) % b;

/** Local day index (days since the local epoch) for event time `t`. */
export const localDay = (t: number, offsetMs: number): number => Math.floor((t + offsetMs) / DAY_MS);

/** Local hour of day 0..23. */
export const localHour = (t: number, offsetMs: number): number => Math.floor(mod(t + offsetMs, DAY_MS) / HOUR_MS);

/** Event time at which local day `day` starts. */
export const dayStartMs = (day: number, offsetMs: number): number => day * DAY_MS - offsetMs;

/** Event time at which local hour `hour` of local day `day` starts. */
export const hourStartMs = (day: number, hour: number, offsetMs: number): number =>
  day * DAY_MS + hour * HOUR_MS - offsetMs;
