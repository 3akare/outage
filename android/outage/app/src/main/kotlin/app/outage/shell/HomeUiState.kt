package app.outage.shell

import app.outage.alarm.AlarmState
import app.outage.sensor.NotArmedReason
import app.outage.sensor.SensorKind
import app.outage.sensor.SensorState

/** Everything the Home screen shows (R2). Pure data. */
data class HomeUiState(
    val sensor: SensorState,
    val area: AreaStatus?,
    val ageMinutes: Int?,
    val offline: Boolean,
    val todayPowerHours: Double?,
    val alarm: AlarmState?,
    val simulated: Boolean,
) {
    companion object {
        /** State before the first refresh. */
        val Initial = HomeUiState(
            sensor = SensorState(SensorKind.NOT_ARMED, NotArmedReason.NOT_AVAILABLE),
            area = null, ageMinutes = null, offline = false, todayPowerHours = null, alarm = null, simulated = false,
        )
    }
}

/** How old the area data is, as a label kind (the UI picks the string). */
sealed interface AgeLabel {
    data object JustNow : AgeLabel
    data class Minutes(val n: Int) : AgeLabel
    data class Hours(val n: Int) : AgeLabel
    data class Days(val n: Int) : AgeLabel

    companion object {
        fun of(minutes: Int): AgeLabel = when {
            minutes < 1 -> JustNow
            minutes < 60 -> Minutes(minutes)
            minutes < 60 * 24 -> Hours(minutes / 60)
            else -> Days(minutes / (60 * 24))
        }
    }
}

object HomeReducer {
    /**
     * Pure reducer (AS5). Offline never hides the sensor state or the cached area status (R2.3).
     * A missing sensor feature shows "not watching, not available". A missing power log or alarm
     * feature gives null, which hides the card (R2.4).
     * `nowWallMs` is used for the age label only.
     */
    fun reduce(
        sensor: SensorState?,
        area: AreaStatus?,
        todayPowerHours: Double?,
        alarm: AlarmState?,
        online: Boolean,
        nowWallMs: Long,
    ): HomeUiState = HomeUiState(
        sensor = sensor ?: SensorState(SensorKind.NOT_ARMED, NotArmedReason.NOT_AVAILABLE),
        area = area,
        ageMinutes = area?.let { ((nowWallMs - it.updatedAtWallMs) / 60_000L).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt() },
        offline = !online,
        todayPowerHours = todayPowerHours,
        alarm = alarm,
        simulated = area?.simulated == true,
    )
}
