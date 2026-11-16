package app.outage.alarm

import android.app.NotificationManager
import app.outage.R

/**
 * Notification channel definitions as data (alerts-and-light-alarm design 3.2, test L11). Pure: the Android calls that
 * apply them live in [ChannelSetup]. `alerts` and `alerts-quiet` are the push channels the Worker names in each message
 * (`workers/api/src/alerts/planner.ts`).
 * https://developer.android.com/reference/android/app/NotificationChannel
 */
data class ChannelSpec(
    val id: String,
    val nameRes: Int,
    val importance: Int,
    /** True when the channel plays its own sound. */
    val sound: Boolean,
    /** True when the channel's audio attributes use the alarm usage (`AudioAttributes.USAGE_ALARM`). */
    val alarmUsage: Boolean,
    val vibrate: Boolean,
)

object ChannelSpecs {
    const val POWER_CHECK = "power-check"
    const val LIGHT_ALARM = "light-alarm"
    const val ALERTS = "alerts"
    const val ALERTS_QUIET = "alerts-quiet"

    /** R1.2: no sound, no vibration, importance at most default. */
    val powerCheck = ChannelSpec(POWER_CHECK, R.string.alarm_channel_prompt, NotificationManager.IMPORTANCE_DEFAULT, sound = false, alarmUsage = false, vibrate = false)

    /**
     * R3.4: alarm usage and the highest importance a channel can start with. The audio itself is played by
     * [LightAlarm] in the running service, so the channel carries the usage but no second sound.
     */
    val lightAlarm = ChannelSpec(LIGHT_ALARM, R.string.alarm_channel_light_alarm, NotificationManager.IMPORTANCE_HIGH, sound = false, alarmUsage = true, vibrate = true)

    val alerts = ChannelSpec(ALERTS, R.string.alarm_channel_alerts, NotificationManager.IMPORTANCE_HIGH, sound = true, alarmUsage = false, vibrate = true)
    val alertsQuiet = ChannelSpec(ALERTS_QUIET, R.string.alarm_channel_alerts_quiet, NotificationManager.IMPORTANCE_LOW, sound = false, alarmUsage = false, vibrate = false)

    val all = listOf(powerCheck, lightAlarm, alerts, alertsQuiet)
}
