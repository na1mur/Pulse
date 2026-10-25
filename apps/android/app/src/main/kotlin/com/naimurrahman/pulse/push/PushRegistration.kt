package com.naimurrahman.pulse.push

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessagingService

/**
 * FCM client setup, optional at runtime (D-23). There is no google-services.json and no secret in
 * the repo: the options are built in code. The values below are dummies for the T0.7 size spike;
 * a self-hoster's real values will come from the server's push configuration, and without them
 * the app simply does not initialise Firebase and raises every notification on the device.
 */
object PushRegistration {
    fun initialize(context: Context) {
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        val options =
            FirebaseOptions
                .Builder()
                .setApplicationId("1:000000000000:android:0000000000000000")
                .setApiKey("dummy-api-key-t0-7")
                .setProjectId("pulse-spike")
                .setGcmSenderId("000000000000")
                .build()
        FirebaseApp.initializeApp(context, options)
    }
}

/** Receives FCM tokens and messages. Spike scope: it only exists so the push path is linked in. */
class PulseMessagingService : FirebaseMessagingService() {
    // Firebase marks the one-argument callback deprecated in Java but still delivers tokens through
    // it; lint requires an override, and registering the token with the server is NOTIF-04.
    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onNewToken(token: String) {
        super.onNewToken(token)
    }
}
