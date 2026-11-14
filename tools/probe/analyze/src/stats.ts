/** Nearest-rank percentile: rank = ceil(p/100 * n), 1-based, on sorted values. Empty input gives null. */
export function nearestRank(values: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError('p must be in (0, 100]');
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
}

export type Summary = { n: number; p50: number | null; p95: number | null; max: number | null };
export const summarize = (values: readonly number[]): Summary => ({
  n: values.length,
  p50: nearestRank(values, 50),
  p95: nearestRank(values, 95),
  max: values.length ? Math.max(...values) : null,
});
