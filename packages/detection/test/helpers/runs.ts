// fast-check run count from FC_NUM_RUNS (default 100). `process` is not typed (no @types/node), so read it through globalThis.
// fast-check runner options: https://fast-check.dev/docs/configuration/user-definable-values/
const raw = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FC_NUM_RUNS;
const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);

export const NUM_RUNS: number = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
