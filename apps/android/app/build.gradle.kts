import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.detekt)
}

// ---- The Rust core through UniFFI (docs/ARCHITECTURE.md sections 1 and 5, T0.7) ----
//
// crates/core-ffi is built twice, by cargo (rustup picks the pinned toolchain):
//  - for the host (debug), once: the bindgen tool turns that library's embedded metadata into the
//    Kotlin bindings (generated into build/, never committed), and the JVM unit tests load the
//    same library through JNA, so the binding wrapper is tested against the real core;
//  - for Android arm64-v8a through cargo-ndk, per variant: the .so that goes into the APK.
// Prerequisites (not installed by Gradle): rustup, `cargo install cargo-ndk --locked`, and the NDK
// pinned below (installed through the Android SDK manager).

val repoRoot: File = rootDir.resolve("../..").canonicalFile
val cargoTargetDir: File =
    System.getenv("CARGO_TARGET_DIR")?.let(::File) ?: repoRoot.resolve("target")
val ffiCrate = "pulse-core-ffi"
val ffiLibrary = "pulse_core_ffi"

// The APK carries one ABI: 64-bit ARM (spec 9.3 and section 11). `-Ppulse.abi=x86_64` builds for an
// x86_64 emulator instead (needs `rustup target add x86_64-linux-android`); never ship that one.
val apkAbi: String = providers.gradleProperty("pulse.abi").getOrElse("arm64-v8a")

abstract class CargoNdkBuild
@Inject
constructor(private val exec: ExecOperations) :
    DefaultTask() {
    @get:Internal
    abstract val repoRoot: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val rustSources: ConfigurableFileCollection

    @get:Input
    abstract val release: Property<Boolean>

    @get:Input
    abstract val abi: Property<String>

    @get:Input
    abstract val minSdk: Property<Int>

    @get:Input
    abstract val crate: Property<String>

    @get:Internal
    abstract val ndkDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun build() {
        val args =
            mutableListOf(
                "cargo", "ndk", "-t", abi.get(), "-P", minSdk.get().toString(),
                "-o", outputDir.get().asFile.absolutePath, "build", "--locked", "-p", crate.get(),
            )
        if (release.get()) args += "--release"
        exec.exec {
            workingDir = repoRoot.get().asFile
            environment("ANDROID_NDK_HOME", ndkDirectory.get().asFile.absolutePath)
            commandLine(args)
        }
    }
}

abstract class GenerateKotlinBindings
@Inject
constructor(private val exec: ExecOperations) :
    DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val hostLibrary: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val bindgenTool: RegularFileProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val config: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun generate() {
        outputDir.get().asFile.deleteRecursively()
        exec.exec {
            commandLine(
                bindgenTool.get().asFile.absolutePath, "generate",
                "--library", hostLibrary.get().asFile.absolutePath,
                "--config", config.get().asFile.absolutePath,
                "--language", "kotlin",
                "--out-dir", outputDir.get().asFile.absolutePath,
                "--no-format",
            )
        }
    }
}

// Always runs (no declared outputs); cargo's own incremental check makes a no-op build cheap.
val cargoBuildHost by tasks.registering(Exec::class) {
    group = "rust"
    description = "Builds the UniFFI library and the binding generator for the host (debug)."
    workingDir = repoRoot
    commandLine("cargo", "build", "--locked", "-p", ffiCrate, "--features", "bindgen")
}

val generateCoreBindings by tasks.registering(GenerateKotlinBindings::class) {
    group = "rust"
    description = "Generates the Kotlin bindings of crates/core-ffi into build/generated."
    dependsOn(cargoBuildHost)
    val exe = if (System.getProperty("os.name").startsWith("Windows")) ".exe" else ""
    hostLibrary = cargoTargetDir.resolve("debug/" + System.mapLibraryName(ffiLibrary))
    bindgenTool = cargoTargetDir.resolve("debug/uniffi-bindgen$exe")
    config = repoRoot.resolve("crates/core-ffi/uniffi.toml")
    outputDir = layout.buildDirectory.dir("generated/uniffi/kotlin")
}

android {
    // The Kotlin package and R class namespace. Kotlin package names have no underscores
    // (ktlint package-name, detekt PackageNaming); unlike the applicationId it can change freely.
    namespace = "com.naimurrahman.pulse"
    compileSdk = 37
    // The NDK cargo-ndk links with; the one the SDK manager installs for this project.
    ndkVersion = "27.1.12297006"

    defaultConfig {
        // D-26: fixed once released; changing it breaks updates and leaves app data behind.
        applicationId = "com.naimur_rahman.pulse"
        minSdk = 26
        targetSdk = 37
        // Release versioning and signing arrive with the release pipeline (T0.7, MOB-05).
        versionCode = 1
        versionName = "0.0.0"

        ndk { abiFilters += apkAbi }
    }

    buildTypes {
        release {
            // R8 full mode and resource shrinking: the size budget is measured on this build.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        compose = true
        // The applicationId guard test reads BuildConfig.APPLICATION_ID.
        buildConfig = true
    }

    testOptions {
        unitTests.all { test ->
            // The binding wrapper test loads the host build of the Rust library through JNA.
            test.dependsOn(cargoBuildHost)
            test.systemProperty("jna.library.path", cargoTargetDir.resolve("debug").absolutePath)
        }
    }

    lint {
        // Every Android Lint warning fails the build.
        warningsAsErrors = true
        abortOnError = true
        // These two report "a newer version exists", so their result depends on the day the
        // build runs rather than on the code; dependency updates are a separate job (T0.3).
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion")
        // The APK is 64-bit ARM only by decision (spec section 11): no x86_64 for ChromeOS.
        disable += "ChromeOsAbiSupport"
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.kotlin?.addGeneratedSourceDirectory(
            generateCoreBindings,
            GenerateKotlinBindings::outputDir,
        )
        val taskName = "cargoNdk${variant.name.replaceFirstChar(Char::uppercase)}"
        val cargoNdk =
            tasks.register<CargoNdkBuild>(taskName) {
                group = "rust"
                description = "Builds libpulse_core_ffi.so for $apkAbi (${variant.name})."
                repoRoot = rootProject.layout.projectDirectory.dir("../..")
                ndkDirectory = androidComponents.sdkComponents.ndkDirectory
                rustSources.from(
                    fileTree(repoRoot) {
                        include("crates/**/*.rs", "crates/**/Cargo.toml", "crates/**/uniffi.toml")
                        include("Cargo.toml", "Cargo.lock", "rust-toolchain.toml")
                        exclude("**/target/**")
                    },
                )
                release = variant.buildType == "release"
                abi = apkAbi
                minSdk = android.defaultConfig.minSdk ?: 26
                crate = ffiCrate
                outputDir = layout.buildDirectory.dir("generated/jniLibs/${variant.name}")
            }
        variant.sources.jniLibs?.addGeneratedSourceDirectory(cargoNdk, CargoNdkBuild::outputDir)
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
    // The UniFFI Kotlin bindings call the Rust library through JNA; Android needs the aar form.
    implementation("${libs.jna.get()}@aar")
    // FCM client only; initialised in code with explicit options, never from google-services.json.
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
    // The JVM form of JNA for the unit tests (the aar's classes.jar has no desktop natives).
    testImplementation(libs.jna)
}
