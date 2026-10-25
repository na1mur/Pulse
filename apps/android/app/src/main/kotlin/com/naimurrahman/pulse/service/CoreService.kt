package com.naimurrahman.pulse.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.naimurrahman.pulse.R
import com.naimurrahman.pulse.core.CoreRuntime

/**
 * The foreground service that hosts the Rust core with no activity (MOB-02, spec section 8).
 * T0.7 spike scope: it starts the core, shows the persistent notification and idles; the realtime
 * connection, trackers and notification actions arrive with T3.7 and T6.5. It never takes a
 * wake lock and schedules no work, so nothing wakes the device while the screen is off.
 */
class CoreService : Service() {
    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.service_channel_name),
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14 requires the type declared in the manifest to be passed here too.
            startForeground(
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
        CoreRuntime.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        CoreRuntime.stop()
        super.onDestroy()
    }

    private fun buildNotification(): Notification = Notification
        .Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(getString(R.string.service_notification_title))
        .setContentText(getString(R.string.service_notification_text))
        .setOngoing(true)
        .setCategory(Notification.CATEGORY_SERVICE)
        .build()

    companion object {
        private const val CHANNEL_ID = "core"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            context.startForegroundService(Intent(context, CoreService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CoreService::class.java))
        }
    }
}
