// Synthetic fixture for Judge mode until the field test records a real outage (design 7: source SYNTHETIC, 0 real
// devices). Deterministic: the same options give the same file. Every event and label carries `simulated: true`.
import type { Fixture } from './replay.ts';

export const LAGOS_PARENT = '87589c986ffffff'; // res-7 parent of a point in Yaba, Lagos (h3-js latLngToCell(6.5068, 3.3755, 7))

export interface SyntheticOptions {
  phones: number; // armed phones
  drops: number; // phones that lose power in the outage
  jitterMs: readonly number[]; // per dropping phone, at most 2 s (testing.md)
  replugSpreadMs: number;
  /** The phone that unplugs alone first, answers "Yes, wake me", and so shows "Your spot only" (R6.5). */
  spotPhone: boolean;
}

export const DEFAULT_SYNTHETIC: SyntheticOptions = {
  phones: 10,
  drops: 7,
  jitterMs: [0, 180, 420, 650, 900, 1300, 1700],
  replugSpreadMs: 18_000,
  spotPhone: true,
};

const MIN = 60_000;
const ARM_AT = 0;
const SPOT_AT = 10 * MIN;
const SPOT_BACK = 14 * MIN;
const CUT_AT = 30 * MIN;
const BACK_AT = 75 * MIN;

export function syntheticFixture(o: SyntheticOptions = DEFAULT_SYNTHETIC): Fixture {
  const phones = Array.from({ length: o.phones }, (_, i) => ({
    alias: `P${i + 1}`,
    role: 'SIMULATED_NEIGHBOR' as const,
  }));
  const seq = new Map<string, number>();
  const next = (a: string): number => {
    const s = (seq.get(a) ?? 0) + 1;
    seq.set(a, s);
    return s;
  };
  const events: Fixture['events'] = [];
  const labels: Fixture['labels'] = [];
  phones.forEach((p, i) => {
    events.push({ alias: p.alias, seq: next(p.alias), type: 'ARMED', tMs: ARM_AT + i * 1000, simulated: true });
  });
  // The spot phone is the last one, which does not drop in the outage, so its frames stay separate.
  const spot = phones[phones.length - 1];
  if (o.spotPhone && spot) {
    const s = next(spot.alias);
    events.push({ alias: spot.alias, seq: s, type: 'UNPLUG', tMs: SPOT_AT, simulated: true });
    labels.push({ alias: spot.alias, unplugSeq: s, answer: 'YES', simulated: true });
    events.push({
      alias: spot.alias,
      seq: next(spot.alias),
      type: 'REPLUG',
      tMs: SPOT_BACK,
      schedulingDelayMs: 2000,
      simulated: true,
    });
  }
  const dropping = phones.slice(0, Math.min(o.drops, o.phones - (o.spotPhone ? 1 : 0)));
  dropping.forEach((p, i) => {
    const jitter = Math.min(2000, Math.max(0, o.jitterMs[i % Math.max(1, o.jitterMs.length)] ?? 0));
    events.push({ alias: p.alias, seq: next(p.alias), type: 'UNPLUG', tMs: CUT_AT + jitter, simulated: true });
  });
  dropping.forEach((p, i) => {
    const spread = dropping.length > 1 ? Math.round((o.replugSpreadMs * i) / (dropping.length - 1)) : 0;
    events.push({
      alias: p.alias,
      seq: next(p.alias),
      type: 'REPLUG',
      tMs: BACK_AT + spread,
      schedulingDelayMs: 2000,
      simulated: true,
    });
  });
  events.sort((a, b) => a.tMs - b.tMs || (a.alias < b.alias ? -1 : 1));
  return { source: 'SYNTHETIC', cell: LAGOS_PARENT, phones, events, labels };
}
