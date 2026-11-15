# ADR 0028: One design token file shared by Compose and CSS

Status: ACCEPTED (2026-11-22), under the blanket approval. Spec: `.kiro/specs/ux-redesign/`.

## Context
The app (Compose `Theme.kt`) and the web (CSS) must look like the same product. Without one source they drift. The map colours matter most because they carry the meaning.

## Decision
1. **Source of truth:** `packages/shared/design/tokens.json`.
2. **Generated outputs:** `workers/api/src/web/static/tokens.css` (CSS variables) and `apps/android/.../ui/Tokens.kt` (Kotlin constants), written by `tools/tokens/build.mjs` (dependency-free Node ESM). A node:test check regenerates in memory and compares, so a hand edit fails the build (UX3).
3. **State colours (dark surface), each with a pattern so colour is never the only signal:**

   | State | Colour | Pattern |
   |---|---|---|
   | Normal | `#3DDC97` | solid |
   | Possible | `#FFC857` | hatch |
   | Confirmed | `#FF5A5F` | dots |
   | Restored | `#5AB0FF` | outline fill |
   | No data | `#2B3340` stroke on the surface | empty outline |

   Surface `#0F141B`, raised surface `#171E27`, text `#EEF2F6`, muted text `#9AA7B5`, accent (user's cell outline) `#FFFFFF`. A light set exists for the web and follows the system setting. Final values are checked for 4.5:1 text contrast and a colour-blind simulation in task 2; the table can change by edit to `tokens.json` with a note in this ADR.
4. **Type scale:** 12, 14, 16, 20, 28, 40 px (sp in the app). System font stack on the web, the Material default on Android. No font download.
5. **Spacing:** 4, 8, 12, 16, 24, 32. Radii 8 and 16. Tap targets at least 48 dp (44 px on the web).
6. **Hex map style:** 1 px stroke in the surface colour, fill by state, user's cell has a 3 px accent outline, labels from the catalog only, no street layer, no markers.
7. **Dark by default** (the app already is dark; power cuts happen at night).

## Alternatives
1. **Style Dictionary or another token tool.** Standard. Rejected: a dependency for about 40 values.
2. **Hand-keep both files in sync.** Simplest. Rejected: this is how the current mismatch happened.
3. **Material Theme Builder output only.** Fine for Android. Rejected: gives no web output.
4. **Draw the web in a canvas using Compose Multiplatform.** One codebase. Rejected: large payload, new toolchain.

## Consequences
- A colour change is one edit and one command (`node tools/tokens/build.mjs`).
- The generated files are committed so the Worker and Gradle builds need no extra step.
- Unit check UX3 runs in `npm test`.
