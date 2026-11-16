# Outage Android app

Native Kotlin app (ADR 0012). This folder holds the app shell (spec `app-shell`): Home, navigation, Settings with Delete my data, theme, icon and string pack. Feature specs plug their screens into it.

## Build and test

From the repository root, in the Kiro Web sandbox:

```
.kiro/scripts/android-sandbox.sh gradle apps/android --console=plain :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

On a normal machine (JDK 17, Android SDK 36): `cd apps/android && ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`. CI runs the same in the `app` job of `.github/workflows/android.yml` and uploads `outage-app-debug`.

## Layout

| Package | Content |
|---|---|
| `app.outage.shell` | Pure Kotlin, no Android imports: `Route`, `Router`, `Routes`, `HomeReducer`, `StatusStyle`, `DeleteRegistry`. Plus the SharedPreferences stores and `ShellGraph`. |
| `app.outage.ui` | Compose screens, theme, `FeatureRegistry`, view models. No literal user text: all text is in `res/values/strings.xml`. |
| `app.outage.sensor` | The charging sensor (ADR 0032, ADR 0033): pure state machine and decision table, SQLite outbox, `SensorService` (foreground receiver, primary), `ChargingJobService` (backup), `BootReceiver`. Starts after first run and on app resume. |
| `app.outage.net` | Uploader, the real HTTP transport to `BuildConfig.API_BASE` (register, events, delete) and the sensor outbox adapter that adds the cell. |
| `app.outage.alarm`, `log` | Small state types and interfaces the shell reads. Features fill them. |

## How a feature plugs in

In `OutageApp.onCreate`, call `graph.features.register(key, titleRes, screen, deleteFn)`. Keys the shell knows: `onboarding`, `log`, `area`, `alarm`, and the Settings items (`alarm_settings`, `notifications`, `battery`, `station`, `home_watch`, `followed_area`, `language`, `diagnostics`). Anything not registered shows "Coming soon". Register the server delete with `graph.deletes.registerServer(...)`. Replace `graph.sources` with a real `StatusSources` for Home.

## Deep links

A notification opens a screen with the intent extra `route`: `home`, `log`, `area`, `settings` or `feature:<key>`. Unknown values open Home.

## Dependencies

Only those in `.kiro/approved-dependencies.json`: Compose BOM (2026.06.01), Material 3, foundation, ui, activity-compose 1.12.4, lifecycle 2.10.0, JUnit 4. Newer lines need `compileSdk 37`, which `tech.md` does not allow yet.

## Tests

JUnit 4 on the JVM, names start with the property ID: `AS1` to `AS7`. `AS8` is a device check at the end of `docs/probe-checklist.md`.
