# ADR 0003: Server-signed install tokens

Status: ACCEPTED (2026-11-14). Revocation storage decided in the addendum at the end (task 9).

## Context
Installs are anonymous. If anyone can post events under any made-up install ID, three scripted fake installs could fake a Confirmed outage in a cell. The brief forbids phone numbers, names and any identity, and forbids paid services.

## Decision
`POST /v1/register` mints a random 128-bit install ID and returns a token, `HMAC-SHA-256(secret, installId)`. The secret is a Wrangler secret named `INSTALL_TOKEN_SECRET`. The server stores nothing at registration. Every events request must carry a valid token for its install ID. Registration is rate-limited per source in memory, and IP addresses are never stored or logged.

## Alternatives
1. **No authentication.** Cheapest. Trivial to fake a crowd.
2. **Play Integrity attestation.** Strongest device proof, but an external Google service with quotas and an approval step. Needs human approval and adds sideload problems for an APK distributed outside the store.
3. **Proof of work at registration.** No service, but costs battery on low-end phones and does not stop a determined attacker.
4. **Per-install row on the server.** Allows revocation and counting, but stores data per install and spends row writes.

## Consequences
- A scripted attacker can still register many installs slowly. The per-source limit makes it costly, and detection weights and the 3-drop plus Poisson test are the second layer. This is stated openly as residual risk.
- Delete-my-data removes event rows. The token cannot be un-minted, so a short-lived revocation list (30 days, hashed IDs only) is the proposed approach; task 9 confirms or replaces it.
- The human must set the secret with `wrangler secret put INSTALL_TOKEN_SECRET` before deploy. Never commit it.
- Rotating the secret invalidates all installs. Re-registration is automatic on a 401 (30-second re-onboarding principle).

## Addendum 2026-11-14: revocation storage (event-ingest task 9)

Status: ACCEPTED by delegation. Replaces "to be confirmed during task 9" above.

### Context
`POST /v1/delete` must make the install's token useless (R12.2), and every events request must be refused afterwards even in an area the install never listed. The token is a pure HMAC, so it cannot be un-minted. Something must remember "revoked", for at most 30 days, without keeping a per-install row forever and without storing the install ID in the clear.

### Decision
- **One small registry Durable Object** (`RegistryActor`, SQLite) holds a `revoked` table: `hash` (SHA-256 of the install ID, hex) and `expires_ms` (revocation time + 30 days). The same object keeps one row per day of aggregate counters (rows written, counts by result code and event type), which area actors report to it at most once per flush interval. These counters hold no install IDs and no cells.
- **Worker cache.** Each Worker isolate keeps the full set of non-expired hashes for 15 s (`REVOCATION_CACHE_MS`) and refetches after that, so the registry costs about one Durable Object request per isolate per 15 s, not one per events request. The isolate that handled the delete learns at once. Others learn within 15 s; a late retry in that window can still reach an area actor once. That is accepted: the rows it could create expire with the 30-day retention anyway.
- **Fail closed.** If the registry does not answer, the events request returns 503 (transient for the Uploader). It is never treated as "not revoked".
- **Order in delete.** Revoke first, then delete rows in each listed area (one call per res-7 parent), so late uploads stop before the rows go. A revoked token may still call `POST /v1/delete`, so a delete that failed half-way can be retried.
- **Expiry.** A daily alarm deletes expired hashes. After 30 days the old token verifies again. An install that deleted its data has discarded its token, and events from a revived old token would create fresh data for an ID with no history, which retention removes after 30 days.

### Alternatives
1. **Revocation list inside every area actor.** No central object, but the Worker cannot know which actors to ask on an events request, so revocation would not be global.
2. **Workers KV with a 30-day TTL.** Natural fit for expiring keys, but a new service with its own free-tier limits (1,000 writes/day) and eventual consistency up to 60 s. Needs human approval (new service).
3. **Per-install rows kept forever.** Rejected earlier in this ADR.
4. **Rotate the secret on delete.** Invalidates every install.
5. **A registry call on every events request without the cache.** Simplest, but doubles Durable Object requests against the 100,000 daily cap.

### Consequences
- One extra Durable Object class and migration (`v2`). A single registry object serializes the (small) revocation and report traffic. Reports come at most once per actor per flush interval.
- The revoked set grows with the number of deletions in 30 days; each snapshot fetch returns all hashes. At hundreds of deletions this is a few tens of KB. Revisit if deletions reach thousands.
- Delete only reaches the cells the phone lists. A phone must list every cell it ever sent from; anything missed expires after 30 days.
