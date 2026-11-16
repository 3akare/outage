# ADR 0036: Home Watch station state lives in the pairing shard actor

Status: ACCEPTED 2026-11-23, under the human's blanket approval (decide, record, proceed). Stored-data change: see "Stored data".

## Context
This ADR also records one deviation from `home-watch` design sections 6 to 8: the state, alarm and push planner are in the pairing shard actor, not the area actor.

`home-watch` design sections 6 to 8 put the station state, the alarm multiplexer, the pair table and the push planner in the station's area actor. ADR 0009 (task 2) then put offers and pairs in a `PairingActor` per two-symbol shard, chosen from the station install, and said tasks 5 to 7 could copy what they need. A viewer's `GET /v1/home/:pairId` already routes by the first two symbols of the pair id to that shard, with no table. The area actor is chosen by the station's res-7 parent, which the viewer never knows (R4.5).

## Decision
1. **Pure state.** `homeState`, `foldPower` and `mergeWindow` live in `packages/shared/src/home.ts` (not in `packages/detection`: it is not outage detection and takes no area input, R2.8). Rules beyond the design pseudo-code: ties at the same instant sort `UNPLUG` last; a second `UNPLUG` while `OFF` keeps the first "since"; silence of exactly 30 minutes already shows `OFFLINE` (`>=`, matching the alarm). The station window keeps at most 500 power events and folds older ones into one seed event with the same effect.
2. **One actor per station holds everything.** The `PairingActor` of the station's shard owns the pairs, `station_state`, `pair_sent`, the in-memory window, the push planning and the single alarm. The alarm multiplexes offer expiry, station silence, push retry and a daily prune of old `pair_sent` rows. It is moved only earlier, or later changes under one minute are ignored (H7).
3. **The area actor only forwards.** On a successful claim the Worker tells the area actor of the station's res-7 parent to watch that install (`watchStation(install, shard)`), using a cell the station sends with its offer. For events of a watched install the area actor calls the shard's `observe` once per ingest batch, after its own work and best effort. `observe` returns false when the shard no longer needs the install (no pairs), and the area actor drops the watch.
4. **The station's cell travels only as far as the offer and the area actor's watch row.** The offer row gets a nullable `station_cell`. It is used once, at claim time, to pick the area actor, and is never returned to a viewer or stored on a pair. A station that sends no cell can still pair, but its events are not forwarded, so the viewer sees `UNKNOWN` then `OFFLINE`.
5. **Pushes** reuse the alerts FCM client, quiet-window test and 10-minute age limit. The shard sends directly (no queue), planning from the current state each time, so a retry is the same plan again and the sent memory `(pair, state_version, kind)` keeps it at once per change. `state_version` is the event time of the change (`OFFLINE`: the last-seen time before silence). `FcmOutgoing` gets an optional `priority` (default `HIGH`) so `OFFLINE` can go as normal priority (R5.7).
6. **Viewer API.** `GET /v1/home/:pairId` with `Authorization: Bearer <token>` and `X-Install-Id`. Only the pair's viewer may read it. Answers are cached 10 seconds per pair in the Worker isolate, after authentication. The body carries state, since, last known, last-seen time and the viewer's own station name. No cell.
7. **Dead tokens.** An `UNREGISTERED` answer sets `push_failed_ms` on the pair. Pushes to it stop, the viewer can still read state, and the daily prune removes the pair after 7 days (design section 9).

## Stored data (change, accepted)
- `pair_offer.station_cell` (nullable), `pair.push_failed_ms` (nullable).
- `station_state` (`station_install`, `state`, `since_ms`, `state_version`, `last_seen_ms`, `offline`), only for stations with a pair; `last_seen_ms` written at most every 10 minutes and on a state change (R8.1).
- `pair_sent` (`pair_id`, `state_version`, `kind`), removed with the pair.
- Area actor: `home_watch` (`install_id`, `shard`), no cell.
- Delete-my-data removes all of these for an install, as station or viewer.

## Alternatives
- *State in the area actor (the design as written).* Needs the pair rows and tokens copied there and a second route for the viewer. Rejected: two copies of a push token, and the viewer would need the parent.
- *Every ingest batch calls the shard.* One extra Durable Object request per batch from every phone. Rejected for the free tier.
- *Mark stations on the wire (`source`).* Still deferred (ADR 0034).
- *A global `PairingDirectory`.* Rejected in ADR 0009.

## Consequences
- A station that moves to another res-7 parent is not forwarded until it is paired again. The viewer sees `OFFLINE` after 30 minutes. Accepted for a spare phone that stays at home.
- A shard actor is now busier than an offer table (heartbeat every 10 minutes per station). Stations are few.
- `observe` is best effort. A failed call loses one heartbeat, and the next batch repairs the state because events carry their own times.
- A Worker isolate cache can show a removed pair for up to 10 seconds.
