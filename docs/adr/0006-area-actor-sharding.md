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
