# ADR 0016: The Judge page uses a small service worker for offline refresh

Status: PROPOSED (2026-11-15). Needs the human's confirmation.

## Context
web-and-area-pages R6.7 asks that `/judge` work with no network after load and survive a refresh. The site CSP is `default-src 'none'`, and a normal reload revalidates the page over the network.

## Decision
Serve `/judge-sw.js`. It caches `/judge` and answers only `/judge` navigations, network first, cache on failure. The CSP gains `worker-src 'self'`. All steps are server-rendered, so no replay fetch is needed after load.

## Alternatives
1. **HTTP cache only (`max-age=3600`).** Simplest, but a reload offline can still fail.
2. **Inline the replay JSON and skip the worker.** Covers "no network after load", not an offline refresh.

## Consequences
- The worker has scope `/` but ignores every other path, so real pages are never touched (R6.8).
- The offline refresh is not yet tested in a browser; task 11 should check it.
- One extra CSP directive for every page.
