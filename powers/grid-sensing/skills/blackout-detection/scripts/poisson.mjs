#!/usr/bin/env node
// Poisson helper for blackout detection. No dependencies.
//   tail(k, mu)       P(X >= k) for X ~ Poisson(mu), summed from the upper tail so tiny probabilities stay accurate
//   minKTable(...)    the smallest number of simultaneous drops that is "Possible" or "Confirmed" for n armed phones
// Usage:
//   node poisson.mjs tail --k 3 --mu 0.15
//   node poisson.mjs table --lambda-per-hour 2 --window 90 --n 3,5,10,20,30,50,100 [--possible-p 0.05 --confirmed-p 0.001]
export function tail(k, mu) {
  if (!(mu >= 0) || !Number.isFinite(mu)) throw new RangeError('mu must be a finite number >= 0');
  if (!Number.isInteger(k) || k < 0) throw new RangeError('k must be an integer >= 0');
  if (k === 0) return 1;
  if (mu === 0) return 0;
  // first term e^-mu mu^k / k!, in log space so large k does not overflow
  let lnTerm = -mu + k * Math.log(mu);
  for (let i = 2; i <= k; i++) lnTerm -= Math.log(i);
  let term = Math.exp(lnTerm);
  let sum = 0, i = k;
  for (;;) {
    sum += term; i += 1; term *= mu / i;
    if (i > mu && term < sum * 1e-17) break;
    if (i > k + 100000) break; // safety
  }
  return Math.min(1, sum);
}

/** Smallest k (at least floor) with tail(k, mu) < maxP and k <= n, or null when no k up to n qualifies. */
export function minK(n, mu, maxP, floor) {
  for (let k = floor; k <= n; k++) if (tail(k, mu) < maxP) return k;
  return null;
}

export function minKTable({ lambdaPerSec, windowSec = 90, ns, possibleP = 0.05, confirmedP = 0.001, possibleFloor = 2, confirmedFloor = 3 }) {
  return ns.map((n) => {
    const mu = lambdaPerSec * n * windowSec;
    return { n, mu, possible: minK(n, mu, possibleP, possibleFloor), confirmed: minK(n, mu, confirmedP, confirmedFloor) };
  });
}

function main() {
  const [cmd, ...a] = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (cmd === 'tail') {
    const k = Number(get('--k')), mu = Number(get('--mu'));
    console.log(tail(k, mu));
  } else if (cmd === 'table') {
    const lph = Number(get('--lambda-per-hour', 2));
    const rows = minKTable({ lambdaPerSec: lph / 3600, windowSec: Number(get('--window', 90)), ns: get('--n', '3,5,10,20,30,50,100').split(',').map(Number), possibleP: Number(get('--possible-p', 0.05)), confirmedP: Number(get('--confirmed-p', 0.001)) });
    console.log('| n armed | mu | min k Possible | min k Confirmed |\n|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.n} | ${r.mu.toFixed(3)} | ${r.possible ?? 'none'} | ${r.confirmed ?? 'none'} |`);
  } else { console.error('usage: poisson.mjs tail --k K --mu MU | table --lambda-per-hour X --window S --n 3,5,10'); process.exit(2); }
}
if (import.meta.url === `file://${process.argv[1]}`) main();
