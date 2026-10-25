package com.naimurrahman.pulse

import org.junit.Assert.assertEquals
import org.junit.Test

class ApplicationIdTest {
    // D-26: the installed app is identified by this ID forever; changing it makes Android treat
    // the build as a different app, so updates fail and app data is left behind.
    @Test
    fun applicationIdIsTheReleasedIdentifier() {
        assertEquals("com.naimur_rahman.pulse", BuildConfig.APPLICATION_ID)
    }
}
