# Algorithm and properties

## Rules

1. A sensor is armed from its `ARMED` event until its next unplug or `DISARMED`. Phones with weight below 0.5 are excluded.
2. Window W = 90 s, sliding, in event time (server receive time minus the phone's monotonic elapsed time; never the phone's wall clock).
3. Baseline lambda is per hour of day, from a conservative prior, updated by an exponential moving average. A rate EMA must be weighted by exposure: keep decayed counts and decayed armed seconds, `lambda = (a0 + C) / (b0 + E)` with a prior of `a0 = b0 * prior`. In the Outage project: prior 1 per 1,800 s, `b0` = 36,000 sensor-seconds, decay 0.9 per day.
4. `mu = lambda * n * W`, `p = P(X >= k)`.
5. Levels: Possible = k >= 2 and p < 0.05; Confirmed = k >= 3 and p < 0.001 (and n >= 3). Hints raise one level at most, never to Confirmed without k >= 3 somewhere.
6. Restore: at least `max(2, ceil(d/2))` of the dropped phones replug within `W_r = 90 s + p95` of replug delays measured **before** the outage started.
7. No restore evidence within 12 hours: the end is "unknown".
8. Late events recompute history; no push for a decision older than 10 minutes.
9. Cells with fewer than 3 armed phones are evaluated in a larger area.

Weight, as used in Outage: `weight = u0 / (u0 + u)`, `u0 = 8`, `u` = the phone's isolated unplugs in the last 24 hours, ending one window before the time being decided (so a decision never depends on its own data). Below 0.5 means more than 8.

## Properties

| ID | Property |
|---|---|
| P1 | One unplug alone never gives Possible or Confirmed |
| P2 | With n >= 3, any lambda, k >= 3 drops in one window with p < 0.001 gives Confirmed |
| P3 | Reordering or delaying the same events gives the same final decisions |
| P4 | Duplicate events change nothing |
| P5 | Replugs spaced wider than `W_r` never give a grid restore |
| P6 | A restore only follows a Possible or Confirmed outage in that area |
| P7 | Adding drops inside the window never lowers the level of that window (history before the window fixed) |
| P8 | Shifting all event times, the clock and the local-time offset by a constant shifts all decisions by it and changes nothing else |
| P9 | Simulated events never change real state, history or statistics |
| P10 | A phone with weight below 0.5 is never one of the drops that confirm |
| P11 | A cell with fewer than 3 armed phones never shows Confirmed at its own level |
| P12 | No push for a decision whose event time is more than 10 minutes old |

Two definitions that need care (found while specifying): P7 needs "history before the window fixed", because an extra isolated unplug earlier in the day can make a phone noisy for later windows; P8 needs the local-time offset shifted too, because an hour-of-day baseline changes meaning when times move by a part of a day.

## Numerics

Sum the upper tail: first term `exp(-mu + k ln mu - ln k!)`, then each next term times `mu / (i + 1)`, stopping when the term is below `1e-17` of the sum and `i > mu`. Relative error of 1e-9 against a high-precision reference is enough. `1 - sum` fails for tail probabilities below about 1e-15.

## Where each decision's numbers go

Every decision stores: k, n, excluded noisy phones, lambda, mu, p, W, the thresholds used, which hint raised it, the counts of high and low confidence events, and for restores d, the quorum, the replug count, `W_r`, and how many delay samples set the p95. Counts only, never phone identifiers, so deleting one phone's data leaves the history valid.
