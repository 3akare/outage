# Requirements: onboarding

Status: APPROVED by delegation on 2026-11-14. Design in `design.md`, tasks in `tasks.md`.

## Introduction

Onboarding takes a new user from first launch to an armed sensor in under 60 seconds. It picks the user's spot, asks consent, registers the install, gets the permissions the alarm needs, shows the exact battery steps for the user's phone maker, runs a 10-second unplug and replug self-test. (The one-tap Station mode offer was removed with Home Watch, ADR 0055.)

It is also the answer to "phones were reset, flashed, broken or swapped and nobody asked to reinstall" from the resurrection table: re-onboarding takes about 30 seconds.

## Glossary

- **Spot**: the H3 cell where the phone usually charges.
- **Maker**: the phone manufacturer family (Tecno, Infinix, itel, Samsung, Xiaomi, Pixel, other).
- **Battery exemption**: the system setting that stops battery optimization from limiting the app.
- **OEM guide**: the data file with exact per-maker steps.
- **Self-test**: the 10-second unplug and replug check.
- **Re-onboarding**: onboarding on a phone that was reset, flashed or reinstalled.

## Requirements

### R1 Flow and time
**User story:** As a stranger, I want to finish setup quickly without help.
1. THE app SHALL offer these steps in order: welcome with Judge mode link, spot, consent, notifications, battery, self-test, optional Station mode.
2. THE flow SHALL fit in 60 seconds for a user who taps without delay on a phone that already has the needed settings reachable.
3. THE app SHALL record, on the phone only, the time spent on each step to show the 60-second budget in diagnostics.
4. THE flow SHALL have one primary action per screen.
5. THE flow SHALL be resumable: closing the app mid-flow and reopening SHALL return to the same step.
6. THE flow SHALL work with no network, except registration, which SHALL retry in the background.
7. THE flow SHALL be usable with large text and a screen reader.

### R2 Judge mode entry
1. THE first screen SHALL offer "Try Judge mode" beside "Set up my phone".
2. WHEN the user picks Judge mode, THE app SHALL open `demo-mode` without registration, consent or any permission.
3. THE user SHALL be able to leave Judge mode and start setup at any time.

### R3 Spot
**User story:** As a user, I want to choose where my charger is without giving away my address.
1. THE app SHALL offer "Use my location once" and "Pick on the map".
2. WHEN the user chooses location, THE app SHALL request only the coarse foreground location permission, read one position, compute the H3 res-8 cell, and discard the coordinates.
3. THE app SHALL NOT store, log or send the coordinates.
4. IF the position cannot be read in 8 seconds or permission is denied, THEN THE app SHALL offer "Pick on the map".
5. WHEN the user picks on the map, THE app SHALL show the neighborhood list from the catalog, then a hex grid around the neighborhood centre for the user to tap their cell.
6. THE app SHALL show the chosen area name and "wide area" label when the cell has no public status (see `area-cells`).
7. THE app SHALL allow an optional postcode prefix, stored on the phone, never used to find a cell.
8. IF the location is reported as mocked, THEN THE app SHALL ask the user to confirm the cell, since the position may be fake.
9. THE user SHALL be able to change the spot later in settings.

### R4 Consent
1. THE app SHALL show a plain list of what is collected: anonymous install ID, the cell, when charging stops and starts, and diagnostics only if the user opts in.
2. THE app SHALL show what is not collected: no name, phone number, microphone, or exact location.
3. THE app SHALL NOT register the install or send any event until the user taps "I agree".
4. THE app SHALL store the consent version and its time on the phone.
5. THE app SHALL show the optional "Share anonymous diagnostics" choice, off by default in public builds and on by default only in builds marked as field-test builds.
6. THE app SHALL offer "Delete my data" in settings at any time.

### R5 Registration
1. WHEN consent is given, THE app SHALL register as in `event-ingest` R2.1 and store the install ID and token.
2. IF the network is down, THEN THE app SHALL continue the flow and retry registration with back-off until it succeeds.
3. THE Sensor SHALL NOT upload events before registration succeeds, and SHALL keep them in the Outbox.

### R6 Permissions for the alarm
1. WHEN the phone runs Android 13 or higher, THE app SHALL request the notification permission with a one-sentence reason.
2. THE app SHALL create the notification channels before requesting the push token.
3. THE app SHALL check `canUseFullScreenIntent` and, IF it is false, SHALL show a skippable step that opens the system page for it.
4. THE app SHALL check the alarm volume and warn when it is zero.
5. THE app SHALL show each permission result in the Alarm check list (`alerts-and-light-alarm` R5.3).
6. IF the user denies the notification permission, THEN THE app SHALL continue and SHALL explain what will not work.

### R7 Maker detection and battery steps
**User story:** As a Tecno or Infinix user, I want the exact steps for my phone.
1. THE app SHALL detect the maker from the system manufacturer and brand strings and show the matching steps, or the general steps for an unknown maker.
2. THE OEM guide SHALL cover Tecno, Infinix, itel, Samsung, Xiaomi and Pixel.
3. EACH guide entry SHALL list numbered steps, the setting names as the phone shows them, a source URL, and the device, Android version and date on which a person verified it.
4. IF a guide entry has no verification on the user's maker, THEN THE app SHALL label the steps "General steps. Names may differ on your phone."
5. THE app SHALL open the system battery settings with one tap, using the direct exemption request when the build allows it, and the settings list otherwise.
6. WHEN the user returns, THE app SHALL check whether the app is exempt from battery optimization and show the result.
7. THE app SHALL show the maker's other steps (autostart, background limits) as a checklist and SHALL ask the user to confirm each, since the system cannot report them.
8. THE app SHALL let the user skip the step and SHALL record the skip in diagnostics.
9. THE guide data SHALL live in one file in the repo used by the app and by the `oem-battery-guide` skill.

### R8 Self-test
**User story:** As a user, I want proof that my phone works before I rely on it.
1. THE app SHALL start the self-test with "Unplug your charger, then plug it back in" and a 10-second countdown.
2. THE Sensor SHALL provide `beginSelfTest` and `endSelfTest`. WHILE a self-test runs, THE Sensor SHALL record the next unplug and replug as test results and SHALL NOT emit events to the Outbox, show the prompt or ring an alarm.
3. THE app SHALL show three results: charger removal seen, sensor armed, charger return seen, each with a tick or a plain-words problem.
4. THE app SHALL show the measured detection delay in seconds, and a warning when it exceeds the milestone gate used for restore delay (60 seconds).
5. IF the self-test sees nothing within 20 seconds, THEN THE app SHALL offer "Try again" and "Skip".
6. THE self-test SHALL not change real history or statistics (supports P9 in spirit).
7. THE self-test results SHALL stay on the phone unless diagnostics are on.

### R9 Station mode

> **Withdrawn 2026-11-21 (ADR 0055).** Home Watch is removed, so there is no station to pair. The `STATION_OFFER` step is gone; after the self-test comes Finish. A saved record that names the old step is read leniently (unknown step names are dropped, an unknown current step becomes Finish). The text below is kept for history.

1. AFTER the self-test, THE app SHALL offer "Make this a station" for a phone that stays plugged in, as one tap.
2. WHEN the user taps it, THE app SHALL turn on Station mode as in `station-mode` R1 and open the pairing code screen of `home-watch`.
3. THE app SHALL explain in two lines what a station is.
4. THE user SHALL be able to skip it.

### R10 Re-onboarding
1. WHEN the app starts with no install ID, THE app SHALL run onboarding and SHALL reuse nothing from a previous install.
2. WHERE the system already grants a permission, THE app SHALL skip its step and show it as done.
3. WHERE the battery exemption is already on, THE app SHALL skip that step.
4. THE app SHALL show the spot from the last time as a one-tap suggestion if the user restored it from the phone's backup, only when backup restore is enabled (see decisions).
5. THE re-onboarding SHALL fit in 30 seconds when only consent, spot and registration are needed.

### R11 Finish
1. THE last screen SHALL say "Your phone is watching for power cuts" and show the Alarm check list.
2. THE app SHALL offer to follow the area (`alerts-and-light-alarm`) and nothing else.
3. THE app SHALL NOT ask for ratings, accounts or sharing during onboarding.

### R12 Privacy
1. THE onboarding SHALL request no microphone, accelerometer, contacts or fine location permission.
2. THE app SHALL persist no coordinates at any step.
3. THE onboarding timing data SHALL stay on the phone.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | "Spot by GPS once or postcode": a postcode cannot become a cell without a geocoding service. | R3.5 uses a neighborhood list and a hex grid. R3.7 keeps postcode as optional text. |
| G2 | The 10-second self-test would create a real `UNPLUG`. | R8.2 adds `beginSelfTest`. |
| G3 | Job-based detection takes up to tens of seconds, which cannot be shown in 10 seconds. | R8.3 reports charger removal from a foreground view and the job state separately. |
| G4 | The system cannot report OEM autostart settings. | R7.7 uses a checklist the user confirms. |
| G5 | OEM step names change by version and cannot be guessed. | R7.3, R7.4. |
| G6 | Google Play restricts direct battery-exemption requests; sideload is fine. | R7.5. |
| G7 | Fake GPS could put a phone in a wrong cell. | R3.8. |
| G8 | Consent text and version must be stored. | R4.4. |
| G9 | No registration before consent. | R4.3, R5.3. |
| G10 | Diagnostics opt-in was not defined. | R4.5. |
| G11 | The first screen must also serve judges. | R2. |
| G12 | Interrupted flows. | R1.5. |

## Decisions (2026-11-14)

- Spot by coarse location or by hex-grid pick; no external geocoding service.
- Diagnostics opt-in: off in public builds, on by default in field-test builds (a build flag). The human should confirm.
- Backup restore of the spot (R10.4): off. Android backup is disabled for the app (`allowBackup=false`) so no install ID or spot is restored.
- OEM guide verification: the steps shipped first are labeled general until a person verifies each on a device.
- New dependencies: none for the position, which uses the platform `LocationManager`. `com.uber:h3` (cell lookup), Jetpack Compose with Material 3, and a JSON library need human approval (ADR 0012).
