# eas.json for sideloaded APKs

Location: `apps/mobile/eas.json`. Facts from https://docs.expo.dev/build-reference/apk/ and https://docs.expo.dev/build-reference/app-versions/: an Android build is an `.aab` by default; setting `android.buildType` to `"apk"` (or `distribution` to `"internal"`) produces an installable `.apk`. With `cli.appVersionSource` set to `"remote"`, EAS stores the developer-facing `versionCode` and `autoIncrement` raises it on each build.

```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "OUTAGE_BUILD": "field-test" }
    },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "apk" },
      "env": { "OUTAGE_BUILD": "public" }
    }
  }
}
```

Notes:

- `preview` is for field-test phones. Its build flag `OUTAGE_BUILD=field-test` turns the "Share anonymous diagnostics" choice on by default (onboarding R4.5). `production` leaves it off.
- Profile names are free. The preflight script reads the name you pass with `--profile`.
- The `env` values here are plain text and not secret. Secret values (the Firebase `google-services.json` file, API URLs with tokens) go into EAS environment variables with `secret` visibility (https://docs.expo.dev/eas/environment-variables/manage); never into this file. Confirm the exact `eas env:*` commands with `eas env:create --help`.
- The signing keystore is created and held by EAS (managed credentials). Back it up with `eas credentials` and store it outside the repository.
- `autoIncrement` is for the developer-facing `versionCode`. The user-facing `expo.version` is changed by hand (step 2 of the skill).
- Free plan: builds run in a lower-priority queue and the monthly allowance is small. Do not build for docs-only changes.
