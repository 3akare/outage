# ADR 0032: Where subscriptions live and how pushes are sent

Status: ACCEPTED (2026-11-23), under the blanket approval (decide, record, proceed). Builds on ADR 0008.

## Context
`alerts-and-light-alarm` needs follower subscriptions on the server, a way to send FCM HTTP v1 messages from the free Worker plan (50 subrequests per invocation, one message per request), and a way to know who already got a push. This changes stored data (subscription rows with an FCM token, quiet window and UTC offset), so privacy steering requires a record. FCM is free; the human created the Firebase project and stored the service-account JSON as the GitHub secret `FCM_SERVICE_ACCOUNT`.

## Decision
1. Subscriptions live in the area actor of the followed cell's res-7 parent, in three SQLite tables: `subscription` (install ID, cell, token, kinds, quiet window, offset, creation time), `push_queue` (planned messages, no token) and `push_sent` (de-duplication memory, pruned after 7 days). Primary keys give one subscription per install and cell, and one queue or sent row per install, cell, episode and kind. No secondary index, so no extra rows written.
2. The area actor turns each de-duplicated push into `AreaPush` with the public precision of the finest public view that covers the cell (none means no push), queues messages for followers, and sends up to 40 per invocation. The rest stays queued and the actor alarm continues. The queue row holds no token: the token is read from the subscription at send time, so a refreshed token is used and a removed subscription sends nothing.
3. `POST /v1/follow` and `/v1/unfollow` take the install token, strict schemas, and a per-install limit of 60 an hour (`FOLLOW_PER_INSTALL_PER_HOUR`, memory only). Following an area with no public status is allowed.
4. The FCM client signs a JWT with Web Crypto, caches the access token in memory until a minute before expiry, never logs the secret or tokens, maps `UNREGISTERED` to subscription removal, `QUOTA_EXCEEDED` and `UNAVAILABLE` to back-off (1 minute doubling, 1 hour cap, `Retry-After` honoured), and drops other errors.
5. Delete-my-data: `AreaActor.deleteInstall` also removes the install's subscriptions, queue and sent memory. The phone lists its followed cells in the `cells` of `POST /v1/delete`, as it does for events, so the right actors are called.
6. A missing or malformed `FCM_SERVICE_ACCOUNT` is not an error for the Worker: queued messages are dropped as `NOT_CONFIGURED` and everything else works.

## Alternatives
- A separate subscription Durable Object per cell: one more class and migration, and a second hop on every push. Rejected; the area actor already owns the cell.
- FCM topics: no per-message cost, but quiet hours would move onto the phone and the token would not be needed. Rejected for now (ADR 0008).
- Keeping the token in the queue row: simpler send, but a stale token after refresh. Rejected.
- Treating decision time as the engine's `decisionTimeMs`: the area outputs do not carry it today, so the actor uses the time it drains the output. The age check is a second check on the engine rule (R6.9).

## Consequences
- About 40 pushes per invocation; a cell with more followers than that is sent over several alarm runs. Revisit before a wider launch.
- The follow contract fixture was not added as a JSON file because the secrets guard rejects a file with a token field. `packages/shared/test/follow.test.ts` builds the request in code instead. The Kotlin side should do the same until the guard allows a fixture.
