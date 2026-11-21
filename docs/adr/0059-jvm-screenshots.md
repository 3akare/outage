# ADR 0059: Screenshots of the app on the JVM with Robolectric

Status: ACCEPTED (2026-11-21, owner blanket permission to add Robolectric, Roborazzi and kotlinx-coroutines-test).

## Context
The sandbox has no emulator and no KVM, so nobody could see the new spot picker, Now and History screens without a phone. The owner allowed Robolectric, Roborazzi and kotlinx-coroutines-test for this.

## Decision
- Add `org.robolectric:robolectric:4.18.1` and the Compose test libraries from the existing BOM (`ui-test-junit4` for tests, `ui-test-manifest` for debug builds). Unit tests include Android resources, so the Lagos places files are in the test assets.
- `app/src/test/kotlin/app/outage/ui/ScreenshotTest.kt` draws each screen with Robolectric native graphics and saves a PNG in `docs/visual`, next to the website screenshots: `android-now.png`, `android-now-empty.png`, `android-spot-picker-lga.png`, `android-spot-picker-ward.png`, `android-spot-picker-no-match.png`, `android-history.png`, `android-history-empty.png`. Running `:app:testDebugUnitTest` rewrites them.
- The picture is taken by drawing the activity's root view to a bitmap. `captureToImage` waits for a window redraw that Robolectric never does, so it timed out.
- Roborazzi and kotlinx-coroutines-test are not added. Plain Robolectric already writes the files, and no test needed a test dispatcher. Fewer libraries, less to update.
- The Map tab has no screenshot. It draws with MapLibre native code (`libmaplibre.so`), which does not load on the JVM. Its words (loading and empty states) were checked by reading the strings.

## Alternatives
1. **Roborazzi.** Compares images with stored copies and fails on change. Rejected for now: the screens still change often, and the files are for people to look at, not a gate.
2. **Paparazzi.** Draws without Robolectric, but uses its own layout engine and plugin. Rejected: a new Gradle plugin for the same result.
3. **No screenshots.** Rejected: the owner wants to see the screens.

## Consequences
The unit test run takes about 20 seconds longer and writes seven PNG files. Screenshots use the machine clock, so dates on History change on each run. The Map tab still needs a real phone to see.
