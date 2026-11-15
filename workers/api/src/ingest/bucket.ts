// Token bucket with a detection-first policy (R6, property I4). Pure: time is an input.
export interface Bucket {
  tokens: number; // fractional, 0..capacity
  atMs: number;
}
export type Kind = 'detection' | 'state';

export function newBucket(capacity: number, nowMs: number): Bucket {
  return { tokens: capacity, atMs: nowMs };
}

export function refill(b: Bucket, nowMs: number, capacity: number, refillMs: number): Bucket {
  const elapsed = Math.max(0, nowMs - b.atMs); // a clock that goes backwards adds nothing
  return { tokens: Math.min(capacity, b.tokens + elapsed / refillMs), atMs: Math.max(b.atMs, nowMs) };
}

export interface Admission {
  bucket: Bucket;
  admitted: boolean[]; // aligned with `kinds`
  retryAfterMs: number; // 0 when nothing was dropped
}

/**
 * Admit events of one batch. One token each. Detection events take tokens first, in order; state events only get
 * what is left, so a state event is never admitted while a detection event of the same call is dropped.
 */
export function admit(b: Bucket, nowMs: number, kinds: readonly Kind[], capacity: number, refillMs: number): Admission {
  const filled = refill(b, nowMs, capacity, refillMs);
  let avail = Math.floor(filled.tokens);
  const admitted = new Array<boolean>(kinds.length).fill(false);
  let dropped = false;
  for (const wanted of ['detection', 'state'] as const) {
    kinds.forEach((kind, i) => {
      if (kind !== wanted) return;
      if (avail > 0) {
        admitted[i] = true;
        avail -= 1;
      } else dropped = true;
    });
  }
  const used = admitted.filter(Boolean).length;
  const tokens = Math.max(0, filled.tokens - used);
  return {
    bucket: { tokens, atMs: filled.atMs },
    admitted,
    retryAfterMs: dropped ? Math.ceil((1 - tokens) * refillMs) : 0,
  };
}
