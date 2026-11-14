package app.outage.shell

import app.outage.alarm.AlarmState
import app.outage.sensor.SensorState

/**
 * What the shell reads from feature packages. Each returns null when its feature is missing, and
 * the screen then hides the card or says "not available" (design section 1).
 */
interface StatusSources {
    fun sensorState(): SensorState?
    fun areaStatus(): AreaStatus?
    fun todayPowerHours(): Double?
    fun alarmState(): AlarmState?
}

/** Used until the feature packages exist. */
object NoStatusSources : StatusSources {
    override fun sensorState(): SensorState? = null
    override fun areaStatus(): AreaStatus? = null
    override fun todayPowerHours(): Double? = null
    override fun alarmState(): AlarmState? = null
}
