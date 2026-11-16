# ADR 0054: A premium redesign built around the visitor's own location

Status: ACCEPTED (2026-11-16). Asked for by the human, who rejected the ADR 0053 screens: insights must be about "my own location, my own area… if I want other locations, I would search"; "if someone is in Ibadan and they are seeing Lagos… that's useless"; "make this website and app look premium"; "get the store badges"; "there should be a marketing page… and a simulation page"; "delete any trashy UI skill"; "fully web responsive"; "generate plausible data, label it simulated without making it look in your face". Supersedes ADR 0053 decisions 3 and 5 (the screens and the fixed simulated city on the web); keeps its map stack (MapLibre over OpenFreeMap) and the wordmark.

## Context
The web demo showed a fixed simulated Lagos to everyone and ranked Lagos areas in Insights. Outage is for anywhere the power is unreliable, and a visitor cares about their own block.

## Decision
1. **Your location first.** `/app/simulate` asks the browser for its location once (`navigator.geolocation`), builds the visitor's H3 resolution-8 block and every block within six rings around it with h3-js (served from this origin), and names the area from the street map's own place labels. The position never leaves the browser. Without a location, the visitor searches for a place.
2. **Plausible simulated data, seeded by the block** (`web/public/js/sim.js`): block states (the visitor's block and first ring on; a cluster out, one maybe, one back; thin data at the edge) and six weeks of outages (evening peak, weekdays heavier, no overlaps). The same place always tells the same story. Tariff bands (NERC A to E) apply only inside Nigeria; elsewhere there is no promise line. Labelled with a small "Simulated" tag, not a banner in the face.
3. **Insights are about your area only**: power a day against the band, days below it, outages, typical wait, longest outage, hours each day, when the power goes (weekday by hour), the weekly trend and the outage log. The ranking of other areas is removed. A searched place appears only when the visitor chose it, with a switch back to "My area". On Android, demo Insights show only the spot's area (picker and comparison removed); a real install already shows the person's own Power Log.
4. **Search** uses OpenStreetMap's Nominatim, on Enter only (its usage policy forbids autocomplete), with an origin referrer. Its origin is in the CSP of `/app/simulate` only.
5. **Premium design** (`web/ui/app/design.ts`): Inter (SIL OFL, self-hosted, latin subset, 68 KB) on the web; an 8-point spacing scale; near-black ink in three steps; hairline borders; layered soft shadows; glass panels (blur and saturation) over the map; 12/16/24 px corners; motion 200 to 300 ms ease-out, none when reduced motion is asked for; fully responsive from 320 px. Research used: typography, spacing systems, restrained motion and consistent hierarchy as the levers of a premium feel.
6. **Marketing page** at `/`: a hero with the live app on a drawn phone (a slowly turning globe with simulated power around cities with unreliable grids), floating notification and stat cards, store badges, facts, how it works, a feature bento, privacy, FAQ and a dark download section. **Store badges**: Google's own "Get it on Google Play" badge image, unaltered and self-hosted, plus GitHub (APK) and Aptoide badges in the same black style; Play and Aptoide show "Coming soon" and link nowhere until their URLs are configured.
7. **No third-party UI skill.** The Hallmark skill is removed (`.agents/`, `skills-lock.json`); steering says not to install one.

## Alternatives
1. **Keep a fixed demo city.** Rejected by the human: insights about places the visitor does not care about are useless.
2. **Reverse-geocode the area name with Nominatim.** Rejected: the street map's own labels name the area without sending the position anywhere.
3. **Autocomplete search.** Rejected: Nominatim's usage policy forbids it.

## Consequences
- The fixed `demo-city.json` is no longer served to the web; the Android demo still uses `DemoCity.kt`.
- Map pages depend on OpenFreeMap; search depends on Nominatim. Both are named on the privacy page and in the CSP.
- Android screens are still unverified on a device (spec task 7).
