package app.outage.sensor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After a reboot (and after an app update) the sensor recovers and restarts both drivers, if the user had it on.
 * `Sensor.get` runs the recovery, which records the `REBOOT` gap (R5.4). `BOOT_COMPLETED` may start a `specialUse`
 * foreground service (https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
 * https://developer.android.com/reference/android/content/Intent#ACTION_BOOT_COMPLETED
 * https://developer.android.com/reference/android/content/Intent#ACTION_MY_PACKAGE_REPLACED
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val sensor = Sensor.get(context)
        if (sensor.isOn) sensor.start()
    }
}
