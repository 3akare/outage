# ADR 0008: Light Alarm is native and event-driven; pushes use FCM directly

Status: ACCEPTED 2026-11-15, under the human's blanket approval (push data, quiet window). Only the human can create the Firebase project and its service-account key; the code is written so it runs without them.

Amended by ADR 0012 (2026-11-14): push is FCM direct; the app is native Kotlin.

## Context
The Light Alarm must ring when power returns, at 3 a.m., with no network and no app open. Pushes about confirmed outages and restores must reach followers. Platform limits found in the docs: Android 14 restricts full-screen intents to calling and alarm apps, exact alarms are denied by default, a channel sound plays once and does not loop, and push on Android is delivered by Firebase Cloud Messaging (FCM), which needs a Firebase project and a service-account key.

## Decisions
1. **The alarm path is entirely native Kotlin.** It runs inside the sensor service that observes the `REPLUG`. It needs no network or server.
2. **The alarm is event-driven, not scheduled.** It starts when the `REPLUG` happens, so no exact-alarm permission is needed.
3. **Layers.** Alarm audio played directly with the alarm usage (works without notification permission); an alarm-category notification; an optional full-screen intent when the system allows it.
4. **A "Yes" is required.** No auto-arming.
5. **Wake requests expire after 24 h and on reboot.**
6. **Quiet hours are stored in the push subscription** and used only to choose a silent or sound channel for pushes. The Light Alarm ignores them.
7. **Pushes go through FCM HTTP v1, called directly from the Worker with `fetch`.** No server SDK. The Worker signs its OAuth token request with Web Crypto and the service-account key held in the Wrangler secret `FCM_SERVICE_ACCOUNT`. The app registers an FCM registration token. FCM sends one message per request and answers with the result, so there is no receipt step (https://firebase.google.com/docs/cloud-messaging/send/v1-api).
8. **Push only for scopes with a public status** (ADR 0007).

## Alternatives
1. **Schedule the alarm with `AlarmManager` exact alarms.** The restore time is unknown in advance, so there is nothing to schedule.
2. **Alarm driven by a push or by a background task outside the sensor service.** Depends on the network or on a process that OEMs kill. Unreliable.
3. **Looping through notification flags only.** Behavior varies by OEM and notification permission. Kept as a layer, not as the only layer.
4. **Send quiet-hour handling to the device through data-only pushes.** Needs the app to run in the background to decide. Rejected for reliability.
5. **Expo push.** Rejected: on Android it is FCM underneath and needs Expo's service and an Expo account. Direct FCM removes both (ADR 0012). It costs our own token handling and a server key flow.
6. **Auto-arm the alarm during confirmed outages.** Convenient, but couples the alarm to the server and to the engine's decision timing. Possible later; not in this spec.

## Consequences
- **Human action:** create a Firebase project (free) and a service-account key, and store the key as a Wrangler secret (`wrangler secret put FCM_SERVICE_ACCOUNT`). This is an external service, so it needs your approval. The Firebase Messaging dependency in the app also needs human approval (ADR 0012). Without these, Android pushes do not work, but the Light Alarm does.
- **Send cost:** FCM HTTP v1 takes one message per request, so with the free plan's 50 subrequests per invocation the Worker sends about 45 messages per invocation and defers the rest to an alarm. This is a large drop from the thousands per invocation that batched sending allowed. Open option for the human, not decided: FCM topic messages (one request reaches every device subscribed to a cell's topic). It removes the limit but moves quiet hours onto the phone and exposes the followed cell name to Google. Decide before a wider launch; the field test with a handful of phones is unaffected.
- **Data stored on the server** (a change from before): per subscription, the FCM registration token, followed cell, push kinds, quiet window and UTC offset, keyed by install ID. Delete-my-data removes them. The human should confirm this storage.
- A phone that switches off cannot ring. The app says so.
- The alarm depends on the sensor service being alive at the `REPLUG`; OEM killers are the main risk and are covered by the device checklist.
- Prompt fatigue is possible: every human unplug prompts. Field telemetry will count prompts per day.
