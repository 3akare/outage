# ADR 0046: Judge mode in the Android app

Status: ACCEPTED 2026-11-23, under the human's blanket approval (decide, record, proceed). No new stored data, no new dependency.

## Context
`demo-mode` tasks 4 to 6 put Judge mode in the app. The ux-redesign (ADRs 0026 to 0030) has one first-run screen, a dock with Home, Insights and Settings, and the web simulation at `/app/simulate`. Three choices were not fixed by the spec: where Judge mode sits in that shell, how it plays the replay, and what "the real Light Alarm sound path" is while that path is being built on another branch.

## Decision
1. **One shell route.** Judge mode is the feature `judge` (`Route.Feature("judge")`). Its pages (Judge home, Recorded outage, Unplug your phone, How it works) are switched inside it by `JudgeFlow`, so leaving the route drops the whole session (R1.4, R5.4). It opens from the first-run screen ("Try Judge mode", with no consent, permission or network, R1.2) and from a Settings row. While it is open on top of first run, the dock stays hidden.
2. **Replay playback** squeezes gaps with the web player's rule (ADR 0029), so the app and `/app/simulate` feel the same. The app ships the same `replay.json` the Worker imports, copied by a Gradle task at build time (DM7).
3. **Every object in the file is labelled.** The loader refuses the file when any part lacks `simulated: true`. The replay builder in `tools/sim` now also labels each frame's events, so DM1 holds for events too.
4. **Unplug your phone** uses `PlugObserver` only while that page is visible. A real unplug starts the unplug track; "Simulate unplug" and "Simulate plug back in" do the same and are labelled. The demo prompt "Power just went?" opens after the unplug. `DemoFlag` hides the real prompt while Judge mode is open.
5. **Demo alarm stand-in.** Until the Light Alarm sound path from `alerts-and-light-alarm` task 4 is merged, the demo alarm plays the phone's default alarm sound for 5 seconds (`RingtoneManager.TYPE_ALARM`) and shows "Demo: power is back (simulated)" on screen. No notification channel and no stored state. Swap to the Light Alarm path when it lands.

## Alternatives
- *A route per Judge page in the shell.* More shell changes in a file other branches also edit, and leaving would need to discard state in several places. Rejected.
- *Play frames at real time scaled by a speed factor.* The replay spans 75 minutes; even at 60x it takes over a minute and most of it is quiet. Rejected for the web rule.
- *Wait for the Light Alarm before building the demo alarm.* Blocks task 6. Rejected; the stand-in is small and replaceable.

## Consequences
- The app plays the demo alarm only while the Unplug page is open, not with the screen off, until the Light Alarm path is used.
- If the app goes to the background mid-scenario, the unplug track keeps time on the wall clock instead of pausing (design section 9 asks for a pause). The judge can restart from the page.
- DM3 is a source-import check of `app/outage/demo`. The Compose and ViewModel code in `ui/DemoScreens.kt` uses the sensor package only for the plug observer and the flag.
