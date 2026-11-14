---
name: oem-battery-guide
description: Exact per-maker steps to stop the phone from killing a background sensor app, for Tecno, Infinix, itel, Samsung, Xiaomi (Redmi, POCO) and Google Pixel. Use when writing an onboarding battery screen, adding or verifying a maker's steps, answering why a background app stops on a Tecno, Infinix or itel phone, or when low armed time shows up on one phone maker.
---

# OEM battery guide

A charging sensor works by a background job stopping when charging stops. If the phone's own battery manager kills the app first, nothing is detected. Each maker hides the switch in a different place, and the names change with the model and the software version.

## The data

`references/oem-guide.json` is the single source of truth: per maker, the matching rules (lower-case `manufacturer` and `brand` tokens), numbered-by-the-app step groups, a checklist, the source page, and `verified[]` (empty until a person checked it on a real phone). The app that uses it shows an entry with an empty `verified` as "General steps. Names may differ on your phone."

Today every entry is **unverified**. Sources are public pages (dontkillmyapp.com for Tecno, Samsung, Xiaomi and Google; one guide each for Infinix and itel, which dontkillmyapp.com has no page for). See `references/sources.md`.

## Use it

- To answer a user: give that maker's steps in plain words and say names can differ.
- To change an entry: read the maker's current page first. Never write a step you did not read in a source or see on a phone. Keep steps short, one action each, at most 160 characters, with the app name, and do not number them. Keep `verified` empty unless a device check was really done.
- Run `node scripts/validate-guide.mjs` after every edit. It checks that every maker is present, matching tokens are lower-case and never overlap between makers, steps are well formed, every checklist has `battery_exemption` (the only item an app can verify itself, with `PowerManager.isIgnoringBatteryOptimizations`), sources are https links, and verification records are honest. `--require-verified` fails while a maker has no passing device check.
- To verify a maker, follow `references/verification-protocol.md` on a real phone, then record `{ device, android, date, result, notes }`.

## What not to do

- Do not tell users to turn off "MIUI optimization" in developer options. It can break the phone.
- Do not promise the steps work. Samsung can put an app back to sleep after an update.
- Do not point users at hidden "booster" apps.
- The direct battery-exemption request is restricted by Google Play policy (https://developer.android.com/training/monitoring-device-state/doze-standby); it is fine for a sideloaded APK, and a store build needs another route.
