# Probe checklist (Milestone 1)

For the person holding the phones. Spec: `.kiro/specs/feasibility-probe/` (requirements R6 define M1 to M14, design section 5 gives the method). This file is a script: do the steps in order, write on the log sheet, and use the app's buttons. You do not need to understand the numbers. The analysis script reads the app's log.

Status: matches the probe app built in tasks 5 to 7 (buttons: `Start`, `Stop`, `Reference logger` switch, `Mark note`, `Upload now`, `Export file`, `Alarm test`, `Stop alarm`, `Battery settings`, `Clear`). Not yet run on a phone. If something on screen differs from this file, write it in the Problems box and carry on.

## Mode for this run: export only

Decided by the human on 2026-11-14: no Worker for now. Leave the Worker URL and token boxes empty, skip `Upload now` and skip M13. At the end of each run tap `Export file`, save the file, and send it to the developer. Everything else is the same.

## Everyday mode (Samsung, the plan for now)

Decided by the human on 2026-11-14 (ADR 0013). It takes about two minutes once, then nothing.

1. Install the app (see Install below) and open it.
2. Type an alias, for example `samsung-a`. Leave the Worker URL and token boxes empty.
3. Tap `Battery settings` and allow the app (choose Allow or Unrestricted). Then follow the Samsung steps from the project guide (`core/shared/src/oem-guide.json`, source dontkillmyapp.com/samsung), with "Outage Probe" in place of "Outage": Settings, Battery and device care, Battery, Background usage limits; turn off "Put unused apps to sleep"; take Outage Probe out of Sleeping apps and Deep sleeping apps; add it to Never sleeping apps. Note each change with `Mark note`, for example `setting: never sleeping apps`. Menu names can differ on your phone; write what you saw.
4. Tap `Start`. Turn on `Reference logger`. The phone shows a small "Reference logger is on" notification; leave it.
5. Tap `Mark note` and type `cond: daily-life`.
6. Use and charge the phone as you always do. Power cuts are fine; they are what the app is for.
7. Every few days, tap `Export file` and send the file. The developer replies with the charging hours so far. The main measurement is complete at 12 hours of charging in total.

Do not tap `Clear` or uninstall the app until the developer confirms the data arrived. The other measurements below (M2 to M14) are optional in this mode.

## Install

On the phone, open https://github.com/3akare/outage/releases, tap the newest `Outage probe probe-v...` release, then tap `outage-probe-debug.apk`. Allow "install unknown apps" for your browser when the phone asks. Android may warn that the app is from an unknown source; that is expected for this test app.

## 0. What this test decides

The project works only if a phone can notice "charger lost" while it sits idle with the screen off. The gate:

| Gate | Pass when |
|---|---|
| Armed time | On at least one phone, the job was running (armed) for at least 90% of the time it was charging, over at least 12 hours (M1) |
| Start delay | 95% of plug-ins (20 or more tries) see the job start within 60 seconds (M2) |
| Tecno or Infinix | Passes both rows above after the battery exemption (M4) |

If every phone stays under 50% armed even after the exemption, the project stops and we rethink the sensor. A bad result is a valid result. Do not retry until it looks good: record every run, including the bad ones.

## 1. Rules (read once)

1. Alias only. Name each phone with an alias like `tecno-a` or `pixel-b`. Never type a name, phone number, address or place in a note. The app collects no location, microphone or personal data (R7).
2. Your own phones only. Do not install on anyone else's phone.
3. Use the phone's own charger and cable for timing tests (M1 to M10), unless a step says otherwise.
4. Do not touch the phone during a timed run, except the plug steps. No app switching, no Wi-Fi changes.
5. Every run starts by writing a condition label (section 3). Without a label, the run is hard to analyse.
6. Never put the real `PROBE_TOKEN` in a note, a screenshot or a message.
7. The Worker must be removed after the gate decision (task 10). Tell the developer when you are done with all phones.

## 2. Phone matrix

Fill one row per phone before you start. Coverage gaps are reported honestly in the summary, so leave rows empty rather than borrow a phone you cannot trust.

| Priority | Alias | Maker and model | Android version | Network used (data / Wi-Fi) | OEM battery steps applied (see section 4) | Done |
|---|---|---|---|---|---|---|
| Must have, gate | | Tecno or Infinix | | | | |
| Should have | | Samsung | | | | |
| Should have | | Xiaomi (or Redmi, Poco) | | | | |
| Should have | | Pixel | | | | |
| Nice to have | | itel | | | | |
| Nice to have | | Any other | | | | |

Notes on the matrix
- Android 14 or newer phones also take M12.
- The OEM battery steps for each maker are in `core/shared/src/oem-guide.json`. Every step in that file is unverified on a real phone. Your result is the first check, so write down exactly which screens you saw.

## 3. Setup, same for every phone

1. Install the probe APK (see Install above).
2. Open the app. Allow notifications when asked. Do not grant anything else.
3. Type the device alias into the first box at the top. In export-only mode leave the Worker URL and token boxes empty. The app reads the maker and Android version itself.
4. Charge the phone to between 30% and 60% before the first timed run, unless the step says 100%.
5. Tap `Mark note` and type exactly: `cond: baseline`. This is the condition label. For every later condition use the same form: `cond: <name>`, for example `cond: after-exemption` or `cond: idle-30min`.
6. Check the debug screen shows: sensor on, current plug state, job state. If the sensor shows off, tap `Start`.
7. Check the reference-logger switch is on, except where a step says to turn it off.

### Note conventions (the analysis reads these)

| Note text | Meaning |
|---|---|
| `cond: <name>` | A new condition starts now. All rows after it belong to it until the next `cond:` |
| `setting: <what you changed>` | A battery or autostart setting you changed, in plain words, for example `setting: battery usage set to Unrestricted` |
| `step: <Mx> <result>` | A result only you can see, for example `step: M9 audio did not start` |
| `problem: <text>` | Anything odd: crash, screen asked for permission, phone rebooted |

Keep notes short. One idea per note.

## 4. Battery exemption (do this between the "before" and "after" runs, M4)

1. Finish the "before" run first (M1 below).
2. Open the app's battery settings from the debug screen, or go to Settings, Apps, the probe app, Battery. Choose the unrestricted or "don't optimize" option.
3. Apply the maker's other steps from `oem-guide.json` (autostart, background limits). For each one, add a note `setting: ...` and the screen name you saw.
4. Tap `Mark note`: `cond: after-exemption`.
5. Run M1 again for at least 12 hours.

## 5. The measurements

Mark the phone's times on the log sheet (section 6) as well as in the app. If the two disagree about when something happened, trust the app log and write `problem:` about the difference.

### M1 Armed time over 12 hours (gate)
1. Note `cond: baseline-12h`.
2. Plug in the phone at 30% to 60%. Turn the screen off. Leave it. Do not touch it for at least 12 hours (overnight is fine).
3. In the morning, look at the live armed ratio on the screen and write it on the log sheet. Tap `Upload now`. If the upload fails, tap `Export file` and send the file to the developer.
4. Repeat after the exemption (section 4) with the label `cond: after-exemption-12h`.

Pass: armed ratio at least 90% on at least one phone. Under 50% on every phone, even after the exemption: tell the developer straight away.

### M2 Plug-in to job start, 20 replugs (gate)
Needs the reference logger on.
1. Note `cond: replug-screen-off`.
2. Phone at 30% to 60%, screen off, plugged in for at least 2 minutes.
3. Unplug. Wait 20 seconds. Plug in. Wait 20 seconds more.
4. Repeat steps 3 and 4 until you have done 20 replugs. Count on the log sheet.
5. Look at the screen. It should show 20 plugs and 20 job starts. If a job start is missing, write the replug number on the log sheet.
6. Tap `Upload now`.

### M3 Behaviour at 100%
1. Note `cond: full-100`.
2. Leave the phone plugged in until the battery says 100%. Keep it plugged in for 30 more minutes, screen off.
3. Check the screen: did the job stop? Write the stop reason shown. Did power-plug broadcasts still show in the log?
4. Unplug at 100%. Wait 30 seconds. Plug in. Repeat 5 times. Write on the log sheet what the screen showed each time.
5. Note: `step: M3 <what happened>`.

### M4 Before and after the exemption
This is the same M1 run, done twice (section 4). Write every setting you changed. Do the "before" run first, always.

### M5 Job stops and gaps
No separate steps. Use the M1 runs. After each, write on the log sheet the counters shown: starts, stops, and the stop reasons list.

### M6 Unplug to job stop, 20 unplugs
Needs the reference logger on.
1. Note `cond: unplug-screen-off`.
2. Phone at 30% to 60%, charging, screen off, for at least 2 minutes.
3. Unplug. Wait 20 seconds. Plug in. Wait 20 seconds.
4. Repeat until you have done 20 unplugs.
5. Tap `Upload now`.

### M7 Power broadcasts when idle
Turn the reference logger on. Do each block of 20 unplugs, with 20 seconds between actions:
1. `cond: bcast-screen-on`: screen on and awake.
2. `cond: bcast-idle-30min`: screen off, phone left alone for 30 minutes before the first unplug.
3. `cond: bcast-100`: phone at 100%.
Tap `Upload now` after each block.

### M8 Expedited job
The app tries this itself when you start the sensor. Open the debug screen and look for a line saying the expedited attempt was accepted or refused. Write it on the log sheet. No other steps.

### M9 Alarm audio from the background
1. Turn the phone volume to a middle level. Put the phone on a table.
2. Note `cond: alarm-bg`.
3. In the app, tap `Alarm test`. The screen says it is armed: the next plug-in rings.
4. Swipe the app away from recent apps. Turn the screen off.
5. Unplug, wait 10 seconds, plug in.
6. Listen. Write the delay between plugging in and the sound, or "no sound". The sound stops by itself after 10 seconds, or open the app and tap `Stop alarm`.
7. Repeat 3 times. Note: `step: M9 <what happened>`.

### M10 Plug-in after 30 minutes idle
1. Note `cond: idle-30min`.
2. Unplug. Turn the screen off. Leave the phone alone for 30 minutes.
3. Plug in. Wait 60 seconds. Check if the job started.
4. Repeat 5 times.

### M11 Plug type
For each source below, plug in and write the plug type the screen shows:
1. Wall charger. 2. USB port of a computer. 3. Wireless charger, if you have one. 4. Power bank.
Note: `step: M11 <source> shows <type>`.

### M12 Full-screen alarm permission (Android 14 or newer only)
Open the app once. Read the line on the debug screen that says whether full-screen notifications are allowed. Write yes or no on the log sheet. Do not change the setting.

### M13 Round trip to the Worker
1. Note `cond: net-data`. On mobile data only (Wi-Fi off), tap `Upload now` 20 times, a few seconds apart.
2. Note `cond: net-wifi`. On Wi-Fi only, do the same.
Each tap needs at least one new log row to upload. Use `Mark note` between taps if needed.

### M14 Two sources for plug and level
No steps. The app records both at every job stop. Check at the end that the debug screen does not show a "mismatch" counter above zero. If it does, write the number on the log sheet.

## 6. Log sheet (one per phone and condition)

Print or copy this block once per phone.

```
Alias: ____________   Maker/model: ____________   Android: ______
Date: ____________    Charger used: ____________  Network: data / Wi-Fi

Condition label: ____________
Start (clock): ______   End (clock): ______   Screen off the whole time: yes / no
Battery at start: ____%   Battery at end: ____%

M1  live armed ratio: ____%          M5 starts: ____  stops: ____  stop reasons: ____________
M2  replugs done: ____/20  job starts missing at replug numbers: ____________
M3  job stopped at 100%: yes / no  reason: ________  broadcasts still arrive: yes / no
M6  unplugs done: ____/20
M7  block: screen-on / idle-30 / 100%   unplugs done: ____/20
M8  expedited: accepted / refused (text: ____________)
M9  tries: __/3   sound delays (s) or "none": ____________
M10 tries: __/5   job started within 60 s: __/5
M11 wall: ____  computer: ____  wireless: ____  power bank: ____
M12 full-screen allowed: yes / no / not Android 14+
M13 data: done / wifi: done
M14 mismatch counter: ____

Settings changed (one per line, with the screen name): ____________________________

Problems (crash, reboot, strange screen, upload failed): ____________________________
```

## 7. When a run is done

1. Tap `Upload now`. If it fails twice, tap `Export file` and send the file to the developer by any private channel. The file has only your alias and raw events.
2. Do not tap `Clear` until the developer confirms the data arrived.
3. Photograph or type the log sheet and send it with the export.
4. Say which phones are finished, so the matrix can be updated.

## 8. What the app must offer for this checklist to work

This list is for task 7 and the Kotlin tasks, so the checklist and the app agree. If any item is dropped, update this file in the same change.

| Needed | Used by | Spec task |
|---|---|---|
| `Mark note` with free text; rows keep the time | all, section 3 | 7 |
| Notes are logged as `NOTE` rows exactly as typed | analysis grouping by `cond:` | 3, 7 |
| `Upload now` logs an `UPLOAD` row with the request duration in ms and the network type | M13 | 7 |
| `Alarm test` and `Stop alarm` buttons (arms one ring on the next plug-in) | M9 | 6 |
| Debug screen lines: expedited result, full-screen allowed, job starts and stops, stop reasons, live armed ratio, mismatch counter | M1, M3, M5, M8, M12, M14 | 5, 7 |
| Plug type, battery status, standby bucket and exemption state in every job row | M3, M11, ADR 0001 | 5 |
| Reference-logger switch | M2, M6, M7 | 6, 7 |
| `Export file` and `Clear` | section 7 | 7 |

## App shell check (AS8, app-shell R6.3)

Not part of the probe. Do this once on a real phone with the debug build of `android/outage` (artifact `outage-app-debug`), after the field test or on any spare phone.

1. Settings > Display > Font size: set the largest size (200% if the phone allows it, otherwise the largest). Set the display size to the smallest width you can (360 dp wide or less).
2. Open Outage. On a debug build the "Set up" placeholder shows first. Tap `Done`.
3. Home: read the status card ("No area data yet") and the sensor card ("Not watching", reason). All text must be fully visible, wrapped on more lines, with no cut-off words. Scroll to the end.
4. Open Settings. Every row must be readable and tappable. Tap `Delete my data`, read the question, tap `Cancel`.
5. Turn on dark mode. Repeat step 3. Each status must still show an icon and a text label.
6. Record the phone, font size and result on the log sheet (section 6). Any clipped text is a bug: note which screen.

## Station section (station-mode R6)

Spare phone, left plugged in. Check each on the real phone, write the result in the log sheet:

1. Leave it charging past 100%. Unplug it: one UNPLUG event within seconds. Replug: one REPLUG.
2. Screen off, no touching for 2 hours (Doze). The ongoing notification stays and a heartbeat lands about every 10 minutes while armed.
3. Apply the maker's battery steps in Settings, Battery setup. Repeat step 2 overnight.
4. Reboot the phone. After boot the sensor re-arms without opening the app, and the gap is recorded.
5. Switch Power sensor off in Settings. Nothing is recorded or uploaded until it is switched on.

## Home Watch section (home-watch task 9)

Two phones: a station (spare phone, plugged in at home) and a viewer (main phone). A build with a Worker address (`-PoutageApiBase=...`). Write the result in the log sheet:

1. Station: Settings, Station mode, "Pair with my phone". A 10-symbol code shows, with "Valid until" 10 minutes ahead.
2. Viewer: Settings, Home Watch, type the code and a name, Pair. "Paired." shows, and a card "Home: power on since ..." appears in Home Watch and on Home under the map.
3. Unplug the station's charger. Open the viewer app: within a minute the card says "Home: power off since ..." with the unplug time. Replug: "Home: power on since ...".
4. Router down: switch the home router off, then unplug the station (no SIM data). After about 30 minutes the viewer says "Station offline" and "Last known: power on since ...", never "power off". Switch the router on: within 10 minutes the card says "power off since" the real unplug time, or "power on since" the replug time.
5. Station, Station mode: the paired phone is listed. Remove it. The viewer card disappears on its next refresh.
6. **Push latency (open, needs Firebase Messaging, ADR 0045):** with the viewer app closed, unplug the station and time the push "Home: power off since ...". Target: under 60 seconds from the event reaching the Worker (R5.1). Until Firebase Messaging is in the app, the viewer only refreshes while open, so this step cannot pass yet.

## Freezer Guard (power-log R6, ADR 0038)

Real phone, debug build. Set the limit to 1 hour for the checks, then put it back.

1. Settings, Freezer Guard: switch on, limit 1 h. Make an outage interval: tap "Power is out" on the Log screen with the phone off the charger. Wait 1 hour with the screen off. The alert "Check your freezer" appears. Write down how many minutes late it was.
2. Tap "Power is back" before the hour ends. No alert appears.
3. Repeat step 1 and close the app from recents. The alert still appears (R6.9).
4. Repeat step 1 with the phone in airplane mode. The alert still appears.
5. Set quiet hours to include the current time. The alert arrives silent. Switch on "Freezer Guard may sound in quiet hours": the next alert makes a sound.
6. Switch on "Alert on time". The system "Alarms & reminders" page opens. Allow it, come back, repeat step 1: the alert arrives within a minute of the limit. Revoke the access in system settings and repeat: the alert still arrives (late is fine).
7. Android 14 and later: with the access allowed, force-stop the app from system settings. Note that no alert arrives after a force stop (the system cancels the alarm) and write it on the log sheet.
8. Reboot during an outage. Open Outage: the alarm is planned again from the log.
9. Tecno, Infinix, itel, Xiaomi: repeat step 3 and write down how late the alert was. Late is a finding, not a failure.
