// Window statistic and level (R5, R6). Pure: k, n and lambda come from the sweep.
import type { Params } from './params.ts';
import { tail } from './tail.ts';
import type { OutageLevel } from './types.ts';

export type WindowLevel = 'NONE' | OutageLevel;

export type WindowStat = { k: number; n: number; lambdaPerSec: number; mu: number; p: number; level: WindowLevel };

/** mu = lambda x n x W (seconds), p = P(X >= k | Poisson mu). Level by R6; sparse cap by R5.6. */
export function classifyWindow(k: number, n: number, lambdaPerSec: number, params: Params): WindowStat {
  const mu = lambdaPerSec * n * (params.windowMs / 1000);
  const p = tail(k, mu);
  let level: WindowLevel = 'NONE';
  if (k >= params.confirmed.minK && p < params.confirmed.maxP && n >= params.minArmedForConfirm) level = 'CONFIRMED';
  else if (k >= params.possible.minK && p < params.possible.maxP) level = 'POSSIBLE';
  return { k, n, lambdaPerSec, mu, p, level };
}

export const levelRank = (l: WindowLevel | 'NORMAL'): number => (l === 'CONFIRMED' ? 2 : l === 'POSSIBLE' ? 1 : 0);
