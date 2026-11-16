---
inclusion: always
---

# Tech stack (zero budget, free tiers only)

Decided in `docs/adr/0012-native-kotlin-android-app.md`.

- **Android app:** native Kotlin, one Gradle project in `android/outage` (Android Gradle plugin 9.2.1 with built-in Kotlin, Gradle 9.4.1, JDK 17). `minSdk` 26, `compileSdk` and `targetSdk` 36. UI in Jetpack Compose when the real app starts; the probe uses plain Views. Builds run on GitHub Actions and the APK is attached to a GitHub Release.
- **Backend:** Cloudflare Worker plus Durable Objects (one per active area). The same Worker serves the read-only web page.
- **Push:** Firebase Cloud Messaging, sent from the Worker over HTTP v1.
- **Geo:** H3, resolution 8. The phone computes its own cell (Kotlin, `com.uber:h3`, needs approval); the Worker and tools use `h3-js`.
- **Design:** one dark palette from `core/shared/design/tokens.json` (`node tools/tokens/build.mjs`); icons and the mark from `tools/icon/build.mjs`; the map is a rotating globe drawn on a canvas from `core/shared/geo` on both platforms (ADR 0051). No map library, tile server or web component library. Do not reinstall the Material 3 skill.
- **Tests:** Kotlin unit tests with JUnit 4 on the JVM. TypeScript tests with Vitest plus fast-check. Property tests are mandatory for detection.
- **Lint:** Android Lint for Kotlin, Biome for TypeScript and `.mjs`.
- **Language:** Kotlin on the phone. TypeScript (strict) on the Worker, engine and tools. Dependency-free Node ESM for hook and skill scripts.
- **One detection engine:** `core/detection`, TypeScript, runs only in the Worker and in `tools/sim`. The phone never runs it. Demo mode plays a replay file.

## Rules
- Never guess a platform API from memory. Confirm with a docs server (`docs-servers.md`): Cloudflare docs; Context7 for Android, Kotlin, Compose, Gradle, Firebase, fast-check, Vitest, H3. Cite the doc URL in a comment for non-obvious platform APIs.
- Blanket approval 2026-11-15: confirm a free tier, record an ADR, then add any dependency or service. The toolchain approved by ADR 0012 is Kotlin, Gradle, the Android Gradle plugin, AndroidX core libraries and JUnit 4. Compose with Material 3 is approved (2026-11-14; artifacts in `.kiro/approved-dependencies.json`). `com.uber:h3`, Firebase Messaging, navigation and a Kotlin linter are approved once an ADR exists.
- Secrets live in Wrangler and GitHub Actions secrets, never in git.
- Batch events; use Durable Objects only for active cells (Cloudflare free limits).
- Prefer the simplest design that meets the spec.
