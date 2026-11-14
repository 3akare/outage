import { expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/index.ts';

it('scaffold: the shared package loads', () => {
  expect(SCHEMA_VERSION).toBe(1);
});
