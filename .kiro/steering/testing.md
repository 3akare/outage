---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/src/test/**/*.kt"]
---

# Testing rules

- TypeScript: Vitest runs unit tests and fast-check runs property tests. Kotlin: JUnit 4 on the JVM (`./gradlew testDebugUnitTest`). Kotlin test names start with the requirement or property ID, for example `fun R3_2_job_stop_is_recorded_before_reschedule()`.
- Detection requires property tests. Each one names its property ID (P1 to P12) in the test title, for example `it('P3 order and delay independence', ...)`.
- Generators must cover: baseline-rate human unplugs, true outages with up to 2 s jitter, generator restarts spread over minutes, phones delivering hours late, duplicates, noisy devices.
- Golden fixtures of real outages are replayed in CI. Large fixtures go in `fixtures/large/` (ignored from context).
- Never delete or skip a test without asking the human.
- Pin fast-check seeds when a failure is found, and add the shrunk case as a regression test.
- Simulated events must carry `simulated: true`.
- Property tests read the number of runs from `process.env.FC_NUM_RUNS` (default 100). The `detection-tests` hook uses 100 and the `property-suite-full` hook and CI use 2000.
- Test titles name the property ID first, for example `P3_order_and_delay_independence`. The `property-traceability` hook reads the titles.
