/// <reference types="vite/client" />
// Golden fixture replay (detection-engine task 18, R17). Every fixtures/*.json must reproduce its recorded decisions.
import { describe, expect, it } from 'vitest';
import { evaluate, initialState } from '../src/index.ts';
import type { EngineInput } from '../src/types.ts';
import { P } from './helpers/build.ts';

// Vite resolves the glob at transform time, so the test needs no node types and no I/O API.
type Golden = { input: EngineInput; expected: unknown };
const fixtures = import.meta.glob<Golden>('../fixtures/*.json', { eager: true, import: 'default' });
const files = Object.keys(fixtures);

describe('golden fixtures', () => {
  it('golden_dir_is_readable', () => {
    expect(Array.isArray(files)).toBe(true);
  });
  for (const f of files) {
    it(`golden_${f}`, () => {
      const g = fixtures[f] as Golden;
      expect(evaluate(initialState(), g.input, P).outputs.decisions).toEqual(g.expected);
    });
  }
});
