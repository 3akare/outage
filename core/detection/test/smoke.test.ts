import { expect, it } from 'vitest';
import { evaluate, initialState } from '../src/index.ts';
import { armAll, ids, input, P, replugAll, T0, unplugAll } from './helpers/build.ts';

it('smoke_30_phones_confirm_and_restore', () => {
  const phones = ids(30);
  const events = [...armAll(phones, T0), ...unplugAll(phones, T0, 100), ...replugAll(phones, T0 + 3600_000)];
  const r = evaluate(initialState(), input(events, T0 + 2 * 3600_000), P);
  expect(r.outputs.decisions.map((d) => d.kind)).toEqual(['OPENED', 'RAISED', 'RESTORED']);
  expect(r.outputs.decisions[1].level).toBe('CONFIRMED');
});
