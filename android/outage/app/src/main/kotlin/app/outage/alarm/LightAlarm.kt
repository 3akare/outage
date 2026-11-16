package app.outage.alarm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import app.outage.MainActivity
import app.outage.R

/**
 * Rings the Light Alarm (alerts-and-light-alarm R3, design 3.3). Three layers, most reliable first:
 * 1. alarm audio played directly with the alarm usage, which needs no notification permission;
 * 2. an alarm-category notification on `light-alarm` with a Stop action;
 * 3. a full-screen intent, only if the system allows it.
 * It uses no network and no upload class. A partial wake lock is held for at most the maximum ring time.
 * https://developer.android.com/reference/android/media/MediaPlayer#setAudioAttributes(android.media.AudioAttributes)
 * https://developer.android.com/reference/android/media/RingtoneManager#TYPE_ALARM
 * https://developer.android.com/reference/android/app/Notification#CATEGORY_ALARM
 * https://developer.android.com/reference/android/os/PowerManager#newWakeLock(int,%20java.lang.String)
 * https://developer.android.com/reference/android/app/NotificationManager#canUseFullScreenIntent() (API 34)
 */
class LightAlarm(private val ctx: Context) {
    private val main = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val autoStop = Runnable { stopSound() }

    /** [test] rings the same path with the "Test" text and nothing sent anywhere (R9). */
    @Synchronized
    fun ring(unplugSeq: Long, test: Boolean = false) {
        ChannelSetup.ensure(ctx)
        acquireWakeLock()
        startSound()
        vibrate()
        postNotification(test)
        main.removeCallbacks(autoStop)
        main.postDelayed(autoStop, AlarmLimits.MAX_RING_MS)
    }

    /** Stops sound and vibration and removes the notification (R4.4). Never restarts. */
    @Synchronized
    fun stop() {
        main.removeCallbacks(autoStop)
        stopSound()
        ctx.getSystemService(NotificationManager::class.java)?.cancel(TAG, NOTIFICATION_ID)
    }

    private fun startSound() {
        stopPlayer()
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        player = try {
            MediaPlayer().apply {
                setAudioAttributes(attrs)
                setDataSource(ctx, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            // R3.5 and design 7: fall back to the bundled sound when the system sound cannot be resolved.
            runCatching {
                MediaPlayer.create(ctx, R.raw.light_alarm_fallback, attrs, android.media.AudioManager.AUDIO_SESSION_ID_GENERATE)?.apply {
                    isLooping = true
                    start()
                }
            }.getOrNull()
        }
    }

    private fun stopPlayer() {
        player?.let { p -> runCatching { p.stop() }; runCatching { p.release() } }
        player = null
    }

    private fun stopSound() {
        stopPlayer()
        ctx.getSystemService(Vibrator::class.java)?.cancel()
        wakeLock?.let { if (it.isHeld) runCatching { it.release() } }
        wakeLock = null
    }

    private fun acquireWakeLock() {
        val pm = ctx.getSystemService(PowerManager::class.java) ?: return
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "outage:light-alarm").apply { acquire(AlarmLimits.MAX_RING_MS) }
    }

    private fun vibrate() {
        val v = ctx.getSystemService(Vibrator::class.java) ?: return
        if (!v.hasVibrator()) return
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
        // https://developer.android.com/reference/android/os/Vibrator#vibrate(android.os.VibrationEffect,%20android.media.AudioAttributes)
        @Suppress("DEPRECATION")
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 400), 0), attrs)
    }

    private fun postNotification(test: Boolean) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        if (!nm.areNotificationsEnabled()) return // the audio layer still rings (R3.5)
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getBroadcast(
            ctx, 99, Intent(ctx, NotificationActionReceiver::class.java).setAction(NotificationActionReceiver.ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val b = Notification.Builder(ctx, ChannelSpecs.LIGHT_ALARM)
            .setSmallIcon(R.drawable.ic_sensor_armed)
            .setContentTitle(ctx.getString(if (test) R.string.alarm_test_title else R.string.alarm_ring_title))
            .setContentText(ctx.getString(if (test) R.string.alarm_test_body else R.string.alarm_ring_body))
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, ctx.getString(R.string.alarm_ring_stop), stop).build())
        // R3.9: a full-screen view only where the system allows it for this app (Android 14 limits it to alarm and calling apps).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || nm.canUseFullScreenIntent()) b.setFullScreenIntent(open, true)
        nm.notify(TAG, NOTIFICATION_ID, b.build())
    }

    companion object {
        const val TAG = "light-alarm"
        const val NOTIFICATION_ID = 7001
    }
}
