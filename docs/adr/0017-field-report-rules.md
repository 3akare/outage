# ADR 0017: Field report rules the spec left open

Status: ACCEPTED 2026-11-15, under the human's blanket approval. No threshold from `params.ts` changes. No new stored data.

## Context
`field-telemetry` R8 and design section 6 list the failure checks, but leave choices that the generator in `tools/field` has to make. Each one changes what a Bugfix Spec says or which signatures exist.

## Decisions
1. **ARMED_CRITICAL replaces ARMED_LOW for a class on the same day.** A device-day under 0.50 raises `ARMED_CRITICAL`; one from 0.50 up to (not including) 0.90 raises `ARMED_LOW`. A class can raise both when it has both kinds of device-day. Raising both for the same day would file two specs for one fault.
2. **Checks that are not about one phone class use `other:unknown:normal`** (`FALSE_ALARM`, `MISS`). Outage and miss records hold counts only, so no maker or Android version exists for them. `new-bugfix.mjs` already accepts this form.
3. **`DELAY_SLOW` pools job and receiver samples per class**, as the gate does (`evaluateGates`). The skill's metrics file says "the gate uses the job source"; the shared gate code, which is tested (F7), pools both. The report still prints the two sources separately.
4. **`UPLOAD_GAP` means two or more missing days.** A device whose last upload is the day before the report day has missed only that one day.
5. **Gap reasons are printed only when they are 1 to 24 upper-case letters, digits or underscores.** Anything else is counted as `OTHER`. The schema lets a phone send any string of 40 safe characters as a reason, and a reason shaped like an install ID would reach a public file.
6. **A signature first seen on the report day stays listed as "new" when the same day is run again**, so a second run gives byte-identical output and files nothing.
7. **Fixture candidates** are Confirmed, not withdrawn outages with at least 2 drops. The Worker keeps counts only, so "recorded by 2 or more devices" is the engine's drop count. No export command exists yet; the report says to ask the phone owners for their raw export and to use the `tools/sim` sanitizer (`sanitize`), and it commits nothing (R9.2).
8. **`tools/field/bin/field-report.mjs` does the fetch** with Node's `fetch`, so the token goes from the environment into one request header and nowhere else. It accepts `https` URLs, and `http` only for `localhost` and `127.0.0.1`.
9. **`packages/shared/src/device-day.ts` no longer uses constructor parameter properties**, because Node's strip-only TypeScript mode (used to run the CLI without a build step) rejects them. Behavior is unchanged.

## Alternatives
- Raise ARMED_LOW and ARMED_CRITICAL together: simpler rule, two specs per fault. Rejected.
- Compile `tools/field` to JavaScript with a build step: another step for the scheduled job to get wrong. Rejected; Node 22 runs TypeScript with `--experimental-strip-types`.
- Print unknown gap reasons: one hostile or buggy phone could put an identifier in the repository. Rejected.

## Consequences
- The signature list stays small and stable, so `failures.json` stays readable.
- A real reason longer than 24 characters shows as `OTHER` in the table until the list is revisited.
