---
inclusion: always
---

# Definition of done

A task is done only when ALL of these are true:

1. Its acceptance criteria are met and named in the commit or test.
2. Tests pass, including every property test it touches. Never mark a task done with failing or skipped tests.
3. Typecheck and lint are clean.
4. `docs/kiro-log.md` has an entry.
5. Any non-obvious decision has an ADR in `docs/adr/` (context, decision, alternatives, consequences).
6. `docs/traceability.md` links requirement, property, test and task.
7. It is committed and pushed to `main`.

## Always
- Verify platform APIs with an MCP docs server before using them.
- Prefer the simplest design that meets the spec. No speculative features.
- Explain every detection decision in data (counts, baseline, probability) so the UI and debugging can show why.
- Keep `main` demo-ready. Never push a red commit.
- When unsure about a product or algorithm choice, write the options in an ADR and ask the human. Do not guess on thresholds, privacy or money.

## Ask the human before
Adding any dependency or service, changing detection thresholds, changing what data is stored, or deleting tests.

## Git
- Commit and push directly to `main` until the human says "switch to PRs". Commit after every completed task.
- Conventional Commits with spec and task, e.g. `feat(detection): Poisson window test [spec:detection-engine task:3]`.
- Never commit secrets.
