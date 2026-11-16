// Per-source budget for POST /v1/register (R2.5). Fixed window, memory only, bounded. The key is an opaque hash
// chosen by the caller; this class never sees an address and nothing here is stored or logged.
export class RegisterLimiter {
  private readonly windows = new Map<string, { startMs: number; count: number }>();
  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs = 3_600_000,
    private readonly maxKeys = 10_000,
  ) {}

  allow(key: string, nowMs: number): { ok: boolean; retryAfterMs: number } {
    let w = this.windows.get(key);
    if (!w || nowMs - w.startMs >= this.windowMs || nowMs < w.startMs) {
      if (!w && this.windows.size >= this.maxKeys) this.windows.clear(); // bounded memory; lenient after a reset
      w = { startMs: nowMs, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= this.maxPerWindow) return { ok: false, retryAfterMs: w.startMs + this.windowMs - nowMs };
    w.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
}
