# ADR 0003: Server-signed install tokens

Status: ACCEPTED (2026-11-14). Revocation storage detail to be confirmed during task 9.

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
