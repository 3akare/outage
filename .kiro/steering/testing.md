---
inclusion: fileMatch
fileMatchPattern: "**/*.test.ts"
---

# Testing rules

- Vitest runs unit tests. fast-check runs property tests.
- Detection requires property tests. Each one names its property ID (P1 to P12) in the test title, for example `it('P3 order and delay independence', ...)`.
- Generators must cover: baseline-rate human unplugs, true outages with up to 2 s jitter, generator restarts spread over minutes, phones delivering hours late, duplicates, noisy devices.
- Golden fixtures of real outages are replayed in CI. Large fixtures go in `fixtures/large/` (ignored from context).
- Never delete or skip a test without asking the human.
- Pin fast-check seeds when a failure is found, and add the shrunk case as a regression test.
- Simulated events must carry `simulated: true`.
