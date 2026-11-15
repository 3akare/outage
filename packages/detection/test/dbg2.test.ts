import { it } from 'vitest';
import { evaluate, initialState, type EngineEvent } from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P } from './helpers/build.ts';
const NEVER = { ...P, horizonMs: 1e13 };
const log = (x: unknown) => (globalThis as any).console.log(JSON.stringify(x));
function go(first: boolean, ka: boolean, second: number) {
  const phones = ids(10);
  const events: EngineEvent[] = [...armAll(phones, T0)];
  if (ka) for (const id of phones) for (let j = 0; j < 12; j++) events.push(ev(id, 1000 + j, 'BATTERY_FULL', T0 + (j + 1) * 2 * DAY_MS + 7 * HOUR));
  const drop = (at: number, seq: number) => phones.slice(0, 7).map((id, i) => ev(id, seq, 'UNPLUG', at + i * 100));
  if (first) events.push(...drop(T0 + 2 * DAY_MS, 400));
  events.push(...drop(T0 + second * DAY_MS, 500));
  events.sort((a, b) => a.eventTimeMs - b.eventTimeMs);
  const out: number[] = [];
  for (const params of [P, NEVER]) {
    const early = events.filter((e) => e.eventTimeMs < T0 + (second - 1) * DAY_MS);
    const late = events.filter((e) => e.eventTimeMs >= T0 + (second - 1) * DAY_MS);
    const a = evaluate(initialState(), input(early, T0 + (second - 1) * DAY_MS), params);
    const b = evaluate(a.state, input(late, T0 + (second + 4) * DAY_MS), params);
    out.push(b.outputs.decisions.find((d) => d.startMs >= T0 + second * DAY_MS)?.explanation.lambdaPerSec as number);
  }
  return out;
}
it('dbg', () => {
  for (const first of [false, true]) for (const ka of [false, true]) for (const second of [12, 21])
    log({ first, ka, second, r: go(first, ka, second) });
});
