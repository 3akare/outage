package app.outage.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.outage.R
import app.outage.alarm.AlarmHost
import app.outage.onboarding.AlarmCheck
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

    FeaturePage(R.string.alarm_title) {
        PageText(stringResource(R.string.alarm_screen_intro))
        Gap()
        ActionStack {
            InkButton(
                stringResource(if (testing) R.string.alarm_test_running else R.string.alarm_test_start),
                onClick = { testing = true; scheduleTest(ctx) { testing = false } },
                modifier = Modifier.fillMaxWidth(),
                busy = testing,
            )
            if (testing) FillButton(stringResource(R.string.alarm_test_stop), { cancelTest(ctx); testing = false }, Modifier.fillMaxWidth())
        }

        GroupHeader(stringResource(R.string.alarm_check_title))
        DayCard {
            AlarmCheck.items(facts).forEachIndexed { i, item ->
                if (i > 0) RowDivider(50.dp)
                val fix: Pair<Int, () -> Unit>? = if (item.ok) null else when (item.key) {
                    "notifications" -> R.string.alarm_check_fix_notifications to {
                        val perm = Permissions.notificationPermissionOrNull()
                        if (perm != null) askNotifications.launch(perm) else ctx.startActivity(Permissions.notificationSettingsIntent(ctx))
                    }
                    "fullscreen" -> R.string.alarm_check_fix_fullscreen to { ctx.startActivity(Permissions.fullScreenSettingsIntent(ctx)) }
                    "battery" -> R.string.alarm_check_fix_battery to onOpenBattery
                    else -> null
                }
                CheckRow(stringResource(item.textRes), item.ok, fix?.let { stringResource(it.first) }, fix?.second)
            }
        }
        GroupFooter(stringResource(R.string.alarm_reboot_note))
    }
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
    FeaturePage(R.string.perm_title) {
        PageText(stringResource(R.string.perm_notifications_reason))
        Gap()
        DayCard {
            CheckRow(stringResource(if (ok) R.string.alarm_check_notifications_ok else R.string.alarm_check_notifications_off), ok)
        }
        if (asked && !ok) GroupFooter(stringResource(R.string.perm_notifications_denied))
        if (!ok) {
            Gap()
            ActionStack {
                InkButton(
                    stringResource(if (asked) R.string.perm_open_settings else R.string.perm_notifications_button),
                    onClick = {
                        val perm = Permissions.notificationPermissionOrNull()
                        // After a refusal Android may not show the dialog again, so the system settings page is the way.
                        if (perm != null && !asked) ask.launch(perm) else ctx.startActivity(Permissions.notificationSettingsIntent(ctx))
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        Gap(20.dp)
        PageText(stringResource(R.string.perm_fullscreen_reason))
        Gap()
        DayCard {
            CheckRow(
                stringResource(if (fullScreen) R.string.alarm_check_fullscreen_ok else R.string.alarm_check_fullscreen_off), fullScreen,
                if (fullScreen) null else stringResource(R.string.perm_fullscreen_button),
                if (fullScreen) null else ({ ctx.startActivity(Permissions.fullScreenSettingsIntent(ctx)) }),
            )
        }
    }
}

