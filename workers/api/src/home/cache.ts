// The viewer's answer is cached for 10 seconds per pair in the Worker isolate (home-watch task 7, ADR 0044). The key includes
// the viewer install, so one install can never be served another's entry. Memory only, bounded. Lenient after an isolate restart.
import type { HomeResponse } from '@outage/shared';

export const HOME_CACHE_MS = 10_000;
const MAX_ENTRIES = 1000;

export class HomeViewCache {
  private readonly entries = new Map<string, { expiresMs: number; value: HomeResponse }>();

  private key = (pairId: string, viewerInstall: string) => `${pairId}|${viewerInstall}`;

  get(pairId: string, viewerInstall: string, nowMs: number): HomeResponse | undefined {
    const k = this.key(pairId, viewerInstall);
    const hit = this.entries.get(k);
    if (!hit) return undefined;
    if (nowMs >= hit.expiresMs) {
      this.entries.delete(k);
      return undefined;
    }
    return hit.value;
  }

  put(pairId: string, viewerInstall: string, value: HomeResponse, nowMs: number): void {
    if (this.entries.size >= MAX_ENTRIES) this.entries.clear();
    this.entries.set(this.key(pairId, viewerInstall), { expiresMs: nowMs + HOME_CACHE_MS, value });
  }

  /** A removed pair must not be served from here. */
  drop(pairId: string): void {
    for (const k of this.entries.keys()) if (k.startsWith(`${pairId}|`)) this.entries.delete(k);
  }
}
