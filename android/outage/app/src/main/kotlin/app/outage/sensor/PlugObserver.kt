package app.outage.sensor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build

/**
 * sensor-android R13.1 (amended for demo-mode task 1): plug changes for a visible screen, within a second, with no Job,
 * no Outbox and no event record. Judge mode uses it to see the judge unplug (demo-mode R4.2).
 */
interface PlugObserver {
    /** Reports the current plug once, then each change of [Plug]. False when the receiver cannot be registered. */
    fun start(onChange: (Plug) -> Unit): Boolean
    fun stop()
}

/** Reports a [Plug] only when it differs from the last one, so battery level ticks are dropped. Pure. */
class PlugChangeFilter(private val onChange: (Plug) -> Unit) {
    private var last: Plug? = null

    fun offer(plug: Plug) {
        if (plug == last) return
        last = plug
        onChange(plug)
    }
}

/**
 * `ACTION_BATTERY_CHANGED` is sticky and can only be received by a receiver registered in code, not in the manifest:
 * https://developer.android.com/reference/android/content/Intent#ACTION_BATTERY_CHANGED
 * `EXTRA_PLUGGED`: https://developer.android.com/reference/android/os/BatteryManager#EXTRA_PLUGGED
 */
class AndroidPlugObserver(context: Context) : PlugObserver {
    private val ctx = context.applicationContext
    private var receiver: BroadcastReceiver? = null

    override fun start(onChange: (Plug) -> Unit): Boolean {
        stop()
        val filter = PlugChangeFilter(onChange)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                filter.offer(Plug.fromExtra(intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0))
            }
        }
        return try {
            val f = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            // A system broadcast; NOT_EXPORTED keeps other apps out.
            // https://developer.android.com/reference/android/content/Context#registerReceiver(android.content.BroadcastReceiver,%20android.content.IntentFilter,%20int)
            val sticky = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) ctx.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED)
            else ctx.registerReceiver(r, f)
            receiver = r
            sticky?.let { filter.offer(Plug.fromExtra(it.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0))) }
            true
        } catch (_: RuntimeException) {
            false
        }
    }

    override fun stop() {
        receiver?.let { runCatching { ctx.unregisterReceiver(it) } }
        receiver = null
    }
}

/**
 * sensor-android R13.2, R13.3: set while a demo session is open. The "Power just went?" prompt checks [suppressPrompt]
 * before it shows for a real event; real events are still recorded. A plain in-process flag, never stored.
 */
object DemoFlag {
    const val BACKGROUND_LIMIT_MS = 30_000L

    @Volatile private var open = false
    @Volatile private var backgroundSinceMs: Long? = null

    fun enter() {
        open = true
        backgroundSinceMs = null
    }

    fun leave() {
        open = false
        backgroundSinceMs = null
    }

    fun backgrounded(nowMs: Long) {
        if (open) backgroundSinceMs = nowMs
    }

    fun foregrounded() {
        backgroundSinceMs = null
    }

    /** True while a demo is open, until the app has been in the background for more than 30 seconds. */
    fun suppressPrompt(nowMs: Long): Boolean {
        if (!open) return false
        val since = backgroundSinceMs ?: return true
        if (nowMs - since > BACKGROUND_LIMIT_MS) {
            leave()
            return false
        }
        return true
    }
}
