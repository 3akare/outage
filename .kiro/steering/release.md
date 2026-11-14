---
inclusion: manual
---

# /release

Steps (use the `release-apk` skill):
1. Confirm `main` is green: typecheck, lint, all tests including P1 to P12.
2. Bump the version in `apps/mobile/app.json` and add a changelog line.
3. Run the EAS cloud build for a signed Android APK. Ask the human before using any new credential.
4. Upload the APK to the agreed free host and record the direct link.
5. Smoke test on a real device: install, onboarding under 60 s, 10-second unplug/replug self-test, Light Alarm.
6. Log the release in `docs/kiro-log.md`. Commit and push to `main`.
