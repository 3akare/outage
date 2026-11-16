// Every engine threshold lives here (R1.4). Values and reasoning: docs/adr/0005-detection-parameters.md.
// Changing any value needs the human (steering detection.md). `node .kiro/scripts/detection-audit.mjs` checks them.

export type Params = {
  windowMs: number;
  possible: { minK: number; maxP: number };
  confirmed: { minK: number; maxP: number };
  minArmedForConfirm: number;
  weight: { cut: number; u0: number; lookbackMs: number };
  baseline: { priorLambdaPerSec: number; priorExposureSec: number; dailyDecay: number };
  restore: { baseMs: number; priorP95Ms: number; minSamples: number; minQuorum: number };
  unknownEndMs: number;
  pushMaxAgeMs: number;
  staleArmedMs: number;
  horizonMs: number;
  /** Local-time offset from UTC in ms, set per city (Lagos = +3_600_000). Never read from the environment (R4.6). */
  localOffsetMs: number;
};

export const DEFAULT_PARAMS: Params = {
  windowMs: 90_000,
  possible: { minK: 2, maxP: 0.05 },
  confirmed: { minK: 3, maxP: 0.001 },
  minArmedForConfirm: 3,
  weight: { cut: 0.5, u0: 8, lookbackMs: 86_400_000 },
  baseline: { priorLambdaPerSec: 1 / 1800, priorExposureSec: 36_000, dailyDecay: 0.9 },
  restore: { baseMs: 90_000, priorP95Ms: 60_000, minSamples: 20, minQuorum: 2 },
  unknownEndMs: 43_200_000,
  pushMaxAgeMs: 600_000,
  staleArmedMs: 604_800_000,
  horizonMs: 648_000_000,
  localOffsetMs: 3_600_000,
};

export class ParamsError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid params: ${problems.join('; ')}`);
    this.name = 'ParamsError';
    this.problems = problems;
  }
}

const isPosFinite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const isProb = (x: unknown): x is number => typeof x === 'number' && x > 0 && x <= 1;
const isPosInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1;

/** Returns the list of problems; empty when the params are usable. */
export function validateParams(p: Params): string[] {
  const out: string[] = [];
  const need = (ok: boolean, msg: string) => {
    if (!ok) out.push(msg);
  };
  need(isPosFinite(p.windowMs), 'windowMs must be > 0');
  need(isPosInt(p.possible?.minK), 'possible.minK must be an integer >= 1');
  need(isPosInt(p.confirmed?.minK), 'confirmed.minK must be an integer >= 1');
  need(isProb(p.possible?.maxP), 'possible.maxP must be in (0, 1]');
  need(isProb(p.confirmed?.maxP), 'confirmed.maxP must be in (0, 1]');
  need(p.confirmed?.minK >= p.possible?.minK, 'confirmed.minK must be >= possible.minK');
  need(p.confirmed?.maxP <= p.possible?.maxP, 'confirmed.maxP must be <= possible.maxP');
  need(isPosInt(p.minArmedForConfirm), 'minArmedForConfirm must be an integer >= 1');
  need(isProb(p.weight?.cut), 'weight.cut must be in (0, 1]');
  need(isPosFinite(p.weight?.u0), 'weight.u0 must be > 0');
  need(isPosFinite(p.weight?.lookbackMs) && p.weight.lookbackMs > p.windowMs, 'weight.lookbackMs must be > windowMs');
  need(isPosFinite(p.baseline?.priorLambdaPerSec), 'baseline.priorLambdaPerSec must be > 0');
  need(isPosFinite(p.baseline?.priorExposureSec), 'baseline.priorExposureSec must be > 0');
  need(
    typeof p.baseline?.dailyDecay === 'number' && p.baseline.dailyDecay > 0 && p.baseline.dailyDecay <= 1,
    'baseline.dailyDecay must be in (0, 1]',
  );
  need(isPosFinite(p.restore?.baseMs), 'restore.baseMs must be > 0');
  need(
    typeof p.restore?.priorP95Ms === 'number' && Number.isFinite(p.restore.priorP95Ms) && p.restore.priorP95Ms >= 0,
    'restore.priorP95Ms must be >= 0',
  );
  need(isPosInt(p.restore?.minSamples), 'restore.minSamples must be an integer >= 1');
  need(isPosInt(p.restore?.minQuorum), 'restore.minQuorum must be an integer >= 1');
  need(isPosFinite(p.unknownEndMs), 'unknownEndMs must be > 0');
  need(isPosFinite(p.pushMaxAgeMs), 'pushMaxAgeMs must be > 0');
  need(isPosFinite(p.staleArmedMs), 'staleArmedMs must be > 0');
  need(
    isPosFinite(p.horizonMs) && p.horizonMs >= p.unknownEndMs,
    'horizonMs must be >= unknownEndMs so no open outage is settled',
  );
  need(typeof p.localOffsetMs === 'number' && Number.isInteger(p.localOffsetMs), 'localOffsetMs must be an integer');
  return out;
}

export function assertParams(p: Params): void {
  const problems = validateParams(p);
  if (problems.length > 0) throw new ParamsError(problems);
}
