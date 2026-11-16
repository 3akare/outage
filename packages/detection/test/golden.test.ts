// Golden fixture replay (detection-engine task 18, R17). Every fixtures/*.json must reproduce its recorded decisions.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, initialState } from '../src/index.ts';
import type { EngineInput } from '../src/types.ts';
import { P } from './helpers/build.ts';

const dir = join(import.meta.dirname, '..', 'fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('golden fixtures', () => {
  it('golden_dir_is_readable', () => {
    expect(Array.isArray(files)).toBe(true);
  });
  for (const f of files) {
    it(`golden_${f}`, () => {
      const g = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { input: EngineInput; expected: unknown };
      expect(evaluate(initialState(), g.input, P).outputs.decisions).toEqual(g.expected);
    });
  }
});
