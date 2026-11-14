# ADR 0010: Public index actor and tile-free SVG map

Status: ACCEPTED (2026-11-14) by delegation.

## Context
Public pages need each area's status. If every page view asked the area actors, each view would cost Durable Object requests (100,000 per day shared). A map normally needs tiles from a third party, which would leak viewers to that party and adds a service.

## Decisions
1. **A `PublicIndex` actor** holds the latest public scope views. Area actors write to it only when a public view changes or disappears. Page requests read it with one Durable Object request, behind a 30-second cache.
2. **The map is an inline SVG of H3 cells**, built on the server from `cellToBoundary` and the catalog. No tiles and no outside request.
3. **Judge mode is a static replay file** built by running the real engine on a fixture at build time.

## Alternatives
1. **Query area actors per request.** Exact and fresh. Costs one request per parent per page view.
2. **Cloudflare KV or D1 for the index.** Adds a service and its own limits; needs the human's approval.
3. **OpenStreetMap tiles with a library.** Looks better. Adds a third-party origin, a tile usage policy to follow, and viewer leakage. Rejected for now; could return behind human approval.
4. **Run the engine in the browser for Judge mode.** Lets viewers change inputs. Needs a bundle and more CPU on phones. Rejected for the first version.

## Consequences
- The index is a singleton, which can serialize writes. Its write rate is the rate of public status changes, which is very low.
- The index must drop a scope when it falls below 3 members; a test covers it (W2).
- Without streets, the map looks plain. Area names and the list carry the meaning.
- Judge mode cannot show new situations. It is honest about being a replay.
