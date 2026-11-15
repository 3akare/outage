# ADR 0021: Worker deploy workflow and secret bootstrap

Status: ACCEPTED (2026-11-15, under the blanket approval).

## Context
The human now has a Cloudflare account. The Worker in `workers/api` needs a repeatable deploy that costs nothing, runs only after the repo checks pass, and never rotates `INSTALL_TOKEN_SECRET` (rotating it invalidates every install token, ADR 0003). `FIELD_READ_TOKEN` guards the field-report route. `wrangler.jsonc` already has migrations v1 to v5 that create all five Durable Object classes as SQLite-backed classes, which is the only kind the Workers Free plan allows. No new service or dependency is added: GitHub Actions on a public repo and Cloudflare Workers Free are already in the stack, and `wrangler` is already a dev dependency.

## Decision
- `.github/workflows/deploy-worker.yml` runs on `workflow_dispatch` and on push to `main` (paths: `workers/api`, `packages`, the workflow itself). Only `main` is deployed.
- A first step checks that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist. If not, the run prints a notice and finishes green with every later step skipped.
- The job runs lint, typecheck, `npm test` and spec-lint, then `npx wrangler deploy` from `workers/api` using the repo's pinned wrangler. No third-party action is used, so the secrets stay in `wrangler` calls only.
- After deploy it lists secrets (`wrangler secret list --format json`). `INSTALL_TOKEN_SECRET` is created from `openssl rand -hex 32`, piped into `wrangler secret put`, only when absent. It is never printed.
- `FIELD_READ_TOKEN` is pushed on each deploy when the GitHub secret of that name exists, so rotating it in GitHub propagates. Otherwise a notice says the Worker has none and the route answers 500.
- A smoke check does GET `/` and `/api/v1/public/judge/replay` against the workers.dev URL parsed from the deploy output. It retries 5 times and fails on non-2xx. curl sends a descriptive User-Agent because workers.dev applies Browser Integrity Check.
- Permissions are `contents: read` only. Deploys are serialized with a concurrency group that does not cancel a running deploy.
- No stored-data change and no change to detection thresholds.

## Alternatives
1. `cloudflare/wrangler-action@v4`. Works and is documented, but adds a third-party action in the path of a deploy token, and its secret handling does not cover "create only if missing". Plain wrangler gives the same result with less trust.
2. Create `INSTALL_TOKEN_SECRET` by hand. Simple, but one more manual step that is easy to get wrong. The workflow does it safely.
3. Push `INSTALL_TOKEN_SECRET` on every deploy from a GitHub secret. Rejected: a typo or rotation would invalidate all installs.
4. Make the deploy a job inside `checks.yml`. Rejected: it would mix a privileged job into the PR checks.

## Consequences
- Until the human adds the two Cloudflare secrets, every push to `main` that touches the Worker ends with a green "skipped" run.
- `INSTALL_TOKEN_SECRET` lives only in Cloudflare. Losing it (for example deleting the Worker) means new tokens for all installs. The guide says so.
- `wrangler secret put` creates a new Worker deployment each time, so a first deploy makes up to three deployments. This is harmless.
- The first Durable Object migration runs on the first deploy. Later deploys must append migrations (v6, ...) and never edit existing tags.
- The smoke check proves the Worker answers. It does not prove ingest works end to end. That needs the Android app or a manual request.
- Firebase and `FCM_SERVICE_ACCOUNT` are not used by this workflow. Sending pushes needs a later spec and ADR.
