---
inclusion: always
---

# Tech stack (zero budget, free tiers only)

Decided in `docs/adr/0012-native-kotlin-android-app.md`.

- **Android app:** native Kotlin, one Gradle project in `apps/android` (Android Gradle plugin 9.2.1 with built-in Kotlin, Gradle 9.4.1, JDK 17). `minSdk` 26, `compileSdk` and `targetSdk` 36. UI in Jetpack Compose when the real app starts; the probe uses plain Views. Builds run on GitHub Actions and the APK is attached to a GitHub Release.
- **Backend:** Cloudflare Worker plus Durable Objects (one per active area). The same Worker serves the read-only web page.
- **Push:** Firebase Cloud Messaging, sent from the Worker over HTTP v1.
- **Geo:** H3, resolution 8. The phone computes its own cell (Kotlin, `com.uber:h3`, needs approval); the Worker and tools use `h3-js`.
- **Tests:** Kotlin unit tests with JUnit 4 on the JVM. TypeScript tests with Vitest plus fast-check. Property tests are mandatory for detection.
- **Lint:** Android Lint for Kotlin, Biome for TypeScript and `.mjs`.
- **Language:** Kotlin on the phone. TypeScript (strict) on the Worker, engine and tools. Dependency-free Node ESM for hook and skill scripts.
- **One detection engine:** `packages/detection`, TypeScript, runs only in the Worker and in `tools/sim`. The phone never runs it. Demo mode plays a replay file.

## Rules
- Never guess a platform API from memory. Confirm with a docs server (see `docs-servers.md`): Cloudflare docs, Context7 for Android, Kotlin, Compose, Gradle, Firebase, fast-check, Vitest and H3. Put the doc URL in a code comment for any non-obvious platform API.
- Ask the human before adding any dependency or external service. Confirm a free tier first. The toolchain approved by ADR 0012 is Kotlin, Gradle, the Android Gradle plugin, AndroidX core libraries and JUnit 4. Compose, `com.uber:h3`, Firebase Messaging and any Kotlin linter are not yet approved.
- Secrets live in Wrangler secrets and GitHub Actions secrets. Never commit them.
- Batch events and use Durable Objects only for active cells, to stay inside Cloudflare free limits.
- Prefer the simplest design that meets the spec.
