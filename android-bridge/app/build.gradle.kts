plugins {
    id("com.android.application")
}

android {
    namespace = "com.ultron.bridge"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ultron.bridge"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
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
    implementation("org.java-websocket:Java-WebSocket:1.5.7")
}
