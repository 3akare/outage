# tools/probe (throwaway)

Feasibility probe for Milestone 1. Spec: `.kiro/specs/feasibility-probe/`. Delete or archive after the gate decision (task 10).

| Folder | What | Check |
|---|---|---|
| `android` | Native Kotlin probe app (Gradle, AGP 9.2.1, plain Views, platform classes only). The sensor, reference logger and debug screen arrive in tasks 5 to 7. | `.kiro/scripts/android-sandbox.sh gradle tools/probe/android :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` |
| `worker` | Wrangler Worker with one SQLite-backed Durable Object `ProbeStore`. Endpoints arrive in task 4. | `npm --prefix tools/probe/worker run typecheck` |
| `analyze` | Pure analysis functions (Vitest). Task 3. | `npm --prefix tools/probe/analyze test` |

From the repo root: `npm run probe:install`, `npm run probe:typecheck`, `npm run probe:test`, `npm run probe:android`. These are separate from `npm test`, which needs no install.

Notes
- The Android build runs in this sandbox once the SDK is installed (`.kiro/scripts/android-sandbox.sh setup`, about 400 MB, kept outside the repository). GitHub Actions (`.github/workflows/android.yml`) runs the same tasks on every push and publishes the debug APK to a GitHub Release when you push a tag `probe-vX.Y.Z`.
- The probe APK is debug-signed. It is a measuring tool, not the product.
- The Worker secret `PROBE_TOKEN` is set by the human with `wrangler secret put PROBE_TOKEN`. It is never written to a file.
- Lint: Biome from the repo root (`npm run lint`) for TypeScript and `.mjs`. Android Lint (`:app:lintDebug`) for Kotlin.
