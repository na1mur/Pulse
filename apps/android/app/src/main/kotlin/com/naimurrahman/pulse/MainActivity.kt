package com.naimurrahman.pulse

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.naimurrahman.pulse.core.CoreRuntime
import com.naimurrahman.pulse.service.CoreService

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Granted or not, the service runs; without the permission the notification is only
        // listed in the system's foreground-service manager.
        if (needsNotificationPermission()) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        }
        // T0.7 spike: the screen starts the service so the core outlives the activity. The real
        // trigger is "a session is running or tracking is enabled" (MOB-02).
        CoreService.start(this)
        setContent { PulseApp() }
    }

    private fun needsNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
}

// Hello screen for the T0.7 spike; real screens, the theme and ViewModels come with T1.12.
@Composable
private fun PulseApp() {
    // Idempotent. Spike stand-in: the screen starts the core itself;
    // in the real app the service owns the core's lifetime (MOB-02).
    val summary =
        remember {
            val core = CoreRuntime.start()
            val today = core.localDay(core.nowEpochSeconds(), "Asia/Dhaka")
            "core ${core.version}, today in Asia/Dhaka: $today"
        }
    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BasicText(text = stringResource(R.string.app_name))
        BasicText(text = summary)
    }
}
