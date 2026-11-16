package app.outage.ui

import app.outage.R
import app.outage.alarm.AlarmState
import app.outage.sensor.NotArmedReason
import app.outage.sensor.SensorKind
import app.outage.shell.AgeLabel
import app.outage.shell.StatusIcon
import app.outage.shell.StatusLevel

/** Maps the pure shell model to resource ids. Exhaustive `when`s, so a new level will not compile until it is mapped. */
object StatusRes {
    fun label(level: StatusLevel): Int = when (level) {
        StatusLevel.NORMAL -> R.string.status_normal
        StatusLevel.SPOT_ONLY -> R.string.status_spot_only
        StatusLevel.POSSIBLE -> R.string.status_possible
        StatusLevel.CONFIRMED -> R.string.status_confirmed
        StatusLevel.RESTORED -> R.string.status_restored
    }

    fun icon(icon: StatusIcon): Int = when (icon) {
        StatusIcon.CHECK -> R.drawable.ic_status_check
        StatusIcon.PERSON_PIN -> R.drawable.ic_status_person_pin
        StatusIcon.HELP -> R.drawable.ic_status_help
        StatusIcon.POWER_OFF -> R.drawable.ic_status_power_off
        StatusIcon.POWER_ON -> R.drawable.ic_status_power_on
    }

    /** The colour family of a level, from the theme: green on, amber possible, red out, blue back (ADR 0048). */
    fun colors(level: StatusLevel, s: StatusColors): StateColors = when (level) {
        StatusLevel.NORMAL -> s.normal
        StatusLevel.SPOT_ONLY, StatusLevel.POSSIBLE -> s.possible
        StatusLevel.CONFIRMED -> s.confirmed
        StatusLevel.RESTORED -> s.restored
    }

    fun sensorLabel(kind: SensorKind): Int = when (kind) {
        SensorKind.ARMED -> R.string.sensor_armed
        SensorKind.NOT_CHARGING -> R.string.sensor_not_charging
        SensorKind.NOT_ARMED -> R.string.sensor_not_armed
    }

    fun sensorIcon(kind: SensorKind): Int = when (kind) {
        SensorKind.ARMED -> R.drawable.ic_sensor_armed
        SensorKind.NOT_CHARGING -> R.drawable.ic_sensor_unplugged
        SensorKind.NOT_ARMED -> R.drawable.ic_sensor_not_armed
    }

    fun reason(reason: NotArmedReason): Int = when (reason) {
        NotArmedReason.NOT_SET_UP -> R.string.reason_not_set_up
        NotArmedReason.BATTERY_RESTRICTED -> R.string.reason_battery_restricted
        NotArmedReason.NOT_AVAILABLE -> R.string.reason_not_available
    }

    fun alarmLabel(state: AlarmState): Int = when (state) {
        AlarmState.OFF -> R.string.alarm_off
        AlarmState.WAITING_FOR_POWER -> R.string.alarm_waiting
        AlarmState.RINGING -> R.string.alarm_ringing
    }

    /** Resource id and the number to format into it (null for "just now"). */
    fun age(label: AgeLabel): Pair<Int, Int?> = when (label) {
        AgeLabel.JustNow -> R.string.age_just_now to null
        is AgeLabel.Minutes -> R.string.age_minutes to label.n
        is AgeLabel.Hours -> R.string.age_hours to label.n
        is AgeLabel.Days -> R.string.age_days to label.n
    }
}
