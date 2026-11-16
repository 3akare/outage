---
name: release-apk
description: Build, sign, publish and smoke-test an Outage Android APK with GitHub Actions. Use for /release, when asked to ship or cut a release, build an APK for the field test or the submission, update the direct APK link on the install page, or check that a release is ready. Covers version bump, the tagged Gradle build, signed APK check, the GitHub release, Worker install-page values, and the device smoke test.
license: MIT
compatibility: Needs Node 20+, the gh CLI, and a real Android phone for the smoke test. The build runs on a free GitHub-hosted runner; the release keystore is a set of GitHub Actions secrets that the human creates.
metadata:
  project: outage
  steering: .kiro/steering/release.md
  related-specs: web-and-area-pages (R7 install page), onboarding, feasibility-probe
---

# Release APK

Outage is distributed as a sideloaded APK (no Play Store). A release is: a version, a signed APK built by GitHub Actions from a tag, a public direct link, the install page values, and a phone that proved it works. Stack: ADR 0012. The probe build is separate: the tag `probe-v*` publishes a debug-signed probe APK (`.github/workflows/android.yml`) and needs none of the steps below.

Related: `/release` steering (`.kiro/steering/release.md`), install page spec (`.kiro/specs/web-and-area-pages` R7), brief Part J (submission checklist: direct APK link, video on a real device).

## Rules

- **Ask the human before:** creating the release keystore or its secrets, pushing a release tag, publishing a release, and deploying the Worker with a new APK link.
- **Never commit** an APK, a keystore, `google-services.json`, an `.env` file or a token. The guard hooks block it; do not look for ways around them. Secrets live in GitHub Actions secrets and Wrangler secrets.
- The signing key must be the same for every release, or phones cannot update. Never generate a second key by accident. The human keeps an offline backup of the keystore and its passwords.
- A release tag builds once. Do not push a tag before preflight is green.

## Steps

1. **Preflight.** `node .kiro/skills/release-apk/scripts/preflight.mjs`. It checks branch, clean and pushed tree, `versionName` against the last tag and `versionCode` against the last release, `targetSdk`, no literal signing password in the Gradle file, a signed release build type, no forbidden permission in the manifest, the release workflow (builds an APK with `assembleRelease`, reads the four signing secrets, none written inline), no secret file tracked, `.gitignore`, `.kiro` tracked, the last test result, and the OEM guide status (a warning for unverified makers). Fix every FAIL.
2. **Version.** In `android/outage/app/build.gradle.kts` raise `versionName` (MAJOR.MINOR.PATCH) and `versionCode` (a whole number higher than the last release). Add the changelog line. Commit: `chore(release): vX.Y.Z [spec:none task:release]`.
3. **Ask the human** to confirm the version and that the four secrets exist: `RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD` (`references/gradle-release.md` shows how the human creates them).
4. **Build.** Push the commit, then the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow `release.yml` runs `./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleRelease`, signs the APK from the secrets, names it `outage-X.Y.Z.apk` and creates a draft GitHub Release. Watch it with `gh run list --workflow release.yml` and, on failure, read `gh run view <id> --log-failed`; fix in a normal commit and use a new tag (do not move a pushed tag).
5. **Download** the APK from the draft release to a temp folder outside the repository.
6. **Inspect.** `node .kiro/skills/release-apk/scripts/apk-info.mjs <file.apk> --version X.Y.Z --url <final link> --json`. It reads the package, prints size and SHA-256, and fails for a file that is not a signed APK. It cannot prove the signature is valid or whose key it is; if `apksigner` is installed (`$ANDROID_HOME/build-tools/36.0.0/apksigner`), also run `apksigner verify --print-certs <file.apk>` and compare the certificate digest with the previous release.
7. **Smoke test on a real phone** (`references/smoke-test.md`) with the file from the draft release. A release that has not been installed from the final link is not released.
8. **Publish** the draft (`references/github-release.md`) and set the install page values: `APK_URL`, `APK_VERSION`, `APK_SIZE_BYTES`, `APK_SHA256` in `web/wrangler.toml` `[vars]` (the output of `apk-info`). Ask the human before `wrangler deploy`. Open `/install` and check the link, size and checksum.
9. **Record.** `docs/kiro-log.md` entry (version, workflow run, checksum, phone used, result), `docs/status.md`. Update the README download link.

## If something fails

| Problem | Do |
|---|---|
| Workflow fails | Read `gh run view <id> --log-failed`. Reproduce locally with `.kiro/scripts/android-sandbox.sh gradle android/outage :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`. Fix, commit, tag again with the next patch version. |
| The workflow produced an `.aab` | It ran `bundleRelease`. Release builds use `assembleRelease` (preflight catches it). |
| "App not installed" on the phone | Same package with a different signing key, or a lower `versionCode`. Uninstall the old app only if the human agrees, and note the cause. |
| Phone says the file is unsafe | Normal for sideloaded apps; the install page explains how to allow it. |
| Smoke test fails | Do not publish. Open a Bugfix Spec with the observed behavior, and say so to the human. |
| Checksum differs after download | Stop. Re-download. If it still differs, do not publish. |

## Files

- `scripts/preflight.mjs`, `scripts/apk-info.mjs`, tests in `scripts/test/`.
- `references/gradle-release.md`: the signing setup and the release workflow.
- `references/github-release.md`: publishing and the manual fallback.
- `references/smoke-test.md`: the device checklist (the milestone 3 gate and the submission video).
