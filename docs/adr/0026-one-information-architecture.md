# ADR 0026: One information architecture, three dock tabs, one-step first run

Status: ACCEPTED (2026-11-22), under the blanket approval. Spec: `.kiro/specs/ux-redesign/`.

## Context
The app has five bottom tabs (Home, Area, Insights, Log, Settings) and a multi-step onboarding. The website is text pages. The human, who built it, could not tell what they were looking at. The intended product is simple: open the app, press one OK, see a map of your area and the areas around it coloured by blackout status, and move between Home (the feed), Insights and Settings from a dock.

## Decision
1. **First run is one screen and one button.** It asks only for what the sensor needs (notifications where the OS requires it) and opens Home. Battery steps, Home Watch, area choice and location become setup cards in the Home feed. Nothing blocks the first look.
2. **Home = map on top, feed below.** The map is the old Area map, shown close up on the user's cell and its neighbours, with pan and pinch to open the whole city. The feed lists the spot status, nearby outages and setup cards.
3. **The dock has three tabs: Home, Insights, Settings.**
   - Area merges into Home (the map) and the area list opens from Home.
   - Log merges into Insights ("Every outage" list under the charts).
   - Home Watch, alarm and alerts stay in Settings, with a status card in the Home feed.
4. **A fourth tab needs an ADR** showing the content cannot live in the three.
5. **The web follows the same shape:** `/app` (Home), `/app/insights`, `/app/settings`, same order and names (ADR 0027).

## Alternatives
1. **Keep five tabs.** Least work. Rejected: the human could not follow it, and Area and Log are views of Home and Insights.
2. **Four tabs with Map separate.** A map-first app often does this. Rejected: the human wants the map to be the first thing seen, which is Home.
3. **Keep the multi-step onboarding.** Teaches the battery step up front, which matters on Tecno and Infinix. Rejected for first run. The battery card stays at the top of the feed until done, so the step is not lost.
4. **Full-screen map with a sheet for the feed.** Strong map feel. Rejected for now: harder on small phones and on the web, and the feed matters for single-player value.

## Consequences
- Route changes in `shell/Routes.kt`; deep links `area` and `log` still open (Home and Insights).
- Armed time may drop if users skip the battery card. The field report (`field-report` skill) will show it, and the card can move into first run if so.
- Existing screens are reused, not rewritten: `MapScreen` moves into Home, `LogScreen` into Insights.
