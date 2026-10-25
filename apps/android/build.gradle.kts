buildscript {
    dependencies {
        // AGP 9's built-in Kotlin would otherwise use the Kotlin Gradle plugin it bundles (2.2.10);
        // this pins the catalog's Kotlin version (developer.android.com/build/releases, AGP 9.0).
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.compose.compiler) apply false
    alias(libs.plugins.detekt) apply false
    // Applied here too so ktlintCheck also covers this project's own *.gradle.kts files.
    alias(libs.plugins.ktlint)
}

ktlint {
    version = libs.versions.ktlint.engine
}
