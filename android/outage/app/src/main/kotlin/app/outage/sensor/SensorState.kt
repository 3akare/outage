package app.outage.sensor

/** Why the sensor is not armed. The shell only displays it; the sensor feature decides it. */
enum class NotArmedReason { NOT_SET_UP, BATTERY_RESTRICTED, NOT_AVAILABLE }

enum class SensorKind { ARMED, NOT_CHARGING, NOT_ARMED }

/** Sensor state shown on Home (app-shell R2.1). `reason` is set only for NOT_ARMED. */
data class SensorState(val kind: SensorKind, val reason: NotArmedReason? = null)
