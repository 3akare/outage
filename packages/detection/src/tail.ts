// Poisson upper tail P(X >= k | mu), summed upward so p near 1e-12 keeps relative precision (design section 7, R5.4).

const TABLE_SIZE = 171;
/** ln(i!) for i < 171, built by exact running sums of ln(j). */
const LN_FACT: number[] = (() => {
  const t = [0];
  for (let i = 1; i < TABLE_SIZE; i++) t.push(t[i - 1] + Math.log(i));
  return t;
})();

/** ln Gamma(x) for x >= 1 integer-valued or not. Table for small integers, Stirling series otherwise. */
export function lnGamma(x: number): number {
  if (!(x > 0)) throw new RangeError('lnGamma needs x > 0');
  if (Number.isInteger(x) && x - 1 < TABLE_SIZE) return LN_FACT[x - 1];
  // Shift small x up so the Stirling series is accurate, then undo the shift.
  let shift = 0;
  let y = x;
  while (y < 10) {
    shift += Math.log(y);
    y += 1;
  }
  const y2 = y * y;
  const series = 1 / (12 * y) - 1 / (360 * y * y2) + 1 / (1260 * y2 * y2 * y) - 1 / (1680 * y2 * y2 * y2 * y);
  return (y - 0.5) * Math.log(y) - y + 0.5 * Math.log(2 * Math.PI) + series - shift;
}

/** ln(k!) */
export const lnFactorial = (k: number): number => lnGamma(k + 1);

export function tail(k: number, mu: number): number {
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be an integer >= 0');
  if (!(mu >= 0) || !Number.isFinite(mu)) throw new RangeError('mu must be a finite number >= 0');
  if (k === 0) return 1;
  if (mu === 0) return 0;
  const first = Math.exp(-mu + k * Math.log(mu) - lnFactorial(k));
  // Underflow of the first term. Far in the upper tail (k > mu) the answer is below any threshold (design section 10).
  // Below the mean (k <= mu) every lower term is smaller still, so P(X < k) is negligible and the tail is 1.
  if (first < 1e-300) return k > mu ? 0 : 1;
  let term = first;
  let sum = 0;
  let i = k;
  for (let guard = 0; guard < 1_000_000; guard++) {
    sum += term;
    i += 1;
    term *= mu / i;
    if (i > mu && term < sum * 1e-17) break;
  }
  return Math.min(1, sum);
}
