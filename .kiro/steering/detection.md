---
inclusion: fileMatch
fileMatchPattern: "packages/detection/**"
---

# Detection engine

Live reference: #[[file:packages/detection/README.md]]

Pure function: `(cell state, events, clock) -> (new state, outputs)`. No I/O, no `Date.now()`. Order- and delay-independent. Every decision carries an explanation (counts, baseline, probability).

## Algorithm
1. A sensor is armed from ARMED until its next UNPLUG or DISARMED. Devices with weight < 0.5 (noisy) are excluded.
2. Window W = 90 s, sliding, in event time.
3. Baseline lambda = human unplugs per armed sensor per second, per hour of day. Conservative prior; update by exponential moving average from quiet periods and "No, I unplugged it" labels.
4. mu = lambda * n * W. p = P(X >= k | Poisson mu) = 1 − sum(i=0..k−1) e^(−mu) mu^i / i!
5. Levels: Your spot only = 1 drop + a user "yes". Possible (silent) = k >= 2 and p < 0.05. Confirmed (alert) = k >= 3 and p < 0.001. Neighbor/linked cells or manual reports raise one level, never to Confirmed without k >= 3 somewhere.
6. Restore = at least max(2, half of the dropped sensors) REPLUG within W_r, where W_r = 90 s + measured p95 restore delay. Wider spreads are generators or inverters and never count.
7. No restore evidence within 12 h: end time "unknown". Never invent it.
8. Late events recompute history but never trigger a push for a decision older than 10 min.
9. Sparse cells (< 3 armed) are evaluated in their parent cell.

## Properties (each is a fast-check test that names its ID)
- P1 One UNPLUG alone never gives Possible or Confirmed.
- P2 For any n >= 3 and lambda, k >= 3 drops in one window with p < 0.001 gives Confirmed.
- P3 Reordering or delaying the same events gives the same final decisions.
- P4 Duplicate events change nothing.
- P5 REPLUGs spaced wider than W_r never give a grid restore.
- P6 A restore only follows a Possible or Confirmed outage in that area.
- P7 Adding drops inside the window never lowers the level.
- P8 Shifting all event times by a constant shifts all decisions by that constant and nothing else.
- P9 Simulated events never change real state, history or statistics.
- P10 A device with weight < 0.5 is never one of the 3 drops that confirm.
- P11 A cell with < 3 armed sensors never shows Confirmed at its own level.
- P12 No push for a decision whose event time is more than 10 minutes old.

Generators must include: baseline-rate human unplugs, true outages with up to 2 s jitter, generator restarts spread over minutes, phones delivering hours late, duplicates, noisy devices. Keep golden fixtures of recorded real outages, replayed in CI.

## Do not change without asking the human
Thresholds (W, p cut-offs, k, weight 0.5, 12 h, 10 min), the prior, and the restore rule. Write options in an ADR first.
