# Requirements: app-shell

Status: APPROVED by the human on 2026-11-14 ("Yes add the spec"; Jetpack Compose approved the same day). Design in `design.md`, tasks in `tasks.md`.

## Introduction

The app shell is the frame of the Android app (`apps/android`): the first screen a person sees after setup, the navigation between the features, the settings screen with delete-my-data, the theme, the app icon and the shared string pack. Every feature spec (`onboarding`, `alerts-and-light-alarm`, `power-log`, `home-watch`, `demo-mode`) adds its own screens into this frame. The shell decides nothing about outages; it shows what the feature packages and the Worker report.

Single-player value comes first (`product.md`): the home screen must be useful with one charging phone and no network.

## Glossary

- **Home**: the first screen after onboarding. Answers "Is my power on?" for this phone's spot.
- **Spot status**: one of the five states from `copy.md`: Normal, Your spot only, Possible, Confirmed, Restored, plus the sensor states (Armed, Not charging, Not armed).
- **Destination**: a top-level screen reached from the navigation bar: Home, Log, Area, Settings.
- **Feature slot**: a place in the shell where a feature spec plugs in its screen (for example Power Log fills the Log destination).
- **String pack**: `res/values/strings.xml` and optional `res/values-pcm/strings.xml` (Nigerian Pidgin).

## Requirements

### R1 Start and routing
**User story:** As a new user, I want the app to take me to setup the first time and to my status every time after.
1. WHEN the app starts and onboarding has not finished, THE shell SHALL open the onboarding flow.
2. WHEN the app starts and onboarding has finished, THE shell SHALL open Home.
3. WHEN the app is opened from a notification (prompt, alarm, outage push, Home Watch), THE shell SHALL open the destination that notification names and SHALL keep Home in the back stack.
4. THE shell SHALL NOT start the sensor, the station service or any upload by itself; those start from the feature packages after onboarding.

### R2 Home screen
**User story:** As a person with one charging phone, I want one glance to tell me whether power is on at my spot and whether the app is watching.
1. THE Home screen SHALL show the sensor state: "Watching" when armed, "Not charging" when unplugged, "Not watching" with the reason when not armed.
2. THE Home screen SHALL show the spot status from the latest known area status, or "No area data yet" when there is none, and SHALL label the time of that data ("Updated 2 min ago").
3. WHEN the phone has no network, THE Home screen SHALL still show the sensor state and the last known area status with its age, and SHALL say "Offline".
4. THE Home screen SHALL show today's power hours from the Power Log feature when it exists, and SHALL hide that card when it does not.
5. THE Home screen SHALL show a Light Alarm control that names its state (off, waiting for power, ringing) and opens the alarm feature.
6. THE Home screen SHALL label any simulated data "Simulated" (`demo-mode.md`).

### R3 Navigation
1. THE shell SHALL provide a bottom navigation bar with four destinations: Home, Log, Area, Settings.
2. WHEN a feature for a destination is not built yet, THE destination SHALL show a short "Coming soon" screen and SHALL NOT crash.
3. THE back button SHALL return to Home from any other destination, and leave the app from Home.
4. THE shell SHALL keep each destination's scroll position when switching between them in one session.

### R4 Settings
**User story:** As a user, I want to control my data and the app in one place.
1. THE Settings screen SHALL list: Light Alarm settings, notifications, battery setup (re-run the maker steps), Station mode, Home Watch, followed area, language, share anonymous diagnostics, delete my data, about and privacy.
2. Each item SHALL open the owning feature's screen, or show "Coming soon" when the feature is not built.
3. THE Settings screen SHALL show the app version and the install's short alias (never the install ID).

### R5 Delete my data
1. WHEN the user chooses "Delete my data", THE shell SHALL ask for confirmation with a plain description of what is deleted.
2. WHEN confirmed, THE shell SHALL call each registered feature's delete function and the server delete call (`event-ingest` R12), and SHALL then return to onboarding.
3. IF the server call fails, THEN THE shell SHALL still delete everything on the phone, SHALL keep the pending server request, and SHALL retry it when a network is available.
4. THE shell SHALL show "Deleted" only after the phone side is empty.

### R6 Theme and accessibility
1. THE shell SHALL use one Material 3 theme with light and dark colour schemes that follow the system setting.
2. Each spot status SHALL have a colour and an icon and a text label, so that it never depends on colour alone.
3. Text SHALL scale with the system font size up to 200% without clipping the status text on a 360 dp wide screen.
4. Touch targets SHALL be at least 48 dp.
5. Every image and icon that carries meaning SHALL have a content description.

### R7 Strings and language
1. All user-facing text SHALL come from the string pack. No literal user-facing strings in Kotlin code.
2. THE shell SHALL ship English, and SHALL accept an optional Pidgin pack (`values-pcm`) that falls back to English for any missing key.
3. THE copy SHALL follow `copy.md`: plain words, the five state names, "Station offline" after 30 minutes of silence, never "Power off" when contact is simply lost.

### R8 App icon and identity
1. THE app SHALL have an adaptive launcher icon and a monochrome icon, made from vector drawables in the repository, with no third-party asset.
2. THE app name SHALL be "Outage".

### R9 Privacy in the shell
1. THE shell SHALL NOT show or log an install ID, a token, coordinates or a phone number.
2. THE shell SHALL NOT request any permission itself; permissions are asked by the feature that needs them (onboarding, alerts).

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web while writing this spec. Run Kiro's Analyze Requirements in the IDE on this file and record the result here.

| # | Gap | Fix |
|---|---|---|
| G1 | No spec owned the first screen, navigation, settings, theme or icon; each feature spec had its own screens with nothing joining them. | This spec. Feature specs fill feature slots (design section 4). |
| G2 | Features are built in a different order from the screens, so the app would crash on missing destinations. | R3.2 "Coming soon" screens. |
| G3 | Delete-my-data spans every feature and the server; no single owner of the button. | R5, with a delete registry (design section 6). |
| G4 | Home must work offline (single-player value). | R2.3. |
| G5 | Status shown by colour only fails colour-blind users and bright sunlight. | R6.2. |
| G6 | Notification taps need a stable route into the app. | R1.3, deep-link routes in design section 5. |
| G7 | No navigation library is approved. | Design section 3: a small in-app router on Compose state. |

## Decisions (2026-11-14)

- Jetpack Compose with Material 3, approved by the human. No navigation library: the shell routes with a small state holder (design section 3).
- The Area destination shows the followed area's status from the Worker's public JSON (`web-and-area-pages` routes), not a map, until the map exists.
- Pidgin is optional and falls back to English per key.
