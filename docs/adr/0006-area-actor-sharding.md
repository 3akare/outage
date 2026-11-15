# ADR 0006: Area actors per res-7 parent, scope rules and linking

Status: ACCEPTED (2026-11-14) by delegation. Includes one threshold (manual-report hint) that the human should confirm.

## Context
The brief says one Durable Object per area cell, evaluation at H3 res 8, sparse cells (fewer than 3 armed sensors) evaluated in the parent, and cells that drop together in 3+ outages in 7 days linked and pooled. Ingest, as first designed, routes each event to a res-8 cell actor. A sparse cell then needs a second call to a parent actor on every event, which doubles Durable Object requests against a 100,000 daily cap.

The test "fewer than 3 armed sensors" taken literally also fails during an outage: all phones drop, no phone is armed, and the cell would turn sparse in the middle of the outage.

## Decisions
1. **Shard by res-7 parent.** One area actor per active parent holds engines for its seven res-8 cells, any linked groups, and the parent scope. Evaluation still happens at res 8 when a cell has enough sensors.
2. **"Armed" for scope selection = armed at some time in the last 24 hours** with weight >= 0.5. An open outage stays in the scope that opened it.
3. **Link rule** as in the brief: 3 co-outages in 7 days. A co-outage is one outage with at least one eligible drop in each cell of the pair. Links are limited to cells in one parent.
4. **Neighbor hints** travel as small notices, sent only on public level changes.
5. **Manual-report hint** applies only with 2 or more distinct reporters in 10 minutes (starting value; the report feature is not specified yet).
6. **State events** do not trigger an engine sweep on their own. They are merged at the next detection event or flush alarm.

## Alternatives
1. **DO per res-8 cell plus a parent DO.** Matches the brief's wording. Costs a second call per event for sparse cells.
2. **One DO per city.** One place for everything, but a single serialized bottleneck and no scaling past one city.
3. **D1 or KV for cross-cell data.** Adds a service and its own limits; needs human approval.
4. **Use "armed now" for scope selection.** Matches the brief text; fails in an outage.
5. **Link across parents.** Feeders do cross parent borders. Needs cross-actor co-outage exchange; deferred.

## Consequences
- Most sparse-cell fallback costs no extra Durable Object request.
- A parent actor serializes seven cells. With many phones per parent a hot parent could bottleneck; revisit if the field test shows it (tracked by the evaluation-time counter).
- Cross-parent feeders are not linked in this version. The notice-based neighbor hint still raises their level by one step.
- The engine runs up to three times per detection event (cell, group, parent). The `detection-engine` benchmark (task 17) decides whether that fits the free CPU limit.
- H3 startup cost on the Worker is unmeasured. Task 2 measures it and this ADR gets an addendum; pure-TypeScript parent and validity code keeps the hot path independent of it.

## Addendum 2026-11-15: measured startup and CPU (area-cells task 12)

### Method
- Script: `workers/api/bench/area-bench.mjs`, run with `npm run bench -w workers/api`. Not part of `npm test`: timings depend on the machine.
- It runs the real `AreaCore`, `AreaModel`, `SqlAreaStore`, `SqlModelStore` and the detection engine on real SQLite (`node:sqlite`) behind a small shim of the Durable Object `SqlStorage` API. Synchronous commit is off, because a Durable Object commits off the request's CPU path ([SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)). Timings are wall time of synchronous code, so close to CPU time.
- Input: one parent with its 7 res-8 cells, N phones per cell all armed, then three days of one cut and restore in the first cell (every phone unplugs, then replugs 20 minutes later). The model is flushed to a database file; startup opens that file fresh.
- 10 warm-up runs, then 100 timed runs. Median and p95 reported.
- Machine: sandbox VM, Intel Xeon Platinum 8488C, 8 cores, Node v22.23.4. **Local, not workerd, not production.** workerd's clock does not advance during synchronous code, so per-call CPU cannot be read there; the real Durable Object CPU can only be read from the dashboard after deploy.
- Budget: Workers Free allows 10 ms CPU per invocation ([limits, CPU time](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)). Durable Objects follow the same plan limit (see the ADR 0005 addendum for the reading).

### Results (ms; p95 in brackets)
| Phones per cell (total) | Model rows, JSON | Startup | Ingest, 20 events, one phone | Ingest, one UNPLUG into the cell | Alarm |
|---|---|---|---|---|---|
| 3 (21) | 64, 27 KB | 0.32 (0.52) | 5.21 (11.42) | 2.41 (5.78) | 2.91 (3.13) |
| 10 (70) | 114, 58 KB | 0.57 (1.21) | 4.24 (8.16) | 2.49 (5.27) | 3.00 (3.21) |
| 30 (210) | 150, 142 KB | 1.19 (2.01) | 6.08 (10.89) | 4.52 (7.64) | 3.43 (3.85) |
| 100 (700) | 156, 433 KB | 3.57 (4.60) | 19.82 (24.39) | 17.69 (21.15) | 5.26 (5.90) |

- Startup is the cold load of every `area_model` row and the rebuild of state. It grows with stored state size, about 8 ms per MB of JSON. It does not include the first `neighborsOf` call, which loads `h3-js` once per isolate: 42 to 118 ms across runs on this machine (0.9 ms warm). That call runs inside `blockConcurrencyWhile` in the constructor, so the 42 ms or more is a one-time cost of a cold actor. Whether the platform counts module load as request CPU is not confirmed.
- Where the time goes (CPU profile, 100 phones per cell): about two thirds in the detection engine's `processDrop`, `eligibleSegments`, `sweep` and `computeBucket` (`packages/detection/src/sweep.ts`), the rest in garbage collection, `toRows` and `fromRows`. The area code around the engine is small.

### Reading
- Within 10 ms for a small actor: 70 phones in the parent (10 per cell), startup plus the heaviest call is 9.4 ms (p95, summed, which is conservative). Alarms stay under 6 ms at every size.
- Over 10 ms from about 30 phones per cell (210 per parent) on a cold actor (12.9 ms), and over 10 ms on a warm actor with 100 per cell (ingest 17 to 20 ms median). The ingest cost is the detection engine re-evaluating a populated cell on each drop, as ADR 0005's benchmark predicted for 500 or more live events, times up to three scopes (ADR 0006 consequences).
- Not changed: no threshold, scope rule or schema is changed by this addendum. No field data shows a parent holding 200 phones yet.

### Consequences and options (decide when the field test shows real counts)
1. On the free plan a Durable Object call that exceeds 10 ms CPU is cut off with an error. A hot parent would shed events, and the phone retries (R5 idempotency makes that safe).
2. Cheapest mitigations, in order: (a) cap live events per engine and evaluate only on a drop (already deferred for state-only events); (b) split a hot parent into one actor per res-8 cell when its phone count passes a limit; (c) Workers Paid, which raises `limits.cpu_ms`. Each needs its own ADR.
3. Re-run this benchmark after any change to `packages/detection/src/sweep.ts` or to the model row layout, and compare with the Cloudflare dashboard's CPU time once the Worker is deployed.
