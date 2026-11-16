package app.outage.freezer

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.app.Notification
import app.outage.MainActivity
import app.outage.R
import app.outage.log.LogStores
import java.time.LocalTime

/**
 * Freezer Guard on `AlarmManager` (power-log R6, design section 6).
 *
 * Inexact by default: `setAndAllowWhileIdle` on the monotonic clock, so it fires in Doze and can arrive late (R6.5).
 * Exact only when the user asked for it and the system allows it: `SCHEDULE_EXACT_ALARM` is granted by the user in
 * "Alarms & reminders" and can be revoked, so [canScheduleExact] is checked every time. `USE_EXACT_ALARM` is not used:
 * it is granted without a prompt and is limited to alarm-clock and calendar apps.
 * https://developer.android.com/develop/background-work/services/alarms/schedule#exact-permission-declare
 * https://developer.android.com/reference/android/app/AlarmManager#canScheduleExactAlarms()
 * https://developer.android.com/reference/android/app/AlarmManager#setAndAllowWhileIdle(int,%20long,%20android.app.PendingIntent)
 * https://developer.android.com/reference/android/app/AlarmManager#setExactAndAllowWhileIdle(int,%20long,%20android.app.PendingIntent)
 */
class AndroidFreezerAlarms(private val context: Context) : FreezerAlarms {
    private val manager get() = context.getSystemService(AlarmManager::class.java)

    private fun pending(): PendingIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_CODE,
        Intent(context, FreezerReceiver::class.java).setAction(ACTION),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    override fun canScheduleExact(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager?.canScheduleExactAlarms() == true

    override fun schedule(delayMs: Long, exact: Boolean) {
        val am = manager ?: return
        val at = SystemClock.elapsedRealtime() + delayMs
        val pi = pending()
        try {
            if (exact && canScheduleExact()) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
            }
        } catch (_: SecurityException) {
            // Exact access was revoked between the check and the call: fall back to inexact.
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi)
        }
    }

    override fun cancel() {
        manager?.cancel(pending())
    }

    companion object {
        const val ACTION = "app.outage.FREEZER_GUARD"
        private const val REQUEST_CODE = 7101
    }
}

/** Fires when the Freezer Guard limit is reached. Reads the log database, so it needs no running app (R6.9). */
class FreezerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != AndroidFreezerAlarms.ACTION) return
        val pending = goAsync()
        Thread {
            try {
                val guard = FreezerGuard(LogStores.get(context), AndroidFreezerAlarms(context))
                val (open, settings) = guard.takeAlert() ?: return@Thread
                val now = System.currentTimeMillis()
                FreezerNotifier.show(context, FreezerRules.hoursOff(open, now, settings), settings)
            } finally {
                pending.finish()
            }
        }.start()
    }
}

object FreezerNotifier {
    const val CHANNEL = "freezer-guard"
    const val CHANNEL_QUIET = "freezer-guard-quiet"
    private const val NOTIFICATION_ID = 7102

    /**
     * A normal high-importance notification, not the Light Alarm. In quiet hours it uses the silent channel unless the
     * user allowed sound (R6.7). Without notification permission nothing shows; Home and Settings still say so.
     * https://developer.android.com/develop/ui/views/notifications/channels
     */
    fun show(context: Context, hours: Int, settings: FreezerSettings) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.freezer_channel), NotificationManager.IMPORTANCE_HIGH),
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_QUIET, context.getString(R.string.freezer_channel_quiet), NotificationManager.IMPORTANCE_LOW).apply {
                setSound(null, null)
                enableVibration(false)
            },
        )
        val now = LocalTime.now()
        val silent = FreezerRules.silent(settings, now.hour * 60 + now.minute)
        val open = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(context, if (silent) CHANNEL_QUIET else CHANNEL)
            .setSmallIcon(R.drawable.ic_sensor_armed)
            .setContentTitle(context.getString(R.string.freezer_alert_title))
            .setContentText(context.resources.getQuantityString(R.plurals.freezer_alert_body, hours, hours))
            .setCategory(Notification.CATEGORY_STATUS)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIFICATION_ID, n)
    }
}
