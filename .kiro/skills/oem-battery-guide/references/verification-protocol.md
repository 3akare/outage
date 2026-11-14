# Verification protocol for one phone

Needs the Outage probe app or the real app installed, a charger, and 12 hours. Related: `docs/probe-checklist.md` (M1, M4).

## Before

1. Note the phone: marketing name, Android version, software skin and version (Settings, About phone).
2. Install the app. Do not change any battery setting yet.
3. Run a baseline: plug in, screen off, leave 12 hours. Record the armed ratio (probe debug screen, or the field report). This is the "before" number (M4).

## Apply the steps

4. Open `packages/shared/src/oem-guide.json` and the maker's entry. Follow every step exactly in order, as a stranger would. Do not use knowledge the steps do not contain.
5. For each step write down: found as written, found under another name (write the real name), or not found.
6. Tick every checklist item the phone lets you confirm. For `battery_exemption` confirm in the app (it reads `isIgnoringBatteryOptimizations`).

## After

7. Repeat the 12-hour run with the same charger and the screen off. Record the "after" armed ratio.
8. Do the replug test: 20 replugs, record the plug-in to job-start delay, p50 and p95 (M2).
9. If the app uses the Station mode foreground service, repeat the armed ratio run in Station mode.

## Decide

| Result | Rule |
|---|---|
| `pass` | Steps found as written (or with only cosmetic name differences) and armed ratio at least 90% after. |
| `partial` | Armed ratio at least 90% only after steps were corrected or added. Fix the entry first. |
| `fail` | Armed ratio below 90% after following the steps. Keep unverified. Open a Bugfix Spec with the numbers. If below 50% on every phone even with exemption and Station mode, that is the kill criterion: stop and tell the human. |

## Record

Add to the maker's `verified[]` in the guide, run the validator, and write the raw numbers in `docs/probe/<date>-<alias>.md`. Add one line to `docs/kiro-log.md`. Never record a result that nobody saw.
