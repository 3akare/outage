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
  LAST_SEEN_REFRESH_MS: 900_000, // rewrite an unchanged armed row only when its last_seen is this stale (area-cells expiry)
  MAX_DELETE_CELLS: 100, // cells a delete request may list
  REVOCATION_TTL_MS: 30 * 86_400_000, // ADR 0003 addendum: revoked ids are forgotten after 30 days
  REVOCATION_CACHE_MS: 15_000, // Worker isolate caches the revoked set this long (one registry call per refresh)
} as const;

/** The tunables as plain numbers, so pure logic and tests can override them. */
export type Tunables = { [K in keyof typeof CONFIG]: number };
