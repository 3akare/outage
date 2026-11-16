# Requirements: alerts-and-light-alarm

Status: APPROVED by delegation on 2026-11-14 (human: "make the right decisions"). Design in `design.md`, tasks in `tasks.md`. One item needs the human before deploy: a Firebase project and service-account key for Android push (see Decisions).

## Introduction

This spec covers everything that talks to the user when power changes: the quiet "Power just went?" prompt, the Light Alarm that rings when power returns at the user's own spot, and server pushes about confirmed outages and restores in followed areas.

The Light Alarm works with no network and with the app closed. Pushes need the network.

## Glossary

- **Prompt**: the quiet notification shown at an `UNPLUG`, with two actions.
- **Wake request**: the stored result of "Yes, wake me when it's back".
- **Light Alarm**: the alarm that rings when a `REPLUG` follows a wake request.
- **Label**: the stored answer, "YES" or "NO", for one unplug. It is ground truth for the detection engine and the field report.
- **Follower**: an install that follows an area cell to receive pushes.
- **Subscription**: one follower's FCM registration token, followed cell, push kinds and quiet window.
- **Quiet hours**: a daily window in which pushes arrive without sound.
- **Alarm layer**: Kotlin code in the `sensor`, `alarm` and `log` packages of `android/outage`. It runs with the app screens closed.

## Requirements

### R1 Prompt at unplug
**User story:** As a user, I want a quiet question when my charger stops, so that I can say whether power went.
1. WHEN the Sensor emits `UNPLUG`, THE alarm layer SHALL show one prompt, with the actions "Yes, wake me when it's back" and "No, I unplugged it".
2. THE prompt SHALL use a channel with no sound, no vibration and importance no higher than default.
3. THE prompt SHALL be shown by the alarm layer with no app screen open.
4. WHEN the same `UNPLUG` event is delivered twice, THE alarm layer SHALL show one prompt.
5. THE prompt SHALL disappear when the user answers, when a `REPLUG` arrives, or after the prompt timeout.
6. THE prompt SHALL NOT be shown for `BATTERY_FULL` or `DISARMED` events.
7. WHERE notification permission is denied, THE prompt SHALL NOT be shown, and THE app SHALL offer the same two actions in its own screen while the unplug is unanswered.

### R2 Answers and labels
1. WHEN the user taps "Yes, wake me when it's back", THE alarm layer SHALL store a wake request for that unplug and a label `YES`.
2. WHEN the user taps "No, I unplugged it", THE alarm layer SHALL store a label `NO` and SHALL NOT store a wake request.
3. THE first answer for an unplug SHALL win. Later answers for the same unplug SHALL be ignored.
4. AFTER the `REPLUG` for that unplug, THE alarm layer SHALL ignore answers.
5. THE label SHALL be queued to the Outbox as a `LABEL` event naming the unplug sequence number and the answer, and SHALL be uploaded by the normal uploader.
6. THE answer SHALL work offline and SHALL survive the app being closed.

### R3 Light Alarm
**User story:** As a sleeper, I want my phone to wake me when power returns, even at 3 a.m. with no signal.
1. WHEN a `REPLUG` follows an unexpired wake request, THE alarm layer SHALL ring the Light Alarm.
2. THE Light Alarm SHALL ring at most once per wake request.
3. THE Light Alarm SHALL NOT use the network, and SHALL NOT depend on the server or any other data.
4. THE Light Alarm SHALL use the alarm audio stream and an alarm-category notification, so the system's alarm volume and Do Not Disturb alarm exception apply.
5. THE Light Alarm SHALL ring even if notification permission is denied, by playing alarm audio directly.
6. THE Light Alarm SHALL ring until the user stops it or until the maximum ring time ends.
7. THE Light Alarm SHALL ignore the user's quiet hours.
8. THE Light Alarm SHALL be the only part of the app that rings during quiet hours.
9. WHERE the system allows a full-screen intent for the app, THE Light Alarm SHALL also show a full-screen view on the lock screen. Otherwise it SHALL use a high-priority heads-up notification.
10. THE alarm layer SHALL record the time from the `REPLUG` event to the start of the ring, in the telemetry.

### R4 Expiry and safety
1. THE wake request SHALL expire after 24 hours and SHALL NOT ring after it expires.
2. THE wake request SHALL be dropped on reboot, because its time cannot be trusted. The app SHALL tell the user, in plain words, that a phone that switches off cannot ring.
3. WHEN delete-my-data is requested, THE alarm layer SHALL remove all wake requests and labels not yet uploaded.
4. THE alarm layer SHALL stop an alarm already ringing when the user stops it, and SHALL NOT restart it.

### R5 Testing the alarm
1. THE app SHALL offer "Test Light Alarm", which rings the same alarm after 5 seconds with the words "Test" visible.
2. THE test SHALL NOT create an event, label, or any server data.
3. THE app SHALL show whether the alarm can ring in the current state: notification permission, alarm volume above zero, full-screen intent allowed, battery exemption set.

### R6 Follow areas and pushes
**User story:** As a user, I want to be told when power goes or comes back in my area.
1. THE app SHALL let the user follow any cell for which a public status exists, and unfollow it.
2. WHEN the user follows a cell, THE app SHALL send the FCM registration token, the cell, the push kinds and the quiet window to the Worker with the install token.
3. THE system SHALL send a push for a `CONFIRMED` decision and for a `RESTORED` decision, and for no other decision.
4. THE system SHALL send each push at most once per follower per cell episode and kind (supports area-cells A9).
5. THE system SHALL send pushes only for scopes that have a public status.
6. THE push text SHALL be short, in plain words, and SHALL NOT contain install IDs or any number below 3.
7. THE push SHALL carry the cell and episode in its data for opening the area page.
8. THE push SHALL be marked high priority for `CONFIRMED` and for `RESTORED`.
9. WHEN the decision's event time is more than 10 minutes old, THE system SHALL NOT send the push (the engine rule, kept as a second check).

### R7 Quiet hours
1. THE user SHALL be able to set quiet hours as a start time and an end time. A window may cross midnight.
2. WHEN a push arrives for a subscription inside its quiet window, THE system SHALL send it to the silent channel.
3. THE subscription SHALL hold the window as minutes of the day and a UTC offset.
4. THE system SHALL NOT use the quiet window for anything other than choosing the channel.
5. THE Light Alarm SHALL NOT read the quiet window (R3.7).

### R8 Delivery handling
1. THE system SHALL send one FCM HTTP v1 message per request, SHALL keep its send rate within the FCM quota, and SHALL back off when FCM answers `QUOTA_EXCEEDED`.
2. WHEN FCM answers a send with `UNREGISTERED`, THE system SHALL remove that subscription.
3. WHEN FCM is unavailable (`UNAVAILABLE`, `INTERNAL` or a failed request), THE system SHALL retry with back-off and SHALL NOT resend messages already accepted.
4. THE system SHALL NOT log push tokens.
5. THE system SHALL keep at most one subscription per install and cell.

### R9 Channels
1. THE app SHALL create the notification channels before registering for pushes: `power-check` (quiet prompt), `light-alarm` (alarm sound), `alerts` (push, sound) and `alerts-quiet` (push, silent).
2. THE push messages SHALL name an existing channel.
3. THE `light-alarm` channel SHALL use the alarm audio usage and the highest importance.

### R10 Privacy and data
1. THE Worker SHALL store a subscription as: install ID, cell, FCM registration token, kinds, quiet window, creation time.
2. WHEN delete-my-data is requested, THE Worker SHALL remove every subscription and label for that install.
3. THE subscription store SHALL be written only on follow, unfollow, token refresh, dead-token cleanup and deletion.
4. THE system SHALL NOT store a location other than the followed cell.
5. THE alert text SHALL follow `copy.md`, with an optional Pidgin pack.

### R11 Budget
1. THE push sender SHALL call the FCM HTTP v1 API directly with `fetch` and SHALL NOT add a server SDK dependency.
2. THE sender SHALL keep subrequests per invocation under the free-plan limit of 50 by splitting work across alarm invocations.
3. THE sender SHALL use no paid service. THE human SHALL create the Firebase project and service-account key and store the key as the Wrangler secret `FCM_SERVICE_ACCOUNT` before deploy.

## Analysis of requirements (gaps found and how they were fixed)

Done by Kiro Web. Run Kiro's Analyze Requirements in IDE on this file and record the result here.

| # | Gap in the brief | Fix |
|---|---|---|
| G1 | Light Alarm needs to work with the app closed. | R1.3, R3.3, and design: the whole alarm path is native Kotlin. |
| G2 | Android 14 limits full-screen intents to calling and alarm apps, and exact alarms are denied by default. | R3.9 treats full-screen as optional. The alarm is event-driven, so no exact alarm is needed. |
| G3 | A heads-up notification is not a ring: the channel sound plays once. | R3.4 to R3.6 add looped alarm audio. |
| G4 | Alarm must ring when notification permission is denied. | R3.5, R1.7. |
| G5 | A stale wake request could ring days later. | R4.1, R4.2. |
| G6 | "No" answers and "Yes" answers were not tied to a specific unplug. | R2.1 to R2.5. |
| G7 | The ingest wire format has no label type. | Task 1 amends ingest and sensor types with `LABEL`. |
| G8 | Pushes need quiet hours, but the server only sees a channel choice. | R7: window stored in the subscription, used only for the channel. |
| G9 | A push to a missing Android channel is not displayed. | R9.1, R9.2. |
| G10 | Android push needs a Firebase project and a service-account key. | R11.3, ADR 0008, human action. |
| G11 | A prompt on every human unplug may annoy. | R1.2, R1.5 (silent, auto-dismiss). More tuning needs field data. |
| G12 | Push de-duplication per episode (area-cells R10). | R6.4. |
| G13 | Public-status rule applies to pushes too. | R6.5. |
| G14 | Dead tokens. FCM reports them in the send response. | R8.2. |
| G15 | Delete-my-data across phone and server. | R4.3, R10.2. |

## Decisions (2026-11-14)

| Item | Value | Note |
|---|---|---|
| Prompt timeout | 10 minutes | Tunable. |
| Wake request expiry | 24 hours | Tunable. Covers overnight outages. |
| Maximum ring time | 120 seconds | Tunable. Then the notification stays until dismissed. |
| Test alarm delay | 5 seconds | |
| Retry back-off start | 1 minute | FCM documents a 1 minute minimum initial delay for `QUOTA_EXCEEDED`: https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode |
| Push kinds | `CONFIRMED`, `RESTORED` | |
| Alarm audio source | The system's default alarm ringtone, with a bundled short sound as fallback | No download. |

- The Light Alarm path is native only (ADR 0008).
- Quiet-hours windows are stored on the server in the subscription (a change to stored data; flagged in ADR 0008 for the human).
- Manual "power is out / power is back" reports are not part of this spec; `power-log` will define them.
- No auto-arming of the alarm. A wake request needs the user's explicit "Yes".
- **Human actions before deploy:** (1) create a Firebase project and a service-account key (a free account, but an external service, so it needs your approval); (2) store the key with `wrangler secret put FCM_SERVICE_ACCOUNT`; (3) approve the Firebase Messaging dependency in the app (needs human approval, ADR 0012).
