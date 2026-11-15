# ADR 0018: The scheduled field run opens a pull request

Status: ACCEPTED 2026-11-15, under the human's blanket approval. No stored-data change, no new dependency.

## Context
Requirement R7.3 of `field-telemetry` says the scheduled run commits its report to `main`. The design left two questions open (design section 2): how a Kiro Web Schedule holds a secret, and whether a scheduled run may commit to `main`. Task 7 read the Kiro documentation:
- A scheduled task runs a prompt of up to 10,000 characters in autonomous mode against chosen repositories, on a daily, hourly or cron schedule evaluated in UTC (https://kiro.dev/docs/web/automations.md).
- The result is a pull request or merge request. "Nothing reaches your main branch without your review" (same page).
- Secrets are encrypted at rest and exposed to the sandbox as environment variables; plain environment variables hold non-sensitive values (https://kiro.dev/docs/web/sandbox/environment-variables.md).
- Sandbox internet access is limited to repository hosting unless widened. A custom allow-list of domains is available (https://kiro.dev/docs/web/sandbox/internet-access.md).

## Decision
1. The scheduled run commits once on a branch `field/YYYY-MM-DD` and Kiro opens a pull request. The human merges it. R7.3 is amended to say so.
2. `FIELD_READ_TOKEN` is a Kiro Web secret and `WORKER_URL` an environment variable. The Kiro docs confirm secrets work, so the manual fallback of design section 8 stays only as a fallback.
3. The sandbox needs two allowed hosts: `registry.npmjs.org` (for `npm ci`) and the Worker host.
4. The record of the task is `.kiro/schedules/field-test.md`, including the prompt text to paste.

## Alternatives
- **Open internet for the sandbox.** Simplest to set up. Docs warn of prompt injection and secret extraction; rejected, a short allow-list is enough.
- **A GitHub Actions cron that runs the generator and pushes to `main`.** Works without Kiro Web, keeps R7.3 as written, uses a GitHub secret. Not chosen because R7.1 asks for a Kiro Web Schedule. It is the fallback if the schedule proves unreliable, since `tools/field` has no Kiro dependency.
- **Keep committing to `main` from the schedule.** Not possible per the docs.

## Consequences
- A human merges a pull request each morning. A day of unmerged reports does not lose data: the next run reads its own day from the Worker, and `docs/field/failures.json` on the next branch is built from `main`, so an unmerged day's new signatures may be filed again under another date. Merge in order.
- The agent in the sandbox can read `FIELD_READ_TOKEN`. The token only reads aggregate numbers with per-request aliases. A leak is handled by `wrangler secret put FIELD_READ_TOKEN` with a new value.
