// AGP 9.2.1 has built-in Kotlin, so no Kotlin plugin is applied.
// https://developer.android.com/build/releases/agp-9-2-0-release-notes
// https://developer.android.com/build/migrate-to-built-in-kotlin
//
// Jetpack Compose compiler: with Kotlin 2.x it is the Gradle plugin org.jetbrains.kotlin.plugin.compose,
// and its version must equal the Kotlin version in use.
// https://developer.android.com/develop/ui/compose/compiler
// AGP 9.2.1 depends at runtime on kotlin-gradle-plugin 2.2.10
// (https://dl.google.com/android/maven2/com/android/tools/build/gradle/9.2.1/gradle-9.2.1.pom), so the plugin is 2.2.10.
plugins {
    id("com.android.application") version "9.2.1" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" apply false
    // Firebase config plugin (ADR 0036). Declared here, applied in app/build.gradle.kts only when the Firebase config file exists.
    // https://firebase.google.com/docs/android/setup
    id("com.google.gms.google-services") version "4.6.0" apply false
}
