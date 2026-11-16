---
name: oem-battery-guide
description: Exact per-maker steps to stop the phone from killing Outage in the background, for Tecno, Infinix, itel, Samsung, Xiaomi (Redmi, POCO) and Google Pixel. Use when writing or checking the onboarding battery step, adding or verifying a maker's steps in oem-guide.json, answering "why does Outage stop on my Tecno or Infinix", or when a field report shows low armed time on one phone maker.
license: MIT
compatibility: Needs web search or fetch to read sources, and Node 20+ to run the validator. A real phone is needed to verify an entry.
metadata:
  project: outage
  data-file: core/shared/src/oem-guide.json
  spec: .kiro/specs/onboarding (R7, properties O4 and O5)
---

# OEM battery guide

Outage detects a power cut because its charging job stops. If the phone's own battery manager kills Outage first, nothing is detected. Armed time falls (milestone 1 gate: at least 90%; kill criterion: below 50% on every phone). Each maker needs different steps, and the names change with the phone model and software version.

## The one source of truth

`core/shared/src/oem-guide.json`. The app reads it in the onboarding battery step. This skill edits it. Do not copy steps anywhere else.

Shape (see `.kiro/specs/onboarding/design.md` section 5):

- `makers[]`: `id`, `name`, `family`, `match` (lower-case `manufacturer` and `brand` tokens), `steps[]` (groups with a `title`, `steps[]`, optional `settingsAction`), `checklist[]`, `source`, `alsoSee[]`, `verified[]`.
- `verified[]` is empty until a person checks the steps on a real phone. Empty means the app shows "General steps. Names may differ on your phone."

## When to use this skill

| Request | Do this |
|---|---|
| Add or change a maker's steps | Follow "Update an entry". |
| Mark an entry verified | Follow "Verify on a device" and record the result. |
| Build or change the onboarding battery screen | Read the JSON and the onboarding spec R7. Do not hard-code steps in the app. |
| A field report shows low armed time for one maker | Read that maker's entry, compare with `references/sources.md`, and write a Bugfix Spec if a step is missing or wrong. |
| A user asks how to fix Outage stopping on their phone | Give that maker's steps from the JSON in plain words. Say the names can differ. |

## Update an entry

1. Read `references/sources.md` for what is already known and where it came from.
2. Look up the maker's current page with a web tool. Prefer: dontkillmyapp.com for the maker, the maker's own support page, then well-sourced guides. Never write a step you did not read in a source or see on a phone.
3. Edit only `core/shared/src/oem-guide.json`. Rules:
   - Plain words. Use the app name `Outage`. Write setting names exactly as the phone shows them. One action per line, at most 160 characters.
   - Do not number steps. The app numbers them.
   - Keep `verified` empty unless a real device check is recorded.
   - Put the main page in `source` and others in `alsoSee`. All are `https` links.
   - Every `checklist` has `battery_exemption`. It is the only item the app can check by itself (`isIgnoringBatteryOptimizations`); the others are confirmed by the user.
   - Transsion phones (Tecno, Infinix, itel) share logic but keep separate entries, so each is verified on its own phone.
   - Do not tell users to turn off "MIUI optimization" in developer options. It is a last resort that can break the phone.
4. Run `node .kiro/skills/oem-battery-guide/scripts/validate-guide.mjs`. Fix every error.
5. Run `node --test ".kiro/skills/oem-battery-guide/scripts/test/*.test.mjs"`.
6. Add a line to `docs/kiro-log.md` naming the sources. If a step changes what Outage asks of the user, update `.kiro/specs/onboarding` too.

## Verify on a device

Read `references/verification-protocol.md`. In short: a person with the phone follows the steps exactly as written, then runs the 12-hour armed-time check from `docs/probe-checklist.md`, and records the result:

```json
{ "device": "Tecno Spark 10, HiOS 13", "android": "13", "date": "2026-11-20", "result": "pass", "notes": "Auto-start name differs: 'Autostart'" }
```

- `pass`: the steps worked as written and armed time is at least 90%.
- `partial`: it worked after changes. Fix the steps in the same commit, then record `partial` with the notes.
- `fail`: it did not work. Keep the entry unverified, open a Bugfix Spec, and say so to the human.

Never record a result you did not see. Only the human, or a tester the human names, can verify a phone.

## Release gate

`node .kiro/skills/oem-battery-guide/scripts/validate-guide.mjs --require-verified` must pass for Tecno or Infinix before milestone 1 is called passed ("Tecno or Infinix works after battery exemption"), and for every maker the app lists as supported before release. Today every entry is unverified.

## What not to claim

- Do not say the steps are guaranteed. Samsung can put an app back to sleep after an update.
- Do not give instructions for hidden or paid "booster" apps.
- The app needs the battery exemption for the sideloaded APK. Google Play policy restricts the direct request (https://developer.android.com/training/monitoring-device-state/doze-standby); a store build would need another route and is out of scope.
