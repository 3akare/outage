# Signed release builds with Gradle and GitHub Actions

Facts checked against https://developer.android.com/build/building-cmdline and https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions. Not yet run: the release workflow is written together with the app scaffold, and nothing in this file has been exercised on a real release.

## One-time keystore (the human does this, on a computer)

```
keytool -genkeypair -v -keystore outage-release.jks -alias outage -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 outage-release.jks > outage-release.jks.b64     # macOS: base64 -i outage-release.jks
```

Then in the GitHub repository: Settings, Secrets and variables, Actions, New repository secret:

| Secret | Value |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | contents of `outage-release.jks.b64` |
| `RELEASE_KEYSTORE_PASSWORD` | the keystore password |
| `RELEASE_KEY_ALIAS` | `outage` |
| `RELEASE_KEY_PASSWORD` | the key password |

Keep `outage-release.jks` and the passwords in two places outside the repository. Losing the key means no phone can update the app. Never paste a value into a file, a chat or a commit.

## Gradle side (`apps/android/app/build.gradle.kts`)

The signing values come from the environment; the file never holds a password:

```kotlin
android {
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("RELEASE_KEYSTORE_PATH") ?: "release.jks")
            storePassword = System.getenv("RELEASE_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("RELEASE_KEY_ALIAS")
            keyPassword = System.getenv("RELEASE_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

`preflight.mjs` fails on a literal `storePassword = "..."` and on a release build type without `signingConfig`.

## Workflow (`.github/workflows/release.yml`, created with the app scaffold task)

```yaml
name: release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/android
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-java@v6
        with: { distribution: temurin, java-version: '17' }
      - uses: gradle/actions/setup-gradle@v6
      - name: Restore the keystore
        env:
          KEYSTORE_B64: ${{ secrets.RELEASE_KEYSTORE_BASE64 }}
        run: echo "$KEYSTORE_B64" | base64 -d > "$RUNNER_TEMP/release.jks"
      - name: Test, lint, build the signed APK
        env:
          RELEASE_KEYSTORE_PATH: ${{ runner.temp }}/release.jks
          RELEASE_KEYSTORE_PASSWORD: ${{ secrets.RELEASE_KEYSTORE_PASSWORD }}
          RELEASE_KEY_ALIAS: ${{ secrets.RELEASE_KEY_ALIAS }}
          RELEASE_KEY_PASSWORD: ${{ secrets.RELEASE_KEY_PASSWORD }}
        run: ./gradlew --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleRelease
      - name: Name the APK and create a draft release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          cp app/build/outputs/apk/release/app-release.apk "$RUNNER_TEMP/outage-$VERSION.apk"
          gh release create "$GITHUB_REF_NAME" "$RUNNER_TEMP/outage-$VERSION.apk" --repo "$GITHUB_REPOSITORY" --draft --title "Outage $VERSION"
```

Notes
- Public repositories get free minutes on GitHub-hosted runners. Check the current limits at https://docs.github.com/billing/managing-billing-for-your-products/about-billing-for-github-actions before the field test.
- Pull requests from forks never receive secrets. Releases are built only from tags on `main`.
- The preflight reads this file for `assembleRelease`, the four `secrets.*` names, and the absence of inline values.
