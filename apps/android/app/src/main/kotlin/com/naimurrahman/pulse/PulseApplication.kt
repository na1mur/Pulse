package com.naimurrahman.pulse

import android.app.Application
import com.naimurrahman.pulse.push.PushRegistration

class PulseApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // T0.7 spike: initialised eagerly so the cold-start figure includes the FCM client.
        PushRegistration.initialize(this)
    }
}
