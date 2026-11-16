// Property tests read their run count from FC_NUM_RUNS (testing.md). `process` is not in this package's type set.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
export const NUM_RUNS = Number(env?.FC_NUM_RUNS) > 0 ? Number(env?.FC_NUM_RUNS) : 100;
