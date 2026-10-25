plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

android {
    // The Kotlin package and R class namespace. Kotlin package names have no underscores
    // (ktlint package-name, detekt PackageNaming); unlike the applicationId it can change freely.
    namespace = "com.naimurrahman.pulse"
    compileSdk = 37

    defaultConfig {
        // D-26: fixed once released; changing it breaks updates and leaves app data behind.
        applicationId = "com.naimur_rahman.pulse"
        minSdk = 26
        targetSdk = 37
        // Release versioning and signing arrive with the release pipeline (T0.7, MOB-05).
        versionCode = 1
        versionName = "0.0.0"
    }

    buildFeatures {
        compose = true
        // The applicationId guard test reads BuildConfig.APPLICATION_ID.
        buildConfig = true
    }

    lint {
        // Every Android Lint warning fails the build.
        warningsAsErrors = true
        abortOnError = true
        // These two report "a newer version exists", so their result depends on the day the
        // build runs rather than on the code; dependency updates are a separate job (T0.3).
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion")
    }
}

kotlin {
    jvmToolchain(17)
}

ktlint {
    version = libs.versions.ktlint.engine
}

detekt {
    // Detekt's default rules plus the Compose adjustments in config/detekt/detekt.yml.
    buildUponDefaultConfig = true
    config.setFrom(rootDir.resolve("config/detekt/detekt.yml"))
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.foundation)
    implementation(libs.activity.compose)

    testImplementation(libs.junit)
}
