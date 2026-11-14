import { expect, test } from 'vitest';
import { PROBE_ANALYZE_VERSION } from '../src/index';

test('scaffold: the analysis package loads', () => {
  expect(PROBE_ANALYZE_VERSION).toBe(1);
});
