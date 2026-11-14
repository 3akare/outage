# ADR 0008: Light Alarm is native and event-driven; pushes use Expo with Firebase

Status: ACCEPTED (2026-11-14) by delegation. Needs the human for two items: the Firebase project and the stored quiet window.

## Context
The Light Alarm must ring when power returns, at 3 a.m., with no network and no app open. Pushes about confirmed outages and restores must reach followers. Platform limits found in the docs: Android 14 restricts full-screen intents to calling and alarm apps, exact alarms are denied by default, a channel sound plays once and does not loop, and Expo push on Android needs Firebase Cloud Messaging (FCM v1) credentials.

## Decisions
1. **The alarm path is entirely native Kotlin.** It runs inside the sensor service that observes the `REPLUG`. It needs no JavaScript, network, or server.
2. **The alarm is event-driven, not scheduled.** It starts when the `REPLUG` happens, so no exact-alarm permission is needed.
3. **Layers.** Alarm audio played directly with the alarm usage (works without notification permission); an alarm-category notification; an optional full-screen intent when the system allows it.
4. **A "Yes" is required.** No auto-arming.
5. **Wake requests expire after 24 h and on reboot.**
6. **Quiet hours are stored in the push subscription** and used only to choose a silent or sound channel for pushes. The Light Alarm ignores them.
7. **Pushes go through the Expo push HTTP API with `fetch`.** No server SDK.
8. **Push only for scopes with a public status** (ADR 0007).

## Alternatives
1. **Schedule the alarm with `AlarmManager` exact alarms.** The restore time is unknown in advance, so there is nothing to schedule.
2. **JS-based alarm through `expo-notifications` background tasks.** Depends on the JS runtime being alive. Unreliable when OEMs kill the app.
3. **Looping through notification flags only.** Behavior varies by OEM and notification permission. Kept as a layer, not as the only layer.
4. **Send quiet-hour handling to the device through data-only pushes.** Needs the app to run in the background to decide. Rejected for reliability.
5. **Direct FCM instead of Expo push.** Removes one hop but needs our own token handling and a server key flow. The brief names Expo push.
6. **Auto-arm the alarm during confirmed outages.** Convenient, but couples the alarm to the server and to the engine's decision timing. Possible later; not in this spec.

## Consequences
- **Human action:** create a Firebase project (free) and upload an FCM v1 service account key to EAS. This is an external service, so it needs your approval. Without it, Android pushes do not work, but the Light Alarm does.
- **Data stored on the server** (a change from before): per subscription, the Expo push token, followed cell, push kinds, quiet window and UTC offset, keyed by install ID. Delete-my-data removes them. The human should confirm this storage.
- A phone that switches off cannot ring. The app says so.
- The alarm depends on the sensor service being alive at the `REPLUG`; OEM killers are the main risk and are covered by the device checklist.
- Prompt fatigue is possible: every human unplug prompts. Field telemetry will count prompts per day.
