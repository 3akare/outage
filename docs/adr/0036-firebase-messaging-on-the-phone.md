# ADR 0036: Firebase Messaging on the phone, optional at build time

Status: ACCEPTED (2026-11-23), under the blanket approval (confirm a free tier, record an ADR, add the dependency). Spec: `alerts-and-light-alarm` task 8. Builds on ADR 0008 and 0035.

## Context
The Worker sends follow pushes through FCM HTTP v1 (ADR 0035). The phone needs the Firebase Messaging client to get a registration token and to receive messages. FCM has no cost on the Firebase Spark plan, and no limit on message count that applies to this app (https://firebase.google.com/pricing lists Cloud Messaging as no-cost). Only the human can download the Firebase config file for package `app.outage`, so the build must work without it.

## Decision
1. Add `com.google.firebase:firebase-bom:35.2.0` and `com.google.firebase:firebase-messaging` (newest in the Google Maven index on 2026-11-23). No Analytics, no other Firebase product. Add the Gradle plugin `com.google.gms.google-services` 4.6.0.
2. The plugin is declared in the root build with `apply false` and applied in the app module only when `apps/android/app/google-services.json` exists. CI writes the file from the secret `FIREBASE_CONFIG_B64` when the secret is set. `docs/deploy.md` has the exact steps.
3. At run time `PushConfig.isAvailable` checks that a default `FirebaseApp` exists (`FirebaseApp.getApps`). When it does not, push registration is off: no token is requested, following shows a plain "Push is not set up on this build" line, and nothing crashes. Light Alarm never touches Firebase.
4. The token is requested only after the user follows an area, and is sent only with the follow request (R6.2). `OutageMessagingService.onNewToken` stores the new token and re-sends it for each followed cell. The token is never logged.
5. The app shows the push itself only when the message arrives while the app is open; the Worker sends `notification` messages naming the `alerts` or `alerts-quiet` channel, so the system displays them (R9.2).
6. The follow state (cells, kinds, quiet window) lives in `SharedPreferences` on the phone and is removed by delete-my-data. The server copy is removed through `POST /v1/delete` (ADR 0035).

## Alternatives
1. Always apply the plugin and commit a placeholder config. Rejected: a fake project id in git, and push would silently fail.
2. Initialise Firebase by hand from build config fields. Kept as the fallback if the plugin gives trouble; it needs the same console values and adds code.
3. Own WebSocket or polling for alerts. Rejected: drains battery and cannot wake a sleeping phone.

## Consequences
- The APK grows by the Firebase and Play services client libraries.
- Debug builds without the file cannot receive pushes. The field build must have the secret set.
- Firebase Installations sends the install identifier and device info to Google once registered; this happens only after the user follows an area. The follow screen says so in one line.
