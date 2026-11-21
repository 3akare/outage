# Outage Android app

Native Kotlin app (ADR 0012). This folder holds the app shell (spec `app-shell`): Home, navigation, Settings with Delete my data, theme, icon and string pack. Feature specs plug their screens into it.

## Build and test

From the repository root, in the Kiro Web sandbox:

```
.kiro/scripts/android-sandbox.sh gradle android/outage --console=plain :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

On a normal machine (JDK 17, Android SDK 36): `cd android/outage && ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`. CI runs the same in the `app` job of `.github/workflows/android.yml` and uploads `outage-app-debug`.

## Layout

| Package | Content |
|---|---|
| `app.outage.shell` | Pure Kotlin, no Android imports: `Route`, `Router`, `Routes`, `HomeReducer`, `StatusStyle`, `DeleteRegistry`. Plus the SharedPreferences stores and `ShellGraph`. |
| `app.outage.ui` | Compose screens, theme, `FeatureRegistry`, view models. No literal user text: all text is in `res/values/strings.xml`. |
| `app.outage.sensor` | The charging sensor (ADR 0032, ADR 0033): pure state machine and decision table, SQLite outbox, `SensorService` (foreground receiver, primary), `ChargingJobService` (backup), `BootReceiver`. Starts after first run and on app resume. |
| `app.outage.net` | Uploader, the real HTTP transport to `BuildConfig.API_BASE` (register, events, delete) and the sensor outbox adapter that adds the cell. |
| `app.outage.alarm`, `log` | Small state types and interfaces the shell reads. Features fill them. |

## How a feature plugs in

In `OutageApp.onCreate`, call `graph.features.register(key, titleRes, screen, deleteFn)`. Keys the shell knows: `onboarding`, `log`, `area`, `alarm`, and the Settings items (`alarm_settings`, `notifications`, `battery`, `followed_area`, `language`, `diagnostics`). Anything not registered shows "Coming soon". Register the server delete with `graph.deletes.registerServer(...)`. Replace `graph.sources` with a real `StatusSources` for Home.

## Deep links

A notification opens a screen with the intent extra `route`: `home`, `log`, `area`, `settings` or `feature:<key>`. Unknown values open Home.

## Dependencies

Only those in `.kiro/approved-dependencies.json`: Compose BOM (2026.06.01), Material 3, foundation, ui, activity-compose 1.12.4, lifecycle 2.10.0, JUnit 4. Newer lines need `compileSdk 37`, which `tech.md` does not allow yet.

## Tests

JUnit 4 on the JVM, names start with the property ID: `AS1` to `AS7`. `AS8` is a device check at the end of `docs/probe-checklist.md`.

## Sensor (sensor-android, station-mode)

The first-run button records consent, asks for notifications (API 33 and up) and starts the sensor. After that each app open makes sure it runs (a visible app may start the foreground service). The receiver in `SensorService` is the primary path; `ChargingJobService` is the backup. Settings has two sensor screens, both in `ui/SensorSetupScreens.kt`:

- **Power sensor**: one switch. Off stops the sensor and it stays off until switched on.
- **Battery setup**: shows whether Outage is exempt from battery optimisation, a button for the system prompt, and the maker's steps from `oem-guide.json`.

The same service runs on every phone (ADR 0032). Unplug at 100%, Doze, maker restrictions and reboot recovery are in the Station section of `docs/probe-checklist.md`. The event `source` field stays on the phone until the Worker schema carries it (ADR 0034).
