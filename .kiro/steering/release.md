---
inclusion: manual
---

# /release

Run the `release-apk` skill (`.kiro/skills/release-apk/SKILL.md`). Its steps, in short:
1. Confirm `main` is green: typecheck, lint, all tests including P1 to P12.
2. Bump `versionCode` and `versionName` in `apps/android/app/build.gradle.kts` and add a changelog line.
3. Tag the commit. The GitHub Actions release workflow builds the signed APK and attaches it to a GitHub Release. Ask the human before using any new credential (the release keystore is a GitHub secret the human sets).
4. Record the direct APK link from the release.
5. Smoke test on a real device: install, onboarding under 60 s, 10-second unplug/replug self-test, Light Alarm.
6. Log the release in `docs/kiro-log.md`. Commit and push to `main`.
