# ADR 0012: The Android app is native Kotlin; Expo, React Native and EAS are removed

Status: ACCEPTED (2026-11-14) by the human. The master brief named Expo, a Kotlin Expo Module, Expo push and EAS builds. The human approved replacing all of it ("the complete change of stack"). New dependencies below still need approval one by one (see Consequences).

## Context
- The product is Android only (ADR 0001, `product.md`). There is no iOS app and no plan for one; iPhone users get the web pages and Judge mode.
- The sensor, the Light Alarm and the reference logger were already native Kotlin. Expo added a JavaScript layer, a bridge, generated `android/` folders and a cloud build service with a free quota of about 15 Android builds a month.
- This sandbox has no Android SDK by default. With Expo, a compile error appeared only inside an EAS build.
- The only code shared between the phone and the server was TypeScript: the detection engine (used by Demo mode), the power-log maths and the H3 helper.

## Decisions
1. **One native Android project**, `apps/android`: Kotlin, Gradle with the Android Gradle plugin 9.2.1 (built-in Kotlin, no separate Kotlin plugin), Gradle 9.4.1, JDK 17. It replaces `apps/mobile` and `modules/outage-sensor`. The sensor, alarm, log, network and UI are packages of one `app` module until a split is needed.
2. **SDK levels:** `minSdk` 26, `compileSdk` and `targetSdk` 36 (Android 16, the level Google Play requires from 31 August 2026). Stop reasons need API 31; older phones run without them and log "unknown".
3. **UI:** Jetpack Compose with Material 3 for the real app. The throwaway probe uses plain Views and no extra libraries.
4. **Builds run on GitHub Actions**, which is free for a public repository. The workflow compiles, runs unit tests and Android lint, and attaches the APK to a GitHub Release. No Expo account, no EAS. Probe builds are debug-signed. A release keystore, when needed, is a GitHub secret the human sets; it is never in the repository.
5. **One detection engine.** It stays in `packages/detection` (TypeScript) and runs only in the Worker and in `tools/sim`. The phone does not run it. Demo mode and Judge mode play `replay.json`, which `tools/sim` produces with the real engine.
6. **Phone-side logic is Kotlin**: the power-log timeline and statistics, the install token handling, the Outbox, the H3 cell lookup. Each has JVM unit tests (JUnit 4, `./gradlew testDebugUnitTest`).
7. **Contract fixtures instead of shared code.** `packages/shared/fixtures/` holds JSON examples of every event and API shape. The Worker tests and the Kotlin tests both read them, so the two sides cannot drift apart silently.
8. **The OEM guide stays one file**, `packages/shared/src/oem-guide.json`. A Gradle task copies it into the app's assets at build time. There is no second copy in git.
9. **Push uses Firebase Cloud Messaging directly** (HTTP v1 from the Worker). Expo push is removed. The Worker holds the Firebase service-account key as a Wrangler secret and signs its token request with Web Crypto. The app registers an FCM token and stores nothing else about the server.
10. **Lint and format:** Biome for TypeScript and `.mjs` (ADR note in `docs/kiro-log.md`). Android Lint for Kotlin. No other Kotlin linter until the human approves one.
11. **The TypeScript parts stay:** Worker, Durable Objects, web pages, `packages/*`, `tools/sim`, `tools/probe/worker`, `tools/probe/analyze`, Vitest and fast-check.
12. **Repository layout:**

```
apps/android           Kotlin app (sensor, alarm, log, UI)
workers/api            Cloudflare Worker, Durable Objects, web pages
packages/detection     Pure TypeScript engine (Worker and simulator only)
packages/shared        Types, event schema, H3 helpers (server side), oem-guide.json, contract fixtures
tools/sim              Simulator and replay generator
tools/probe/android    Throwaway probe app (Kotlin, Views)
```

## Alternatives
1. **Keep Expo with the Kotlin module.** Rejected: more layers, a build quota, no compile feedback here, and its only benefit (shared TypeScript) is small.
2. **Kotlin Multiplatform.** Rejected: its point is iOS, which is out of scope.
3. **Port the engine to Kotlin and run it on the phone.** Rejected: two copies of the algorithm and its 12 properties. Demo mode does not need a live engine.
4. **Flutter.** Rejected: a new language and runtime for no gain over native on a single platform.
5. **Keep Expo push over FCM.** Rejected: Expo push on Android is FCM underneath and needs Expo's service; direct FCM removes the Expo account.
6. **Build locally only.** Rejected: nobody on the team has a computer at hand now, and a CI build is repeatable.

## Consequences
- **Spec edits.** Every spec that named Expo, React Native, EAS, the JS layer or `modules/outage-sensor` is updated in the same change (alerts, sensor-android, station-mode, onboarding, home-watch, power-log, demo-mode, field-telemetry, detection-engine, event-ingest, area-cells, feasibility-probe). ADR 0008 and ADR 0001 carry an "Amended by ADR 0012" line.
- **The feasibility gate ADR moves from 0012 to 0013.**
- **Approved by this ADR (toolchain only):** Kotlin, Gradle, the Android Gradle plugin, AndroidX core libraries, JUnit 4 for unit tests. Approved later by the human (2026-11-14): Jetpack Compose and Material 3. Everything else needs the human, one by one, before it is added: `com.uber:h3`, Firebase Messaging, kotlinx-serialization (or hand-written JSON), a Kotlin linter.
- **Human actions:** create a Firebase project and a service-account key for FCM (when alerts are built); create a release keystore (when a signed release is built); allow a GitHub Actions workflow to attach release files.
- **Lost:** React Native tooling and lint rules; the free EAS quota is no longer needed.
- **New risk:** more Kotlin written without a device or emulator. Mitigation: CI compiles on every push and I read the build log; the probe is the first real measurement on a phone.
- The phone cannot run the detection engine offline. Nothing in the specs needs that.
