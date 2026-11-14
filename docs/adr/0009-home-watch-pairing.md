# ADR 0009: Home Watch pairing and stored links

Status: PROPOSED for the routing scheme (decided in `home-watch` task 2); ACCEPTED for the stored data (2026-11-14) by delegation, to be confirmed by the human.

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
