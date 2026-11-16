package app.outage.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes

/** Creates every notification channel. Idempotent: called at app start and again before the alarm layer posts. */
object ChannelSetup {
    /**
     * https://developer.android.com/reference/android/app/NotificationManager#createNotificationChannel(android.app.NotificationChannel)
     * https://developer.android.com/reference/android/app/NotificationChannel#setSound(android.net.Uri,%20android.media.AudioAttributes)
     */
    fun ensure(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        for (spec in ChannelSpecs.all) {
            if (nm.getNotificationChannel(spec.id) != null) continue
            val ch = NotificationChannel(spec.id, ctx.getString(spec.nameRes), spec.importance)
            ch.enableVibration(spec.vibrate)
            if (!spec.sound) {
                val attrs = if (spec.alarmUsage) {
                    AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
                } else null
                ch.setSound(null, attrs)
            }
            nm.createNotificationChannel(ch)
        }
    }
}
