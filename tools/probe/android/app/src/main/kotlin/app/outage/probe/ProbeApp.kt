package app.outage.probe

import android.app.Application
import android.os.Build

/** Logs SESSION start, or restart when the process comes back while the sensor should be on (analysis rule, design 7). */
class ProbeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val prefs = Prefs(this)
        ProbeLog.get(this).append("SESSION", linkedMapOf(
            "kind" to if (prefs.sensorOn) "restart" else "start",
            "maker" to Build.MANUFACTURER.take(40), "brand" to Build.BRAND.take(40), "androidSdk" to Build.VERSION.SDK_INT,
            "exempt" to Facts.exempt(this), "fullScreen" to Facts.fullScreen(this),
        ))
        if (prefs.sensorOn) Scheduler.ensureScheduled(this)
    }
}
