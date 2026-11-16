package app.outage.probe

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * M9: can alarm audio start from the job process on replug, with the screen off and the app swiped away?
 * The tester arms it in the app; the next JOB_START plays the default alarm sound for 10 seconds.
 * Audio uses the alarm usage (https://developer.android.com/reference/android/media/AudioAttributes#USAGE_ALARM).
 */
object AlarmTest {
    private const val RING_MS = 10_000L
    private var player: MediaPlayer? = null

    fun arm(ctx: Context) {
        Prefs(ctx).alarmArmed = true
        ProbeLog.get(ctx).append("ALARM_TEST", mapOf("phase" to "ARMED"))
    }

    fun onReplug(ctx: Context, jobStartMono: Long) {
        val prefs = Prefs(ctx)
        if (!prefs.alarmArmed) return
        prefs.alarmArmed = false
        val log = ProbeLog.get(ctx)
        val plugMono = log.recent(50).firstOrNull { it.kind == "PLUG" && it.fields["action"] == "CONNECTED" }?.monoMs
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            val mp = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(ctx.applicationContext, uri)
                isLooping = true
                prepare()
                start()
            }
            player = mp
            val started = SystemClock.elapsedRealtime()
            log.append("ALARM_TEST", mapOf("phase" to "RANG", "delayMs" to (plugMono?.let { started - it }), "jobToAudioMs" to (started - jobStartMono), "error" to null))
            Handler(Looper.getMainLooper()).postDelayed({ stop(ctx) }, RING_MS)
        } catch (e: Exception) {
            log.append("ALARM_TEST", mapOf("phase" to "NO_AUDIO", "delayMs" to null, "error" to "${e.javaClass.simpleName}: ${e.message}".take(300)))
        }
    }

    fun stop(ctx: Context) {
        val mp = player ?: return
        player = null
        runCatching { mp.stop() }
        mp.release()
        ProbeLog.get(ctx).append("ALARM_TEST", mapOf("phase" to "STOPPED"))
    }
}
