import { it } from 'vitest';
import { evaluate, initialState, type EngineEvent } from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, MIN, SEC, T0, armAll, ev, ids, input, P } from './helpers/build.ts';
const NEVER = { ...P, horizonMs: 1e13 };
const log = (x: unknown) => (globalThis as any).console.log(JSON.stringify(x));
function run(withHumans: boolean, params: typeof P, keep: boolean, chunks: number) {
  const phones = ids(10);
  const humans: EngineEvent[] = [];
  if (withHumans) for (let d = 0; d < 20; d++) for (let j = 0; j < 4; j++) {
    const id = phones[(d + j) % 10];
    humans.push(ev(id, 10 + d * 8 + 2 * j, 'UNPLUG', T0 + d * DAY_MS + 3 * HOUR + j * 7 * MIN));
    humans.push(ev(id, 11 + d * 8 + 2 * j, 'REPLUG', T0 + d * DAY_MS + 3 * HOUR + j * 7 * MIN + 30 * SEC));
  }
  const drop = (at: number, seq: number) => phones.slice(0, 7).map((id, i) => ev(id, seq, 'UNPLUG', at + i * 100));
  const ka: EngineEvent[] = [];
  if (keep) for (const id of phones) for (let j = 0; j < 12; j++) ka.push(ev(id, 1000 + j, 'BATTERY_FULL', T0 + (j + 1) * 2 * DAY_MS + 7 * HOUR));
  const events = [...armAll(phones, T0), ...humans, ...ka, ...drop(T0 + 2 * DAY_MS, 400), ...drop(T0 + 21 * DAY_MS, 500)].sort((a, b) => a.eventTimeMs - b.eventTimeMs);
  let st = initialState();
  const per = Math.ceil(events.length / chunks);
  for (let c = 0; c < chunks; c++) { const b = events.slice(c * per, (c + 1) * per); if (b.length) st = evaluate(st, input(b, b[b.length - 1].eventTimeMs + MIN), params).state; }
  const r = evaluate(st, input([], T0 + 25 * DAY_MS), params);
  return r.outputs.decisions.filter((d) => d.startMs >= T0 + 20 * DAY_MS).map((d) => d.explanation.lambdaPerSec);
}
it('dbg', () => {
  for (const [h, k] of [[false, true], [true, false], [true, true]] as const)
    for (const ch of [1, 10]) log({ h, k, ch, settled: run(h, P, k, ch)[0], full: run(h, NEVER, k, ch)[0] });
});
