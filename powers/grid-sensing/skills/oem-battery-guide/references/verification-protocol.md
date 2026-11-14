# Verification protocol for one phone

You need the sensor app installed, a charger, and 12 hours.

## Before

1. Note the phone: marketing name, Android version, software skin and version (Settings, About phone).
2. Install the app. Do not change any battery setting yet.
3. Baseline: plug in, screen off, leave 12 hours. Record the armed ratio (armed time divided by charging time). This is the "before" number.

## Apply the steps

4. Open the maker's entry in `references/oem-guide.json`. Follow every step exactly, in order, as a stranger would. Do not use knowledge the steps do not contain.
5. For each step write down: found as written, found under another name (write the real name), or not found.
6. Tick each checklist item the phone lets you confirm. For `battery_exemption`, confirm in the app (it reads `isIgnoringBatteryOptimizations`).

## After

7. Repeat the 12-hour run with the same charger, screen off. Record the "after" armed ratio.
8. Do 20 replugs and record the plug-in to job-start delay (p50 and p95).
9. If the app has a foreground-service station mode, repeat the armed ratio run in that mode.

## Decide

| Result | Rule |
|---|---|
| `pass` | Steps found as written, or with only cosmetic name differences, and armed ratio at least 90% after. |
| `partial` | Armed ratio at least 90% only after the steps were corrected or added. Fix the entry first. |
| `fail` | Armed ratio below 90% after following the steps. Keep the entry unverified and report it. If armed time is below 50% on every phone even with exemption and the fallback, stop and rethink the sensor. |

## Record

Add `{ "device": "...", "android": "14", "date": "YYYY-MM-DD", "result": "pass", "notes": "..." }` to the maker's `verified[]`, run `node scripts/validate-guide.mjs`, and keep the raw numbers with the result. Never record a result nobody saw.
