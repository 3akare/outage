# ADR 0030: Android first run is one button, Home is the map plus the feed

Status: ACCEPTED (2026-11-22), under the blanket approval. Spec: `.kiro/specs/ux-redesign/` tasks 6 and 7. Follows ADR 0026 and 0028.

## Context
The onboarding state machine has eight steps (Welcome, Spot, Consent, Notifications, Battery, Self-test, Station, Finish), and no screen for it was ever built. A release build showed "Coming soon" at first run. ADR 0026 asks for one screen and one button.

## Decision
1. `FirstRunScreen` shows the pitch, a privacy line and one button, "OK, start". On Android 13 and later the button asks for the notification permission. The result does not matter: the app opens Home either way.
2. `OnboardingFlow.firstRun(version, atMs)` records consent and finishes in one call, only from Welcome. No cell is needed. Consent is still stored before anything registers or uploads (`RegistrationGate` is unchanged). The old steps stay in the machine and in tests, and can be reused from Settings.
3. `normalize` keeps a finished record that has consent and no cell. Every other record keeps the old rules. The test invariant has this one exception.
4. Home shows the map (the Area screen) in a 420 dp box on top and the feed below, in one scrolling column. Setup cards sit in the feed: "Keep Outage running" while the sensor is not armed, and "Choose your area" while no area is known. They open the Settings feature slots, which show "Coming soon" until built.
5. The dock has Home, Insights, Settings. `Route.Area` and `Route.Log` are removed. The deep links `area` and `log` open Home and Insights. Log had no screen yet, so nothing is lost.
6. `ui/Tokens.kt` holds the ADR 0028 colours by hand (the generator is still task 2). `Theme.kt` and `MapPalette.kt` read it. Cell patterns follow the ADR: normal solid, possible hatch, confirmed dots, restored outline, no data empty outline.
7. `POST_NOTIFICATIONS` is added to the manifest (a platform permission, not a dependency).
8. Compose screenshots are skipped. Paparazzi or Roborazzi would be new dependencies, and there is no emulator here. They move to the Kiro IDE pass (task 9).

## Alternatives
1. Make the machine itself shorter (Welcome, Finish). Rejected: rewrites many property tests for no user gain.
2. Ask for the spot on first run. Rejected by ADR 0026: it blocks the first look. The card covers it.
3. Split the map and feed with a bottom sheet. Rejected in ADR 0026.

## Consequences
- Armed time may drop for users who ignore the battery card. The field report will show it.
- The map box and the page scroll share vertical drags. Users scroll from the feed.
- Until the setup slots are built, the two cards lead to "Coming soon".
