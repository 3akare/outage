# ADR 0045: Home Watch app screens before Firebase Messaging, and the station pair list

Status: ACCEPTED 2026-11-23, under the human's blanket approval (decide, record, proceed). No new stored data.

## Context
`home-watch` task 8 builds the Compose screens. Three gaps showed up:
1. The claim needs a viewer FCM token (R1.4), but the app has no Firebase Messaging yet: the Firebase account is still open for the human, and the dependency needs its own ADR.
2. The ADR 0009 review note says the station must list every pair with a remove action. The Worker had no call that lists a station's pairs.
3. Delete-my-data on a viewer must list its pair ids so the Worker can clean their shards (R7.4). The app's phone-side delete runs before the server call (app-shell R5), so the local list is gone by then.

## Decision
1. **No-push token.** Until Firebase Messaging lands, the viewer sends `fcmToken: "none"` (`NO_PUSH_TOKEN` in `packages/shared/src/pairing.ts`, same constant in `HomeApi`). The Worker's home push planner skips such pairs, so they are never sent to and never marked dead. The viewer refreshes `GET /v1/home/:pairId` when its screen or Home card opens and once a minute while shown (R4.3, push part waits). A later claim with a real token replaces the pair (pairing the same two phones again replaces the old pair).
2. **`POST /v1/pair/list`** with `{ installId }` and the install token. It goes to the caller's own shard and answers `{ pairs: [{ pairId, createdMs }] }` for the pairs where the caller is the station. No viewer install, token or name. The station screen lists them as "Phone 1, paired 12 Nov" with Remove, which calls the existing `/v1/pair/remove`.
3. **Delete order.** The Home Watch phone-side delete copies the pair ids into memory, then clears the list; the server delete sends them as `pairIds`. If the server call fails and is retried after a restart, the ids are gone; the viewer's pairs then go when the station removes them or when the station's data is deleted.
4. **Screens.** Settings > Home Watch (viewer: enter code, name kept on the phone, cards, remove, link to the station side), Settings > Station mode (station: "Pair with my phone", code shown only until expiry, SIM hint, pair list), and a Home card under the map shown only when a pair exists. The phone never derives a station state. No QR (libraries not approved; R1.8 code entry only).
5. **Shell hooks.** `ShellGraph.openFeature` and `goBack`, set by `Shell`, let a feature screen open another feature. The Home hero slot became a column so the card sits under the map.

## Alternatives
- *Send a made-up token.* The Worker would get `UNREGISTERED`, stop pushes and remove the pair after 7 days. Rejected.
- *Add Firebase Messaging now.* Needs the Firebase project (human action) and an ADR for the dependency. Deferred, not rejected.
- *List pairs from the viewer's records on the station.* The station holds no pair record on the phone. Rejected: a second copy that can drift.

## Consequences
- Viewers learn of changes only while the app is open, until Firebase Messaging is added. The push latency check (task 9) needs it.
- One more Worker route; it costs one Durable Object request per station screen open.
