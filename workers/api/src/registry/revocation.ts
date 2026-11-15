// Pure helpers for the registry: revocation snapshot cache kept in a Worker isolate (ADR 0003 addendum).
export class RevocationCache {
  private hashes = new Set<string>();
  private fetchedAtMs = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly ttlMs: number,
    private readonly fetchSnapshot: () => Promise<string[]>,
  ) {}

  /** A failing fetch propagates: an unknown revocation status is not treated as "not revoked". */
  async has(hash: string, nowMs: number): Promise<boolean> {
    if (nowMs - this.fetchedAtMs >= this.ttlMs || nowMs < this.fetchedAtMs) {
      this.hashes = new Set(await this.fetchSnapshot());
      this.fetchedAtMs = nowMs;
    }
    return this.hashes.has(hash);
  }

  /** The isolate that handled a delete knows at once; others catch up within the TTL. */
  add(hash: string): void {
    this.hashes.add(hash);
  }
}

/** Add `delta` into the day's counters. Pure so the registry's merge is testable. */
export function mergeCounters(into: Record<string, number>, delta: Record<string, number>): Record<string, number> {
  const out = { ...into };
  for (const [k, v] of Object.entries(delta)) out[k] = (out[k] ?? 0) + v;
  return out;
}
