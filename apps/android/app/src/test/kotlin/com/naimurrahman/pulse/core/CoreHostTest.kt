package com.naimurrahman.pulse.core

import com.naimurrahman.pulse.core.ffi.CoreException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

// These tests load the host build of crates/core-ffi through JNA (see app/build.gradle.kts), so
// they exercise the real generated bindings and the real Rust core, not a fake.
class CoreHostTest {
    @Test
    fun startedCoreReportsAMajorMinorPatchVersion() {
        CoreHost.start().use { host ->
            assertTrue(host.version, Regex("""\d+\.\d+\.\d+""").matches(host.version))
        }
    }

    @Test
    fun localDayUsesTheGivenZoneNotUtc() {
        CoreHost.start().use { host ->
            // 2026-03-01T20:00:00Z is already 02:00 on 2026-03-02 in Dhaka (UTC+6).
            assertEquals("2026-03-01", host.localDay(1_772_395_200, "UTC"))
            assertEquals("2026-03-02", host.localDay(1_772_395_200, "Asia/Dhaka"))
        }
    }

    @Test
    fun unknownZoneCrossesTheBoundaryAsATypedException() {
        CoreHost.start().use { host ->
            val error =
                assertThrows(CoreException.UnknownTimeZone::class.java) {
                    host.localDay(0, "Mars/Olympus")
                }
            assertEquals("Mars/Olympus", error.name)
        }
    }

    @Test
    fun runtimeStartsTheCoreOnceAndDropsItOnStop() {
        assertNull(CoreRuntime.current())

        val first = CoreRuntime.start()
        assertTrue(first === CoreRuntime.start())
        assertTrue(first === CoreRuntime.current())

        CoreRuntime.stop()
        assertNull(CoreRuntime.current())
    }
}
