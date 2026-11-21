# Smoke test on a real phone

Do it from the public link, on a phone that is not the developer's own build machine, and record each result. This is also the milestone 3 gate ("a stranger installs, finishes setup in under 60 seconds and gets a Light Alarm with no help") and the base of the submission video (brief, Part J).

## Before

- Use a phone that has never had Outage, or uninstall it first. Note maker, Android version, date.
- Have a charger and a way to cut power (a power strip switch).
- Another person who has not used the app, if possible, does the install and setup. Time them.

## Checks

| # | Check | Pass when |
|---|---|---|
| 1 | Open the direct link on the phone | The file downloads. The size and the SHA-256 on the install page match the file (check the hash on a computer if the phone cannot). |
| 2 | Install | The system asks to allow installing from this browser, the app installs. Opening it from the install page works. |
| 3 | First screen | "Try Judge mode" and "Set up my phone" are shown. Judge mode opens in 2 seconds with no permission. |
| 4 | Judge mode, recorded replay | The banner says "Simulated replay". Normal, Possible, Confirmed, Restored show with the explanation. |
| 5 | Judge mode, unplug | Unplug the charger. Simulated neighbors are labeled. Confirmed shows within 5 seconds. Plug back: Restored shows. |
| 6 | Setup | Spot, consent, notifications, battery steps, self-test. Total under 60 seconds for a stranger. Note each step's time. |
| 7 | Battery steps | The steps match the phone maker's entry; note any name that differs (feeds `verified[]` of the OEM guide). The app shows the battery exemption as on after the user does it. |
| 8 | Self-test | Charger removal seen, sensor armed, charger return seen. The delay is shown. Nothing from the test appears in the history. |
| 9 | Prompt | Unplug the charger: a quiet "Power just went?" notification with the two actions. |
| 10 | Light Alarm, offline | Turn on airplane mode. Unplug. Answer "Yes, wake me when it's back". Lock the screen. Close the app. Plug the charger in. The alarm rings, with no network, within the delay shown by the self-test. Stop it. |
| 11 | "No" path | Unplug, answer "No, I unplugged it", plug in. No alarm. |
| 12 | Test Light Alarm | The test button rings after 5 seconds and says "Test". |
| 13 | Power sensor | Settings, Power sensor is on. The small notification ("Outage is watching") shows. Pull the charger: an UNPLUG is recorded. |
| 14 | Update path | Install the next release over this one. The app updates without uninstalling and keeps its install ID. (Same signing key.) |
| 15 | Privacy | Settings, Apps, Outage, Permissions shows no microphone, contacts, phone or fine location. Delete my data works and the app returns to the first screen. |
| 16 | Web | Open the Worker URL on an iPhone: Judge mode replay, an area page, and the install page with the same link, version and SHA-256. |

## Record

- `docs/kiro-log.md`: version, build id, SHA-256, phone, Android version, result per check, time of the setup.
- A failed check: do not publish. Open a Bugfix Spec (`bugfix-YYYYMMDD-<slug>`) with the observed behavior.
- Update the OEM guide `verified[]` for the phone's maker through the `oem-battery-guide` skill, with the 12-hour armed-time result if you ran it.
- For the video: take check 10 (offline Light Alarm) and check 5 on camera, plus 20 seconds inside `/.kiro`.
