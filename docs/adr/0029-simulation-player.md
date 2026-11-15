# ADR 0029: Simulation player at /app/simulate

Status: ACCEPTED (2026-11-22), under the blanket approval. Spec: `.kiro/specs/ux-redesign/`.

## Context
The old judge page was a long list of steps with play controls. The human could not tell what it was. ADR 0027 says the web has a landing page, a real-data replica and a clearly separate simulation.

## Decision
- `/app/simulate` is a static page with one sentence, one button ("Simulate a blackout"), one hexagon with a dot per simulated phone, a four-step tracker (Power on, Possible, Confirmed, Restored) and a count in plain words ("6 of 10 phones lost power together").
- The page script `/simulate.js` fetches `/api/v1/public/judge/replay` (real engine output, ADR 0015) and plays the frames. Quiet gaps are squeezed, the long outage gap becomes about 2 s, so a run takes about 15 s. The "How sure is Outage?" card shows the engine numbers (k of n, usual rate, chance of luck, restore check).
- The banner "Simulated, not live data" is in the HTML, sticky at the top. The page never reads the public index and real pages never read the replay (W6).
- `/judge` answers 301 to `/app/simulate`. The "Your spot only" step is not shown in the player; the replay still contains it.
- Service worker (ADR 0016 revised): `/judge-sw.js` now caches only `/app/simulate`, `/simulate.js`, `/app.css` and the replay JSON, under cache `sim-v2`, and deletes older caches.

## Alternatives
- Embed the replay in the HTML: bigger page, and the JSON endpoint already exists.
- Keep the step list: it is what confused the human.

## Consequences
The page needs scripts; without them it shows the banner, the sentence and a note. The old `judge-*.png` screenshots are gone, replaced by `simulate-*.png`.
