// AGP 9.2.1 has built-in Kotlin, so no Kotlin plugin is applied.
// https://developer.android.com/build/releases/agp-9-2-0-release-notes
// https://developer.android.com/build/migrate-to-built-in-kotlin
plugins {
    id("com.android.application") version "9.2.1" apply false
}
