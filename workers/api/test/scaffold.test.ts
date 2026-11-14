import { expect, it } from 'vitest';
import { CONFIG } from '../src/config.ts';

it('scaffold: tunables match event-ingest design section 4', () => {
  expect(CONFIG.MAX_ELAPSED_MS).toBe(7 * 86_400_000);
  expect(CONFIG.MAX_BATCH_EVENTS).toBe(100);
});
