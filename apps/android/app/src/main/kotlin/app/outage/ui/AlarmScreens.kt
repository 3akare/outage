package app.outage.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.outage.R
import app.outage.alarm.AlarmHost
import app.outage.onboarding.AlarmCheck
import app.outage.onboarding.AlarmCheckFacts
import app.outage.onboarding.Permissions

private const val TEST_DELAY_MS = 5_000L

/**
 * Settings, "Light Alarm settings" (alerts-and-light-alarm R5): the Test Light Alarm button and the Alarm check list.
 * The test rings the same path as the real alarm after 5 seconds and creates no event, label or server data (R5.2).
 * The check list re-reads the phone each time the screen comes back from a system page.
 */
@Composable
fun AlarmSettingsScreen(registered: () -> Boolean, onOpenBattery: () -> Unit) {
    val ctx = LocalContext.current
    var facts by remember { mutableStateOf(Permissions.facts(ctx, registered())) }
    var testing by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { facts = Permissions.facts(ctx, registered()) }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        facts = Permissions.facts(ctx, registered())
    }

    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.alarm_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.alarm_screen_intro), style = MaterialTheme.typography.bodyLarge)

        Button(
            onClick = { testing = true; scheduleTest(ctx) { testing = false } },
            enabled = !testing,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) { Text(stringResource(if (testing) R.string.alarm_test_running else R.string.alarm_test_start)) }
        if (testing) {
            OutlinedButton(
                onClick = { cancelTest(ctx); testing = false },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.alarm_test_stop)) }
        }

        Text(stringResource(R.string.alarm_check_title), style = MaterialTheme.typography.titleMedium)
        AlarmCheck.items(facts).forEach { item ->
            val text = stringResource(item.textRes)
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = text }, verticalAlignment = Alignment.CenterVertically) {
                Text(if (item.ok) "\u2713  " else "!  ", color = if (item.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                Text(text, style = MaterialTheme.typography.bodyLarge)
            }
            if (!item.ok) {
                when (item.key) {
                    "notifications" -> FixButton(R.string.alarm_check_fix_notifications) {
                        val perm = Permissions.notificationPermissionOrNull()
                        if (perm != null) askNotifications.launch(perm) else ctx.startActivity(Permissions.notificationSettingsIntent(ctx))
                    }
                    "fullscreen" -> FixButton(R.string.alarm_check_fix_fullscreen) { ctx.startActivity(Permissions.fullScreenSettingsIntent(ctx)) }
                    "battery" -> FixButton(R.string.alarm_check_fix_battery, onOpenBattery)
                }
            }
        }
        Text(stringResource(R.string.alarm_reboot_note), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun FixButton(textRes: Int, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) { Text(stringResource(textRes)) }
}

private val handler = Handler(Looper.getMainLooper())
private var pending: Runnable? = null

private fun scheduleTest(ctx: Context, done: () -> Unit) {
    val app = ctx.applicationContext
    val r = Runnable {
        AlarmHost.get(app).testRing()
        done()
    }
    pending?.let(handler::removeCallbacks)
    pending = r
    handler.postDelayed(r, TEST_DELAY_MS)
}

private fun cancelTest(ctx: Context) {
    pending?.let(handler::removeCallbacks)
    pending = null
    AlarmHost.get(ctx.applicationContext).lightAlarm.stop()
}

/**
 * Settings, "Notifications" (onboarding R6): the notification permission with a one-sentence reason, and the lock-screen
 * setting when the phone limits it. Asked here, in context, and not at first run beyond the one button (ADR 0030).
 * A denial is explained and nothing else changes (R6.6).
 */
@Composable
fun PermissionsScreen() {
    val ctx = LocalContext.current
    var ok by remember { mutableStateOf(Permissions.notificationsOk(ctx)) }
    var fullScreen by remember { mutableStateOf(Permissions.fullScreenOk(ctx)) }
    var asked by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        ok = Permissions.notificationsOk(ctx)
        fullScreen = Permissions.fullScreenOk(ctx)
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        ok = Permissions.notificationsOk(ctx)
        asked = true
    }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(stringResource(R.string.perm_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.perm_notifications_reason), style = MaterialTheme.typography.bodyLarge)
        Text(stringResource(if (ok) R.string.alarm_check_notifications_ok else R.string.alarm_check_notifications_off))
        if (!ok) {
            Button(
                onClick = {
                    val perm = Permissions.notificationPermissionOrNull()
                    // After a refusal Android may not show the dialog again, so the system settings page is the way.
                    if (perm != null && !asked) ask.launch(perm) else ctx.startActivity(Permissions.notificationSettingsIntent(ctx))
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(stringResource(if (asked) R.string.perm_open_settings else R.string.perm_notifications_button)) }
            if (asked) Text(stringResource(R.string.perm_notifications_denied), style = MaterialTheme.typography.bodyMedium)
        }
        Text(stringResource(R.string.perm_fullscreen_reason), style = MaterialTheme.typography.bodyLarge)
        Text(stringResource(if (fullScreen) R.string.alarm_check_fullscreen_ok else R.string.alarm_check_fullscreen_off))
        if (!fullScreen) {
            OutlinedButton(
                onClick = { ctx.startActivity(Permissions.fullScreenSettingsIntent(ctx)) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(stringResource(R.string.perm_fullscreen_button)) }
        }
    }
}
