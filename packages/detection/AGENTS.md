# packages/detection rules

- Pure TypeScript. No I/O, no network, no storage, no `Date.now()`. The clock is an input.
- Signature: `(cell state, events, clock) -> (new state, outputs)`.
- Order- and delay-independent. Every decision carries an explanation (counts, baseline, probability).
- Do not change thresholds (W, p cut-offs, k, weight, 12 h, 10 min) without asking the human. Write options in an ADR.
- Every property P1 to P12 has a fast-check test whose title names its ID. Never skip or delete one.
- Reference: `README.md` here and `.kiro/steering/detection.md`.
