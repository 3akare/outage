// Reader for the public index (R8.1, R8.4). Null means "unavailable": pages then show no status and cache for 5 s only.
import type { PublicScopeView } from './public-view.ts';

export interface IndexReader {
  views(): Promise<readonly PublicScopeView[] | null>;
}

/** Wraps any `getAll` call so a failing or slow index never breaks a page. */
export function indexReader(getAll: () => Promise<{ views: PublicScopeView[] }>): IndexReader {
  return {
    async views() {
      try {
        return (await getAll()).views;
      } catch {
        return null;
      }
    },
  };
}
