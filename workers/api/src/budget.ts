// Daily write budget (R11.4, R11.5). Pure.
export const DAY_MS = 86_400_000;

export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

/** True once today's rows written pass the configured fraction of the free daily limit: state events go first. */
export function shouldShed(rowsToday: number, dailyLimit: number, fraction: number): boolean {
  return rowsToday >= dailyLimit * fraction;
}

export type Counters = Record<string, number>;

export function bump(counters: Counters, name: string, by = 1): void {
  counters[name] = (counters[name] ?? 0) + by;
}
