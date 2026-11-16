package app.outage.onboarding

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import app.outage.R

/** What the phone says about each thing the alarm needs (alerts-and-light-alarm R5.3, onboarding R6.5). */
data class AlarmCheckFacts(
    val notificationsOk: Boolean,
    val volumeOk: Boolean,
    val fullScreenOk: Boolean,
    val batteryExempt: Boolean,
    /** True once the phone has an install ID. Only a hint line; the alarm never needs it (R3). */
    val registered: Boolean,
)

/** One line of the Alarm check list: a green or a red line with the words to show. */
data class AlarmCheckItem(val key: String, val ok: Boolean, val textRes: Int)

/** Pure list builder for the Alarm check (task: "Alarm check list data"). Order is the order shown. */
object AlarmCheck {
    fun items(f: AlarmCheckFacts): List<AlarmCheckItem> = listOf(
        AlarmCheckItem("notifications", f.notificationsOk, if (f.notificationsOk) R.string.alarm_check_notifications_ok else R.string.alarm_check_notifications_off),
        AlarmCheckItem("volume", f.volumeOk, if (f.volumeOk) R.string.alarm_check_volume_ok else R.string.alarm_check_volume_zero),
        AlarmCheckItem("fullscreen", f.fullScreenOk, if (f.fullScreenOk) R.string.alarm_check_fullscreen_ok else R.string.alarm_check_fullscreen_off),
        AlarmCheckItem("battery", f.batteryExempt, if (f.batteryExempt) R.string.alarm_check_battery_ok else R.string.alarm_check_battery_off),
        AlarmCheckItem("registered", f.registered, R.string.alarm_check_not_registered).let { if (f.registered) null else it },
    ).filterNotNull()

    /** True when the alarm can make a sound: the volume is up. Everything else only changes how it shows. */
    fun canSound(f: AlarmCheckFacts): Boolean = f.volumeOk

    /** The facts the onboarding machine reads, taken from the same check. */
    fun toOnboardingFacts(f: AlarmCheckFacts) = OnboardingFacts(f.notificationsOk, f.fullScreenOk, f.batteryExempt)
}

/**
 * Reads the system facts and builds the intents (onboarding R6). Nothing here asks for a permission: Compose screens
 * launch the request when the user taps (permissions are asked in context, ADR 0030).
 */
object Permissions {
    /** Below Android 13 there is no runtime permission; notifications are on unless the user switched them off in Settings. */
    fun notificationsOk(ctx: Context): Boolean {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val enabled = nm?.areNotificationsEnabled() ?: true
        return if (Build.VERSION.SDK_INT >= 33) {
            enabled && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else enabled
    }

    /** https://developer.android.com/reference/android/app/NotificationManager#canUseFullScreenIntent() (API 34) */
    fun fullScreenOk(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 34) ctx.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: false else true

    /** The alarm stream volume above zero (R5.3). https://developer.android.com/reference/android/media/AudioManager#getStreamVolume(int) */
    fun volumeOk(ctx: Context): Boolean {
        val am = ctx.getSystemService(AudioManager::class.java) ?: return true
        return am.getStreamVolume(AudioManager.STREAM_ALARM) > 0
    }

    fun batteryExempt(ctx: Context): Boolean =
        ctx.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false

    fun facts(ctx: Context, registered: Boolean) =
        AlarmCheckFacts(notificationsOk(ctx), volumeOk(ctx), fullScreenOk(ctx), batteryExempt(ctx), registered)

    /** The system page for the full-screen permission (API 34), or the app's notification settings when it is not there. */
    fun fullScreenSettingsIntent(ctx: Context): Intent {
        val i = if (Build.VERSION.SDK_INT >= 34) {
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.packageName))
        } else {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        }
        return i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    fun notificationSettingsIntent(ctx: Context): Intent =
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** `POST_NOTIFICATIONS` exists from API 33. Null below that: nothing to ask. */
    fun notificationPermissionOrNull(): String? = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
}
