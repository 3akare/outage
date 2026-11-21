package app.outage.alarm

import android.content.Context
import app.outage.sensor.AndroidSensorClock
import app.outage.sensor.Sensor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * One alarm layer per process, built on demand by the sensor (to hear events), the notification receiver or the app.
 * Holds the Android adapters behind [AlarmCore]. No network class is reachable from here (L3).
 */
class AlarmHost private constructor(private val ctx: Context) {
    private val store: WakeStore = SqliteWakeStore(ctx)
    val lightAlarm = LightAlarm(ctx)
    private val prompts = PromptNotifier(ctx)

    // The label write takes the sensor lock, and the sensor calls this layer while holding it. Writing on another thread
    // keeps the two locks from being taken in opposite orders.
    private val io = Executors.newSingleThreadExecutor()

    val core = AlarmCore(store, AndroidSensorClock(ctx), object : AlarmEffects {
        override fun showPrompt(unplugSeq: Long) = prompts.show(unplugSeq)
        override fun removePrompt(unplugSeq: Long) = prompts.remove(unplugSeq)
        override fun queueLabel(unplugSeq: Long, answer: String) { io.execute { Sensor.get(ctx).queueLabel(unplugSeq, answer) } }
        override fun ring(unplugSeq: Long) = lightAlarm.ring(unplugSeq)
        override fun stopRing() = lightAlarm.stop()
    })

    /** Waits (up to 3 s) until queued label writes are done. The receiver calls it before `finish()`, with no lock held. */
    fun flush() {
        runCatching { io.submit {}.get(3, TimeUnit.SECONDS) }
    }

    /** What the Light Alarm row on Now shows (app-shell R2.5). Reads the wake store, so call it off the main thread. */
    fun state(): AlarmState = when {
        lightAlarm.isRinging() -> AlarmState.RINGING
        core.waiting() -> AlarmState.WAITING_FOR_POWER
        else -> AlarmState.OFF
    }

    /** The Settings "Test Light Alarm" button: the same ring path, marked as a test, nothing queued or sent. */
    fun testRing() = lightAlarm.ring(-1L, test = true)

    /** Delete-my-data (R4.3): wake requests and prompts. Labels not yet uploaded live in the sensor Outbox and go with it. */
    fun deleteAll() {
        lightAlarm.stop()
        store.clear()
    }

    companion object {
        @Volatile private var instance: AlarmHost? = null

        fun get(ctx: Context): AlarmHost = instance ?: synchronized(this) {
            instance ?: AlarmHost(ctx.applicationContext).also { instance = it }
        }
    }
}
