// Independent high-precision reference for the Poisson tail, in BigInt fixed point (D2).
// P(X >= k) = 1 - sum_{i<k} e^-mu mu^i / i!, computed with 400 fixed digits, so a p near 1e-12 keeps full relative precision.
const DIGITS = 400n;
const ONE = 10n ** DIGITS;

/** e^x for a rational x = num/den >= 0 as fixed point, by Taylor series. */
function expFixed(num: bigint, den: bigint): bigint {
  let term = ONE;
  let sum = ONE;
  for (let i = 1n; term > 0n; i++) {
    term = (term * num) / (den * i);
    sum += term;
  }
  return sum;
}

/** mu = muNum / muDen. Returns P(X >= k) as a number (converted from fixed point at the end). */
export function bigTail(k: number, muNum: bigint, muDen: bigint): number {
  if (k === 0) return 1;
  const expMu = expFixed(muNum, muDen);
  const expNegMu = (ONE * ONE) / expMu;
  // sum_{i<k} mu^i / i! in fixed point
  let term = ONE;
  let s = ONE;
  for (let i = 1; i < k; i++) {
    term = (term * muNum) / (muDen * BigInt(i));
    s += term;
  }
  const lower = (s * expNegMu) / ONE;
  const upper = ONE - lower;
  if (upper <= 0n) return 0;
  // convert to number keeping relative precision: scale to 40 significant digits
  const digits = upper.toString().length;
  const keep = 30;
  const exp10 = digits - Number(DIGITS) - 1; // value ~ d.ddd * 10^exp10
  const mant = Number(upper.toString().slice(0, keep)) / 10 ** (Math.min(digits, keep) - 1);
  return mant * 10 ** exp10;
}
