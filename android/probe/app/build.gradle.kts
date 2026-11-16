plugins {
    id("com.android.application")
}

android {
    namespace = "app.outage.probe"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.outage.probe"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.0.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // JUnit 4 is approved by ADR 0012. No other library: the probe uses platform classes only.
    testImplementation("junit:junit:4.13.2")
}
