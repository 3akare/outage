plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.outage"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.outage"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // Pidgin (values-pcm) is optional and falls back to English per key (app-shell R7.2),
        // so a key missing from values-pcm is not an error. AS7 checks the opposite direction.
        disable += "MissingTranslation"
    }
}

dependencies {
    // Compose BOM pins the Compose library versions together.
    // https://developer.android.com/develop/ui/compose/bom (2026.06.01 is the newest stable in
    // https://dl.google.com/android/maven2/androidx/compose/compose-bom/maven-metadata.xml)
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")

    // ComponentActivity.setContent, ViewModel and lifecycle bridges for Compose.
    // https://developer.android.com/develop/ui/compose/setup
    // Newest stable lines that compile against compileSdk 36 (activity 1.13 and lifecycle 2.11 need 37). Versions in https://dl.google.com/android/maven2/androidx/<group>/<artifact>/maven-metadata.xml
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")

    // JUnit 4 is approved by ADR 0012.
    testImplementation("junit:junit:4.13.2")
}
