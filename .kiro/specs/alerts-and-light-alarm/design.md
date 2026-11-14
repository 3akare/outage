# Design: alerts-and-light-alarm

Status: APPROVED by delegation on 2026-11-14. Based on `requirements.md`. Tasks in `tasks.md`.

## 1. Overview

Three parts, kept apart so the alarm never depends on anything it does not need.

```mermaid
flowchart LR
    subgraph Phone alarm path Kotlin
      SM[SensorStateMachine] -->|UNPLUG| PN[PromptNotifier]
      SM -->|REPLUG| AP[AlarmPolicy]
      PN --> NA[NotificationActionReceiver]
      NA --> WS[WakeStore SQLite]
      NA --> OB[Outbox LABEL event]
      AP --> WS
      AP --> LA[LightAlarm: audio + notification + full-screen]
    end
    subgraph Phone UI Kotlin
      UI[Settings: follow, quiet hours, test alarm, status]
      UI --> API[Worker API with install token]
      FMS[FCM token and message receiver]
    end
    subgraph Worker
      API --> SUB[Subscriptions in area actor]
      AA[area actor pushes] --> PP[PushPlanner pure]
      SUB --> PP --> FC[FCM client]
      FC -->|HTTPS| FCM[FCM HTTP v1]
    end
    FCM --> FMS
```

- **Light Alarm** = `PromptNotifier`, `WakeStore`, `AlarmPolicy` and `LightAlarm`. All Kotlin, none uses the network.
- **Pushes** = Worker only for planning and sending. The phone only receives them.
- **UI** (Compose screens in the `ui` package) supplies settings and calls the Worker through the `net` package. It is not in the alarm path.

## 2. Verified platform facts

| Fact | Source |
|---|---|
| Apps targeting Android 14 may use full-screen intents only if they are calling or alarm apps. The store revokes the permission for others. `NotificationManager.canUseFullScreenIntent()` checks it, and `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` opens the settings page. | https://developer.android.com/about/versions/14/behavior-changes-14 |
| Mutable pending intents without an explicit component throw on Android 14 targets. Implicit intents reach only exported components. | same |
| `SCHEDULE_EXACT_ALARM` is denied by default for new apps that target Android 13+. `USE_EXACT_ALARM` is only for calendar and alarm-clock apps. The Light Alarm is triggered by an event, so it does not use exact alarms. | https://developer.android.com/about/versions/14/changes/schedule-exact-alarms |
| FCM HTTP v1 send is `POST https://fcm.googleapis.com/v1/projects/PROJECT_ID/messages:send` with an OAuth 2.0 access token in `Authorization: Bearer`. The body is `{ "message": { "token": ..., ... } }`. One request carries one message. Success returns the message `name`. | https://firebase.google.com/docs/cloud-messaging/send/v1-api |
| FCM error codes: `INVALID_ARGUMENT` (400, includes a bad token and a payload too big), `UNREGISTERED` (404, drop the token), `SENDER_ID_MISMATCH` (403), `QUOTA_EXCEEDED` (429, back off at least 1 minute first), `UNAVAILABLE` (503, honor `Retry-After`, exponential back-off), `INTERNAL` (500). Payload limit 4096 bytes for most messages. `ttl` is whole seconds from 0 to 2,419,200. | https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode |

To confirm with the docs servers before implementing: `NotificationChannel.setSound` with `AudioAttributes.USAGE_ALARM`, `Notification.CATEGORY_ALARM`, `FLAG_INSISTENT` behavior, `MediaPlayer` or `Ringtone` with alarm usage and looping, `RingtoneManager.TYPE_ALARM` default, `setBypassDnd` and policy access, `PowerManager` wake lock rules inside a running `JobService`, behavior of Doze when charging resumes, the OAuth scope and token request for a service-account key signed with Web Crypto, the Android message fields for channel (`android.notification.channel_id`), priority and `ttl` (https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages), the app-side token API and `onNewToken` (Firebase Messaging, needs human approval, ADR 0012), and the Cloudflare alarm API for deferred sending. These are unverified until checked.

## 3. Alarm layer

### 3.1 `AlarmPolicy` (pure Kotlin)

Inputs: events from the state machine (`Unplug(seq)`, `Replug(seq)`), user answers `Answer(unplugSeq, YES|NO)`, prompt timeouts, reboot, clock (elapsed). Outputs: actions `ShowPrompt(seq)`, `RemovePrompt(seq)`, `SaveWake(seq, expiresElapsed)`, `QueueLabel(seq, answer)`, `Ring(seq)`, `StopRing`.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Prompting: Unplug (ShowPrompt)
    Prompting --> Armed: Answer YES (SaveWake, QueueLabel YES)
    Prompting --> Idle: Answer NO (QueueLabel NO, RemovePrompt)
    Prompting --> Idle: Timeout (RemovePrompt)
    Prompting --> Idle: Replug (RemovePrompt)
    Armed --> Ringing: Replug and not expired (Ring)
    Armed --> Idle: Expired or reboot (drop wake)
    Ringing --> Idle: Stop or max ring time (StopRing)
```

Rules enforced here and nowhere else:
- First answer for an unplug wins. After `Replug` for that unplug, answers are ignored.
- `Ring` happens at most once per wake request.
- `Unplug` events with a seq already seen change nothing (idempotent).
- A new `Unplug` while `Armed` supersedes the old wake request only if the old one has not rung; the old label stays.
- Reboot clears `Armed` (time cannot be trusted).

### 3.2 Components

| Component | Responsibility |
|---|---|
| `PromptNotifier` | Builds the prompt on channel `power-check`, with two `PendingIntent`s to an explicit, non-exported `NotificationActionReceiver`, `FLAG_IMMUTABLE`, set to time out after the prompt timeout. |
| `NotificationActionReceiver` | Maps the tapped action to `AlarmPolicy.Answer`, applies actions. Works with no app screen open. |
| `WakeStore` | SQLite table in the app database: `unplug_seq`, `created_elapsed_ms`, `boot_count`, `expires_elapsed_ms`, `state` (`ARMED`, `FIRED`, `DROPPED`). |
| `LightAlarm` | Starts looped alarm audio and the alarm notification. Holds a partial wake lock for at most the maximum ring time. |
| `ChannelSetup` | Creates all notification channels, including the push channels, at app start and again before the alarm layer posts anything. |

### 3.3 Ring path (layers)

```mermaid
sequenceDiagram
    participant Job as ChargingJobService or StationService
    participant SM as SensorStateMachine
    participant AP as AlarmPolicy
    participant WS as WakeStore
    participant LA as LightAlarm
    participant OS as Android
    Job->>SM: JobStarted or PowerConnected
    SM-->>Job: REPLUG event (written to Outbox first)
    Job->>AP: Replug(seq)
    AP->>WS: load latest wake, check state and expiry
    alt wake ARMED and not expired
        AP->>WS: mark FIRED
        AP-->>LA: Ring
        LA->>OS: partial wake lock (max ring time)
        LA->>OS: play alarm audio, USAGE_ALARM, looping
        LA->>OS: post alarm notification, CATEGORY_ALARM, channel light-alarm
        opt full-screen allowed
            LA->>OS: fullScreenIntent
        end
        LA->>Job: telemetry replug_to_ring_ms
    else no wake
        AP-->>Job: nothing
    end
```

Layers, from most to least reliable:
1. **Alarm audio** played directly in the running service with the alarm audio usage. Works without notification permission. Follows the alarm volume and the Do Not Disturb alarm exception.
2. **Alarm notification** on `light-alarm` (highest importance, alarm category, lock-screen visible, "Stop" action). Shows the user what is ringing and offers Stop.
3. **Full-screen intent** only if `canUseFullScreenIntent()` is true.

Ring order is fixed: the `REPLUG` is written to the Outbox first (so the event is not lost), then the alarm starts. The alarm never waits for a network call or an upload.

The sound is the system default alarm ringtone. If it cannot be resolved, a short bundled sound is used.

### 3.4 Interaction with Station mode

The Station service's `PowerConnected` path calls the same `AlarmPolicy`. A station phone does not normally have a wake request, since nobody answers its prompt; the prompt on a station is not shown (Station mode shows no per-unplug prompts), so no alarm rings from a station. Home Watch handles stations.

## 4. Labels on the wire

New event type `LABEL` in the sensor Outbox and the ingest wire schema:

```ts
type LabelEvent = {
  installId: string; seq: number; type: 'LABEL';
  elapsedMs: number; cell: string; confidence: 'HIGH'; timeQuality: 'OK';
  refSeq: number;                 // the UNPLUG's seq
  answer: 'YES' | 'NO';
};
```

- Time: `elapsedMs` is the time since the answer, as for any event. The detection engine uses `refSeq`, not the label's time.
- Ingest treats `LABEL` as a detection-class event for upload priority (uploaded promptly) and routes it to the area actor, which passes it to the engines as `Label { installId, unplugSeq: refSeq, answer }`.
- Stored as a row (it must survive recompute). One row per answer; the engine takes the label with the lowest seq per unplug if duplicates exist (the phone sends one).
- Schema amendments are task 1: `sensor-android` EVENT table (`type` gains `LABEL`, columns `ref_seq`, `answer`), shared types, ingest strict schema allow-list, I8 test, golden fixtures.

## 5. Server: subscriptions and pushes

### 5.1 Data

Stored in the area actor that owns the followed cell's parent:

```mermaid
erDiagram
    SUBSCRIPTION {
        text install_id
        text cell
        text fcm_token
        text kinds "CONFIRMED,RESTORED"
        int quiet_start_min "0..1439, nullable"
        int quiet_end_min "0..1439, nullable"
        int tz_offset_min
        int created_ms
    }
    PUSH_SENT {
        text sub_key "install_id|cell"
        text episode_id
        text kind
        int sent_ms
        text message_name "FCM response name, nullable"
    }
```

- `SUBSCRIPTION` primary key is (`install_id`, `cell`). One row per install and cell (R8.5).
- `PUSH_SENT` is the de-duplication memory (R6.4). It is pruned after 7 days.
- Delete-my-data removes both tables' rows for the install, and removes labels.

### 5.2 `PushPlanner` (pure TypeScript, Worker only)

```ts
plan(decisions: AreaPush[], subs: Subscription[], nowMs: number, sent: SentMemory): PlannedMessage[]
```

For each `AreaPush { cell, episodeId, kind, level, decisionTimeMs, precision }`:
1. Drop it if `nowMs - decisionTimeMs > 10 min`.
2. Drop it if the cell's scope is not public.
3. Select subscriptions for the cell with the kind enabled and not already in `sent` for (sub, episode, kind).
4. Pick the channel: `alerts-quiet` if the subscriber's local time (`nowMs + tz_offset`) lies in the quiet window, else `alerts`.
5. Build title and body from the string pack (`copy.md`): no install IDs, no number under 3, "wide area" when precision is `COARSE`.
6. Set `data: { cell, episodeId, kind }`, high priority, and a `ttl` short enough that an old message is not delivered later (equal to the push-age rule, 600 seconds). Field names for channel, priority and ttl in the Android part of the FCM message are unverified (see section 2).

Quiet window test: with `local = (nowMs/60000 + tz_offset) mod 1440`; window `[s, e)` contains `local` if `s < e ? s <= local < e : local >= s || local < e`; `s == e` means no window.

### 5.3 Sending

```mermaid
sequenceDiagram
    participant AA as Area actor
    participant PP as PushPlanner
    participant FC as FCM client
    participant G as FCM HTTP v1
    AA->>PP: plan(pushes, subs, now, sent)
    PP-->>AA: messages
    AA->>FC: access token (cached, from FCM_SERVICE_ACCOUNT)
    loop each message, up to the invocation budget
        AA->>FC: send(message)
        FC->>G: POST /v1/projects/PROJECT_ID/messages:send
        G-->>FC: message name or error
        FC-->>AA: result
        AA->>AA: record PUSH_SENT if accepted; UNREGISTERED deletes the subscription
    end
    AA->>AA: set alarm for the unsent rest or for retries
```

- The request URL and headers are the FCM HTTP v1 API (https://firebase.google.com/docs/cloud-messaging/send/v1-api). The Worker builds the OAuth access token from the service-account key in the Wrangler secret `FCM_SERVICE_ACCOUNT`, signing with Web Crypto (ADR 0012). Confirm the token request and scope with the docs server before writing the client.
- FCM HTTP v1 takes one message per request, and there is no receipt step: the response of each send says if the token is dead.
- Free-plan limit: at most 50 subrequests per invocation. One invocation therefore sends at most about 45 messages (one subrequest for the access token, the rest for sends) and defers the rest to an alarm. A cell with more followers than that is beyond the field test; revisit before a wider launch.
- `QUOTA_EXCEEDED`, `UNAVAILABLE`, `INTERNAL` or a failed request: retry with back-off from the alarm, starting at 1 minute (https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode). Accepted messages are never resent because `PUSH_SENT` was written.
- The key is read only from the secret and is never logged.
- Tokens are never logged.

### 5.4 Follow API

- `POST /v1/follow` with `{ cell, fcmToken, kinds, quietStartMin, quietEndMin, tzOffsetMin }` and the install token. The Worker validates the cell, checks that a public status exists for it or that the cell is valid (following before coverage is allowed so the install button works; pushes still need a public status), then writes the subscription in the owning area actor.
- `POST /v1/unfollow` with `{ cell }`.
- `POST /v1/follow` is sent again with the new token when the app's token changes (R10.3, token refresh). The row for (`install_id`, `cell`) is replaced.
- Rate limit like ingest. Strict schema, no extra fields. A token that fails validation is rejected without storing.
- Both endpoints count toward the free request budget; follow changes are rare.

## 6. App screens and token registration (Kotlin, `ui` and `net` packages)

- Token registration creates the channels first, then asks for notification permission, then obtains the FCM registration token and sends it with the follow call. When the token changes, the app sends it again for each followed cell. The Firebase Messaging dependency needs human approval (ADR 0012); its token API is unverified until checked with the docs.
- Screens: Follow area, Quiet hours, "Test Light Alarm", "Alarm check" list (notification permission, alarm volume, full-screen allowed, battery exemption), and the in-app prompt for denied-notification users (R1.7).
- Strings live in the string pack; Pidgin is optional. A test checks that every key exists in each language that is present.
- No alarm logic in the screens. They only call the alarm layer.

## 7. Error handling

| Case | Behavior |
|---|---|
| Notification permission denied | Prompt hidden; app screen shows the two actions. Alarm audio still rings. |
| Alarm volume zero | Alarm check list says so. The alarm rings silently; the notification and vibration still appear. |
| Sound resolution fails | Fall back to the bundled sound; log a diagnostic. |
| Service killed while ringing | The ring stops. On next start the wake is `FIRED`, so it does not ring again. Accepted. |
| Reboot before power returns | Wake dropped (R4.2). The app explains. |
| Two unplugs in a row | New prompt replaces old; old wake dropped if not rung. |
| User taps an action after REPLUG | Ignored. |
| Duplicate `REPLUG` event | The second finds the wake `FIRED` and does nothing. |
| FCM returns `UNREGISTERED` | Remove subscription. |
| FCM rejects the access token (401 or 403) or returns `SENDER_ID_MISMATCH` | Stop sending, raise a counter, keep subscriptions. Needs the human (Firebase credentials). |
| Request over 4096 bytes | Cannot happen with the fixed message shape; test checks size. |
| Push for a cell with no public status | Skipped, counted. |
| Follow of an invalid cell | 400 with `BAD_CELL`. |
| Follower count over one invocation's budget | Remaining messages deferred to an alarm. |

## 8. Risks and device checks

| Risk | Check on a device | Fallback |
|---|---|---|
| Alarm audio blocked from a background service on some Android versions | Ring from a locked, idle phone after charger replug, on Android 12, 13, 14 and 15 | Start the ring from a high-priority notification with insistent flags and the full-screen intent if allowed |
| Doze delays the job that detects the replug | Plugging in exits Doze; confirm by timing REPLUG to ring, 20 trials, screen off, 30 min idle | Station mode receiver driver |
| OEM kills the service during the outage | Tecno, Infinix, itel, Samsung, Xiaomi with and without exemption | OEM guide; Station mode |
| Full-screen intent not allowed (sideload on Android 14+) | `canUseFullScreenIntent()` result per device | Heads-up notification layer |
| Alarm stream muted | Alarm check list | Vibration and notification |
| Prompt fatigue from human unplugs | Count prompts per day in field telemetry | Raise prompt timeout or add a screen-state rule through a new ADR |

## 9. Testing strategy

Properties use IDs `L1` to `L12`. Kotlin tests: JUnit 4 JVM unit tests with seeded random loops (no new dependency). Server tests: Vitest and fast-check. Contract fixtures in `packages/shared/fixtures/` (the `LABEL` event and the follow request) are read by both the Kotlin and the TypeScript tests. Test names include the ID.

| ID | Property | Requirement | Test |
|---|---|---|---|
| L1 | Each distinct `UNPLUG` seq produces exactly one `ShowPrompt`; duplicates produce none; the prompt is removed by answer, `REPLUG` or timeout. | R1 | `L1_one_prompt_per_unplug` |
| L2 | `Ring` happens iff the latest unplug has an unexpired YES, a later `REPLUG` arrives, and the wake is not yet fired; never twice for one wake; never without YES. | R3.1, R3.2 | `L2_ring_iff_conditions` |
| L3 | The alarm path (`AlarmPolicy`, `WakeStore`, `LightAlarm`) has no dependency on network or upload classes (dependency check), and runs with all of them replaced by throwing fakes. | R3.3, R3.5 | `L3_alarm_has_no_network` |
| L4 | The first answer per unplug wins, later answers are ignored, answers after `REPLUG` are ignored, and exactly one `LABEL` is queued per unplug. | R2 | `L4_first_answer_wins` |
| L5 | For any quiet window (including across midnight and `s == e`) and any UTC offset, `quietContains` matches a reference implementation, and the Light Alarm path never reads it. | R7 | `L5_quiet_window` |
| L6 | The push list contains each (subscription, episode, kind) at most once, only for followers of the cell, only for `CONFIRMED` and `RESTORED`, with no install ID and no number under 3 in the text. | R6 | `L6_push_planning` |
| L7 | `UNREGISTERED` removes the subscription, and delete-my-data removes every subscription and label for the install. | R8.2, R10.2 | `L7_token_hygiene_and_delete` |
| L8 | For any follower count, sends are split into invocation-sized chunks, every eligible follower is covered exactly once, and retries after a failed request send none twice. | R8.1, R8.3 | `L8_batching_and_retry` |
| L9 | A wake request past its expiry or from an earlier boot never rings. | R4.1, R4.2 | `L9_expiry_and_reboot` |
| L10 | Replaying any sequence of state-machine events, answers and timeouts in a different interleaving that keeps per-unplug order gives the same ring decisions. | R1.4, R3 | `L10_replay_equivalence` |
| L11 | Channel definitions: `power-check` has no sound and importance at most default; `light-alarm` has alarm usage and highest importance; push channels named in messages exist in the setup list. | R1.2, R9 | `L11_channel_config` |
| L12 | Every string key exists in English and in each other language present; no message exceeds 4 KiB. | R6.6, R10.5 | `L12_string_pack` |

Other tests: a notification action test using Robolectric-free fakes through the `NotificationActionReceiver` logic; the follow and unfollow API with strict schema (I8 style); an FCM client test with an injectable `fetch` that replays response shapes from the FCM docs; an end-to-end Judge-style scenario in `tools/sim`: simulated outage, push planned for followers, push recorded as simulated and never sent.

Device checklist `docs/probe-checklist.md` adds: prompt appears quiet; Yes then replug rings with screen off and app closed, offline (airplane mode); No does not ring; ring survives lock; Stop works; test alarm; each OEM.

Traceability: `docs/traceability.md`.
