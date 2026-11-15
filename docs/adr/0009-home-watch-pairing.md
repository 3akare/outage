# ADR 0009: Home Watch pairing and stored links

Status: ACCEPTED 2026-11-15, under the human's blanket approval. Stored data accepted. Routing scheme: option 1 (the code carries the shard), as the Decision section recommends; `home-watch` task 2 may refine it and moves to option 2 only if the field test shows collisions.

## Context
A viewer must find the station's area actor from a short code. Areas are sharded by res-7 parent (ADR 0006), and a viewer's phone does not know the station's cell until it is paired. Pairing creates new stored data: a viewer-to-station link and the viewer's push token. The privacy rules say to ask the human before changing what is stored.

## Data stored (new)
- **Offer:** hash of the code, station install ID, expiry, failed attempts. Deleted on claim or expiry.
- **Pair:** pair ID, station install ID, viewer install ID, viewer push token, quiet window and UTC offset, optional station name, creation time.
- **Station state:** last known power state, since-time, last-seen time, only for paired stations.

All are removed by delete-my-data on either side. No names, phone numbers or locations are stored. The station's cell is already known to the system.

## Routing options
1. **Code carries the shard.** The first characters of the code encode a short hash of the station's parent cell. The Worker picks the actor from them. No global state. Collisions need the full code to match, so a wrong actor only gives a generic failure.
2. **Global `PairingDirectory` actor.** Maps code hash to station parent. One more actor and a singleton, but exact.
3. **QR carries the station cell.** Exact, but needs a camera and the library; manual entry would need the cell too.

## Decision
Start with option 1 plus the viewer typing or scanning the code only. If collisions or failures appear in the field test, move to option 2. The final scheme is fixed in task 2.

## Alternatives for the whole feature
- **No pairing: share a link.** A link anyone can open shows the station state to anyone with the link. Simpler, weaker privacy. Rejected.
- **Account login.** Contradicts the anonymous-install rule.
- **Peer-to-peer.** Needs both phones online and fails when one is behind carrier NAT.

## Consequences
- The server holds a viewer-to-station link. If it leaks, someone learns that two anonymous installs are related and whether a station has power. That is a smaller risk than a location, and the station's state is the only data the viewer gets.
- Five viewers per station and five stations per viewer keep the table small.
- The alarm multiplexer is a shared component; breaking it affects other timers.

## Refinement by `home-watch` task 2 (2026-11-15): the shard comes from the station install, not the parent cell

Option 1 stays. Task 2 found two problems with "the first characters encode a hash of the station's parent cell":
- The Worker cannot go from a hash of a parent back to the parent, so it still would need a table.
- A claim, a remove and the delete-my-data call must all find the same rows. A parent can change when the station moves, and a parent hash says nothing about which install owns the rows.

**Scheme chosen.** One new Durable Object class, `PairingActor`, one instance per **pairing shard** (a name of two code-alphabet symbols, 900 shards). A shard holds only the offers and pairs of the stations that map to it. Instances exist only while an offer or pair is there (cost for the free tier stays small).
- **Station shard** = `shardFromHash(SHA-256(stationInstallId))`. It is stable for the install's life, needs no table and does not change when the station moves.
- **Code (10 symbols)** = shard (2) + offer key tail (2) + secret part (6). The Worker routes a claim by `code[0..2]`.
- **Offer key** = `code[0..4]`. The shard looks up the offer by this key, then compares an HMAC of the whole code (constant time). The key finds the offer so that a wrong guess can be counted against it; a hash-only index could not attribute a wrong guess to any offer.
- **Pair id** = shard (2) + 128 random bits (hex). A viewer's remove and, later, `GET /v1/home/:pairId` route by its first 2 symbols with no table.
- **Hash storage.** The stored value is `HMAC-SHA-256(INSTALL_TOKEN_SECRET, "pair-code-v1|" + code)` in hex, so a leaked table cannot be brute-forced offline (the code has 49 bits). The actor never sees the code, only its HMAC and key. The offer lives at most 10 minutes and an alarm deletes expired offers.
- **Attempts rule** (`decideClaim` in `packages/shared`): a live offer burns after 5 failed claims; an expired or missing offer fails and is dropped; every failure gives the same 404 `{"error":"not_found"}`.
- **Guessing cost.** An attacker needs a live key (4 symbols, 810,000 values over all shards) and then has 5 tries at a 6-symbol secret (about 7.3e8 values): about 7e-9 per offer found. The real control is the per-offer cap of 5 wrong attempts, stored on the offer in the one shard its code prefix routes to. The per-install token bucket (`BUCKET_CAPACITY`, `BUCKET_REFILL_MS`) is kept in each shard actor's memory, so it does not bound one install across shards, and it resets on restart or when the table is cleared. Installs are limited per source by `/v1/register`.
- **Limits.** One live offer per station (a new offer replaces the old). At most 5 pairs per station (R1.9), checked when the offer is made and again when it is claimed. A claim for a code that matched but finds the station full returns 409 `station_full`; the caller already holds a valid code, so this tells them nothing new.
- **Delete-my-data.** A station's rows are in the shard computed from its install id. A viewer's pairs are in the shards named by its `pairIds`; the viewer app lists them in the delete request (new optional field `pairIds`, at most 25). `POST /v1/pair/remove` removes one pair for either side.

**Stored data.** Unchanged from the table above, with these exact columns: offer (`key`, `code_hash`, `station_install`, `expires_ms`, `attempts`); pair (`pair_id`, `station_install`, `viewer_install`, `fcm_token`, `quiet_start_min`, `quiet_end_min`, `tz_offset_min`, `station_name` nullable, `created_ms`). No cell is stored with either row. The claim response carries only the `pairId`, not `stationCell` as the design's diagram showed, so the viewer learns nothing about where the station is (R4.5, R1.7).

**Known gaps, accepted.**
- "Five stations per viewer" (design section 9) is not enforced on the server. A viewer's pairs sit in different shards and counting them would need a global table or a second actor call that can fail half-way. The app enforces it, and the claim limit bounds abuse. R1.9 (five viewers per station) is enforced.
- Tasks 5 to 7 need the station's cell or parent to read its state from the area actor. They will add it to the offer request and the pair row, with a further ADR note, rather than carry a cell now that no code uses.

**Alternatives considered again.**
- *Option 2, one global `PairingDirectory`.* Exact and simpler to count viewers per install, but it is a singleton on every claim and every delete. Registry and public index are already singletons, so the precedent exists. Kept as the fallback if a shard collision (two stations in one shard with the same 4-symbol key) shows up in the field test. Collisions are handled today by retrying the code, up to three times.
- *Pairs in the station's area actor.* The design's first idea. Rejected for routing: the viewer would need the station's parent. Task 5 can still copy what the push planner needs into the area actor.

## Known limitations from the security review of PR 13 (2026-11-15, verdict APPROVED)
- **No cross-shard install limiter.** One install gets a full bucket in each of 900 shard actors. Guessing resistance is unaffected (the per-offer cap holds), but the limiter does not protect the free-tier request budget from one noisy install. A Worker-level or registry-level limiter is a later option.
- **Viewer cleanup depends on the phone's pair list.** Delete-my-data reaches a viewer's rows and push token only through the `pairIds` the phone sends. A viewer that loses that list (reinstall, cleared app data) cannot remove them. The documented fallback is the station-side remove, which deletes the pair row and with it the viewer's push token.
- **A dead viewer keeps a seat.** A reinstalled viewer has a new install id, and its old pair still counts toward the 5-viewer cap until the station removes it. The station UI must list pairs with a remove action (home-watch task 8).
- **Failed-claim timing.** A wrong guess against an existing offer writes a row, and a missing key does not. Probably lost in network noise; verify only if key enumeration enters the threat model.
- **Offer retries spend limiter tokens.** Each of up to 3 key-collision retries in `pairOffer` calls `createOffer`, which takes a bucket token. Not a one-line fix (the retry needs a core change to skip the limiter), and harmless at the current capacity, so left as is.
