// Benchmark for detection-engine task 17: evaluate() time for 100, 500 and 5,000 live events.
// Usage: npm run bench -w core/detection. Not part of `npm test`: timings depend on the machine.
// Budget (design.md §11.3): 500 live events in under 5 ms. Free plan CPU limit is 10 ms per invocation:
// https://developers.cloudflare.com/workers/platform/limits/#cpu-time
// https://developers.cloudflare.com/durable-objects/platform/limits/#can-i-increase-durable-objects-cpu-limit
import { cpus } from 'node:os';
import { DEFAULT_PARAMS, evaluate, initialState } from '../src/index.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000 + 7 * DAY;
const SPAN = 6 * DAY; // inside the 7.5-day horizon, so every event stays live
const SIZES = [100, 500, 5000];
const WARMUP = 20;
const RUNS = 200;
const BUDGET_MS = 5;

/** Deterministic LCG so every run measures the same input. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * `total` events from `phones` installs over SPAN: one ARMED each, isolated UNPLUG/REPLUG pairs at random
 * times, and one shared outage (every phone unplugs within 30 s, replugs an hour later) near the end.
 * The last event is held back as the new arrival.
 */
function scenario(total, phones) {
  const rand = rng(total * 31 + phones);
  const start = NOW - SPAN;
  const outageAt = NOW - 3 * HOUR;
  const perPhone = Math.floor(total / phones);
  const events = [];
  for (let p = 0; p < phones; p++) {
    const installId = `b${p}`;
    const count = p < total % phones ? perPhone + 1 : perPhone;
    let seq = 1;
    events.push({ installId, seq: seq++, type: 'ARMED', eventTimeMs: start + p * 1000, confidence: 'HIGH' });
    const pairs = Math.floor((count - 1) / 2) - 1; // the last pair is the shared outage
    const slot = (outageAt - start - HOUR) / Math.max(pairs, 1);
    for (let i = 0; i < pairs; i++) {
      const t = Math.floor(start + 60_000 + i * slot + rand() * slot * 0.5);
      events.push({ installId, seq: seq++, type: 'UNPLUG', eventTimeMs: t, confidence: 'HIGH' });
      events.push({ installId, seq: seq++, type: 'REPLUG', eventTimeMs: t + 120_000, confidence: 'HIGH' });
    }
    const u = outageAt + Math.floor(rand() * 30_000);
    events.push({ installId, seq: seq++, type: 'UNPLUG', eventTimeMs: u, confidence: 'HIGH' });
    if (events.length < total) {
      events.push({ installId, seq: seq++, type: 'REPLUG', eventTimeMs: u + HOUR, confidence: 'HIGH' });
    }
    while (seq - 1 < count) {
      events.push({
        installId,
        seq: seq++,
        type: 'BATTERY_FULL',
        eventTimeMs: u + HOUR + seq * 1000,
        confidence: 'HIGH',
      });
    }
  }
  const sorted = events.slice(0, total).sort((a, b) => a.eventTimeMs - b.eventTimeMs);
  const arrival = sorted.pop();
  return { held: sorted, arrival };
}

const input = (events, nowMs) => ({
  events,
  labels: [],
  context: { neighbors: [], manualReports: 0 },
  nowMs,
});

const pct = (xs, q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];

console.log(`machine: ${cpus()[0]?.model ?? 'unknown'}, ${cpus().length} cores, node ${process.version}`);
console.log(`runs: ${RUNS} after ${WARMUP} warm-up; time is one evaluate() with one new event on a stored state`);
console.log('| live events | phones | median ms | p95 ms | max ms | decisions | rejected | within 5 ms |');
console.log('|---|---|---|---|---|---|---|---|');
let over = false;
for (const total of SIZES) {
  for (const phones of [30, Math.max(3, Math.floor(total / 10))]) {
    if (phones === 30 && total / 10 === 30) continue;
    const { held, arrival } = scenario(total, phones);
    const seeded = evaluate(initialState(), input(held, NOW), DEFAULT_PARAMS);
    const next = input([arrival], NOW + 1000);
    const times = [];
    let last = evaluate(seeded.state, next, DEFAULT_PARAMS);
    for (let i = 0; i < WARMUP + RUNS; i++) {
      const t0 = performance.now();
      last = evaluate(seeded.state, next, DEFAULT_PARAMS);
      const dt = performance.now() - t0;
      if (i >= WARMUP) times.push(dt);
    }
    times.sort((a, b) => a - b);
    const rejected = seeded.outputs.rejected.length + last.outputs.rejected.length;
    const p95 = pct(times, 0.95);
    if (total === 500 && p95 >= BUDGET_MS) over = true;
    console.log(
      `| ${total} | ${phones} | ${pct(times, 0.5).toFixed(3)} | ${p95.toFixed(3)} | ${times[times.length - 1].toFixed(3)} | ${last.outputs.decisions.length} | ${rejected} | ${p95 < BUDGET_MS ? 'yes' : 'no'} |`,
    );
  }
}
console.log(over ? 'RESULT: 500 events exceed the 5 ms budget' : 'RESULT: 500 events fit the 5 ms budget');
