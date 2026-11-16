# ADR 0037: Coarse location for the spot, resolved against the published map

Status: ACCEPTED (2026-11-23), under the blanket approval. Spec: `onboarding` task 5 (R3, R12). Privacy rules stay.

## Context
Onboarding R3.1 offers "Use my location once". The H3 library (`com.uber:h3`) is not in the app, and it ships native code that cannot be checked on a device here. `privacy.md` allows a position to be read once on the phone to pick the cell and then discarded. The sensor spec says the Sensor itself uses no location, and `R12_manifest_privacy_check` banned the coarse permission from the whole manifest.

## Decision
1. The manifest gains `ACCESS_COARSE_LOCATION` only (never fine or background). It is asked on the Spot screen, when the user taps "Use my location once", in context (ADR 0030).
2. The cell is found without H3: `Spot.resolve` projects the position onto the outlines of the cells in the published area map (the same map the Area screen draws) and takes the cell that contains it, or the nearest within 3 km. The position is a function argument only. `Fix` is a plain class with no `toString`, nothing is logged, and the saved record has no field for a coordinate (test O2).
3. First result wins: a last-known position younger than 10 minutes, or a fresh fix, whichever arrives first; the wait ends after 8 seconds (R3.4). A position the system marks as mock asks the user to confirm the area (R3.8).
4. Cells of the labelled sample map are not real H3 cells and cannot be saved as a spot. The screen says so.
5. `R12_manifest_privacy_check` keeps banning fine and background location, microphone, motion, advertising ID, phone state and `dataSync`. Only the coarse entry is removed from the ban list.
6. The pick on the map lists the neighbourhoods of the map, then draws the blocks of one for a tap (R3.5).

## Alternatives
- `com.uber:h3` on the phone. Rejected for now: native libraries, no way to test them here, and the map already holds the outlines.
- Map pick only, no permission. Rejected: R3.1 asks for the location path, and it is the faster one for the user.
- Postcode lookup. Rejected: needs a geocoding service (onboarding G1).

## Consequences
- A spot by location works only where the Worker's map has cells. Outside it the user picks on the map or waits for the area to be mapped.
- The match is as good as the map's outlines. A position near an edge can land in the neighbour block; the confirm step is the user's check.
