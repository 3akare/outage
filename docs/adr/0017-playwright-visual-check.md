# ADR 0017: Playwright as a dev dependency for the 390 px visual check

Status: ACCEPTED 2026-11-15, under the human's blanket approval.

## Context
web-and-area-pages task 11 needs a repeatable check of the public pages at 390 x 844: horizontal scroll, text size, tap targets, console errors, cross-origin requests, scripts off and the `/judge` offline refresh (ADR 0016). The Playwright power is an agent tool and leaves nothing a CI job can rerun. Sandboxes also kill `wrangler dev` when a shell command ends.

## Decision
Add `playwright` (Apache-2.0, free) as a root devDependency. `workers/api/visual/check.mjs` drives headless Chromium. `workers/api/visual/run.sh` starts `wrangler dev`, runs the check and stops the server in one shell command. A `visual` job in `.github/workflows/checks.yml` runs it on the free standard runner (the repo is public). Screenshots go to `docs/visual/`.
Free tier: the npm package and the Chromium download cost nothing, and GitHub Actions minutes are free for public repositories.

## Alternatives
1. **Only the Playwright power by hand.** No new dependency, but it cannot run in CI and the result is not repeatable.
2. **Lighthouse CI.** Heavier, and it does not check tap size or the service worker offline refresh.

## Consequences
- `playwright` is in `.kiro/approved-dependencies.json`. Browsers are downloaded on demand (`npx playwright install chromium`), not committed.
- The check found and fixed three defects: chips and notes under 16 px, and header and footer links under 44 px tall.
- No area is listed until a person fills in `checkedBy` (R10.3), so `/area/yaba` renders the 404 page for now. The check accepts 200 or 404 there. Once an area is listed, the area layout needs a second look.
- The steering example cell `8f2830828052d25` was not a valid res 8 cell and returned 404. It is now `88589c9861fffff`.
- Local only: this is `wrangler dev`, not the deployed domain.
