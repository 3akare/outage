---
name: blackout-detection
description: Decide from many phones' charging events whether grid power is out, with a Poisson test on simultaneous drops, and when it came back. Use when designing or testing a blackout or power-cut detector from crowd sensors, choosing a baseline rate and thresholds, computing the minimum number of simultaneous unplugs for an alert, defining restore evidence that ignores generators and inverters, or writing property-based tests (fast-check) for such an engine.
license: MIT
---

# Blackout detection from charging events

Idea: a person unplugging a phone is a rare, independent event at a known baseline rate per phone. A power cut makes many phones in one area unplug within seconds of each other. If the number of simultaneous unplugs is far above what the baseline predicts, power is out. The test is a Poisson tail, and every decision carries its numbers so it can be explained.

This is the detection design of the Outage project. The numbers below come from a script in this skill (`scripts/poisson.mjs`) that has tests. The starting parameters are conservative guesses, not measurements: calibrate them with field data before trusting an alert.

## The test

For a sliding window W (90 s) ending at each drop:

- `k` = the number of distinct eligible phones that dropped in the window.
- `n` = the number of eligible phones armed at the start of the window. Count `n` at the window start so that a drop never raises its own `n`.
- `lambda` = human unplugs per armed phone per second, for that hour of the day.
- `mu = lambda * n * W`, and `p = P(X >= k)` for X Poisson with mean `mu`.

Levels (starting values):

| Level | Rule | Action |
|---|---|---|
| Possible | k at least 2 and p below 0.05 | silent, shown on a map |
| Confirmed | k at least 3, p below 0.001, and at least 3 phones armed | alert |

A phone that was noisy (many isolated unplugs in the last 24 hours) is excluded from `k` and `n`. One unplug alone is never Possible or Confirmed. Neighbor, linked or manual hints may raise a level by one step, never to Confirmed unless k is at least 3 somewhere.

Compute `p` by summing the upper tail (`scripts/poisson.mjs`), not as `1 - sum`, which loses every digit for the small probabilities that matter. Start from a prior of 2 human unplugs per phone per hour and let it learn from quiet periods; the effect on the number of drops you need:

| n armed | mu | min k Possible | min k Confirmed |
|---|---|---|---|
| 3 | 0.15 | 2 | 3 |
| 5 | 0.25 | 2 | 4 |
| 10 | 0.50 | 3 | 5 |
| 20 | 1.00 | 4 | 6 |
| 30 | 1.50 | 5 | 7 |
| 50 | 2.50 | 6 | 10 |
| 100 | 5.00 | 10 | 14 |

Reproduce or change it: `node scripts/poisson.mjs table --lambda-per-hour 2 --window 90 --n 3,5,10,20,30,50,100`.

## Restore

A grid restore is evidence from the phones that dropped: at least `max(2, ceil(d / 2))` of the `d` dropped phones replug within one span `W_r = 90 s + p95 of measured replug delays` (use a prior such as 60 s until you have 20 samples). Replugs spread wider than `W_r` are generators or inverters coming on one by one and never count. If there is no restore evidence within 12 hours, the end is "unknown": never invent it. Late events recompute history; never push an alert for a decision whose event time is more than 10 minutes old.

## Make it order independent

Compute decisions as a pure function of the set of events, not of the order they arrived. Then duplicates, reordering, late delivery and shifting every time by a constant cannot change the answer, and you can test those as properties. Keep the clock as an input.

## Properties to test with fast-check

See `references/algorithm.md` for the full list P1 to P12. In short: one unplug never alerts; k at least 3 with p below 0.001 and n at least 3 always confirms; reorder and delay change nothing; duplicates change nothing; spread replugs never restore; a restore needs an outage; more drops never lower the level; shifting time shifts decisions; simulated events change nothing; noisy phones never confirm; fewer than 3 armed phones never confirm; no alert for old decisions.

Generators the tests need: baseline-rate human unplugs, true outages with up to 2 s jitter, generator restarts spread over minutes, phones delivering hours late, duplicates, noisy phones. Read the run count from `FC_NUM_RUNS` so a hook can run 100 and CI 2000. Keep the seed and shrunk case of any failure as a regression test.

## Cautions

- A small cell with few phones cannot confirm anything; evaluate it with its neighbors and label the result as wide-area.
- Do not publish a status for an area with fewer than 3 phones: it reveals one person.
- A heavier prior makes three phones unable to confirm at all (4 per hour: not possible with n = 3). Choosing the prior is a product decision; write the options down and ask.
