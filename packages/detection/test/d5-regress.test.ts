// Regression: shrunk counterexample of D5_settle_equivalence (settle versus never settling).
import { describe, expect, it } from 'vitest';
import { evaluate, initialState, type Params } from '../src/index.ts';
import { DAY_MS } from '../src/time.ts';
import { HOUR, MIN, T0, ev, input, P } from './helpers/build.ts';
import { buildScenario } from './helpers/scenario.ts';

const NEVER: Params = { ...P, horizonMs: 1e13 };
function run(events: ReturnType<typeof buildScenario>, params: Params, chunks: number, finalNow: number) {
  const sorted = [...events].sort((a, b) => a.eventTimeMs - b.eventTimeMs);
  let state = initialState();
  const per = Math.ceil(sorted.length / chunks);
  for (let c = 0; c < chunks; c++) {
    const batch = sorted.slice(c * per, (c + 1) * per);
    if (batch.length === 0) continue;
    state = evaluate(state, input(batch, batch[batch.length - 1].eventTimeMs + MIN), params).state;
  }
  return evaluate(state, input([], finalNow), params);
}
describe('D5 regression', () => {
  it('D5_settle_equivalence: a restored outage is kept until start + 12 h, even when it ended before the cut', () => {
    const scenario = { installs: 3, humans: [], outages: [{ startMs: 1454400000, dropPerMille: 500, jitterMs: [0,0,0,0,0,0,0,0], lengthMs: 120000, replugSpreadMs: 0 }], noisy: 0 } as any;
    const base = buildScenario(scenario);
    const events = [...base];
    for (const id of new Set(base.map((e) => e.installId))) for (let j = 0; j < 12; j++) events.push(ev(id, 1000 + j, 'BATTERY_FULL', T0 + (j + 1) * 2 * DAY_MS + 7 * HOUR));
    const last = Math.max(...events.map((e) => e.eventTimeMs));
    const now = last + 46800000;
    const s = run(events, P, 2, now);
    const f = run(events, NEVER, 2, now);
    const kept = new Set(s.outputs.decisions.map((d) => d.outageId));
    const inside = f.outputs.decisions.filter((d) => d.startMs + P.unknownEndMs >= now - P.horizonMs + P.windowMs);
    for (const d of inside) expect(kept.has(d.outageId)).toBe(true);
    expect(s.outputs.decisions).toEqual(f.outputs.decisions.filter((d) => kept.has(d.outageId)));
    expect(s.outputs.areaStatus).toEqual(f.outputs.areaStatus);
  });
});
