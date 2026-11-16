package app.outage.sensor

/**
 * The result of the onboarding self-test (onboarding R8.2, design section 6). `removalSeen` and `returnSeen` come from
 * either driver (the foreground receiver or the job). `jobDelayMs` is the largest lag between the foreground plug change
 * and the matching job callback, or null when the job reported nothing. Stays on the phone (R8.7); never an Outbox event.
 */
data class SelfTestResult(
    val removalSeen: Boolean,
    val sensorArmed: Boolean,
    val returnSeen: Boolean,
    val jobDelayMs: Long?,
) {
    /** Compact form for the sensor state row. */
    fun encode(): String = listOf(removalSeen, sensorArmed, returnSeen, jobDelayMs ?: "").joinToString(",")

    companion object {
        fun decode(s: String?): SelfTestResult? {
            val p = s?.split(",") ?: return null
            if (p.size != 4) return null
            return SelfTestResult(p[0].toBoolean(), p[1].toBoolean(), p[2].toBoolean(), p[3].toLongOrNull())
        }
    }
}

/**
 * Pure recorder for one self-test run. While it exists the controller sends it every input and appends nothing, so no
 * event reaches the Outbox, a listener, the prompt or the alarm (O6).
 */
class SelfTestRun(val sensorArmed: Boolean) {
    private var removalSeen = false
    private var returnSeen = false
    private var removalAt: Long? = null
    private var returnAt: Long? = null
    private var jobStopAt: Long? = null
    private var jobStartAt: Long? = null

    /** The app's foreground plug receiver (instant feedback). */
    fun plugChanged(plug: Plug, nowMs: Long) {
        if (!plug.detection) {
            removalSeen = true
            if (removalAt == null) removalAt = nowMs
        } else {
            returnSeen = true
            if (returnAt == null) returnAt = nowMs
        }
    }

    /** A driver input with the plug facts at that moment. Inputs that are not plug changes are ignored. */
    fun record(input: Input, facts: Facts, nowMs: Long) {
        when (input) {
            Input.PowerDisconnected -> if (!facts.plug.detection) removalSeen = true
            is Input.JobStopped -> if (!facts.plug.detection) { removalSeen = true; if (jobStopAt == null) jobStopAt = nowMs }
            Input.PowerConnected -> if (facts.plug.detection) returnSeen = true
            Input.JobStarted -> if (facts.plug.detection) { returnSeen = true; if (jobStartAt == null) jobStartAt = nowMs }
            else -> Unit
        }
    }

    fun result(): SelfTestResult {
        val delays = listOfNotNull(
            if (removalAt != null && jobStopAt != null) (jobStopAt!! - removalAt!!).coerceAtLeast(0) else null,
            if (returnAt != null && jobStartAt != null) (jobStartAt!! - returnAt!!).coerceAtLeast(0) else null,
        )
        return SelfTestResult(removalSeen, sensorArmed, returnSeen, delays.maxOrNull())
    }
}

/**
 * Foreground plug watcher for the self-test screen (onboarding design section 6): `ACTION_BATTERY_CHANGED` registered
 * with the app visible, so the screen reacts at once. Forwards plug changes to [SensorController.plugChanged].
 * https://developer.android.com/reference/android/os/BatteryManager#ACTION_CHARGING
 */
class PlugWatcher(private val ctx: android.content.Context, private val onPlug: (Plug) -> Unit) {
    private var last: Plug? = null
    private val receiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, intent: android.content.Intent) {
            val plug = Plug.fromExtra(intent.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0))
            if (plug != last) {
                last = plug
                onPlug(plug)
            }
        }
    }

    fun start() {
        // Sticky intent: the first delivery is the current plug, which only sets the baseline.
        val sticky = ctx.registerReceiver(receiver, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
        last = sticky?.let { Plug.fromExtra(it.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0)) }
    }

    fun stop() {
        runCatching { ctx.unregisterReceiver(receiver) }
    }
}
