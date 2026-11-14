// Operational tunables for ingest (event-ingest design section 4). Not detection thresholds: those live in
// packages/detection/src/params.ts and need the human (ADR 0005). Change these freely and log the change.
export const CONFIG = {
  MAX_BATCH_EVENTS: 100,
  MAX_BODY_BYTES: 32_768,
  MAX_ELAPSED_MS: 604_800_000, // 7 days (brief)
  BUCKET_CAPACITY: 30,
  BUCKET_REFILL_MS: 20_000,
  STATE_FLUSH_MS: 60_000,
  STATE_MAX_WAIT_MS: 900_000, // client side, mirrored in the app
  IDEMPOTENCY_WINDOW: 256,
  RETENTION_MS: 30 * 86_400_000,
  REGISTER_PER_SOURCE_PER_HOUR: 10,
  WRITE_BUDGET_SHED_FRACTION: 0.8,
  DAILY_ROW_LIMIT: 100_000, // Durable Objects free plan rows written per day
} as const;
