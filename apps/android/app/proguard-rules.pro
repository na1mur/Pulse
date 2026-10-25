# R8 rules for the release build (minify + shrink, T0.7).

# The UniFFI bindings call the Rust library through JNA, which reads the Library interface,
# Structure fields and Callback methods by reflection and JNI; R8 must not rename or remove them.
-dontwarn java.awt.*
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.** { public *; }
-keep class com.naimurrahman.pulse.core.ffi.** { *; }
